from __future__ import annotations

"""Background Plex library sync.

Maintains a local SQLite mirror of the Plex library so the My Media UI never
has to wait on Plex. The sync runs on startup and then on a configurable
interval (default 10 minutes).

Public API
----------
attach_plex_sync(app)   — call from lifecycle.py; starts background tasks
plex_sync_once(app)     — full library sync (also usable as one-shot trigger)
plex_item_refresh(app, item_id, progress_cb)
                        — synchronous per-item refresh with optional SSE progress
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import AsyncIterator, Callable, Awaitable

import httpx
from fastapi import FastAPI
from sqlalchemy import delete, select

from .db import PlexLibraryItem, PlexSyncState
from .routes.plex import (
    _PLEX_HEADERS,
    _get_children,
    _get_sections,
    _load_servers,
    _save_servers,
    _plex_params,
)

logger = logging.getLogger(__name__)

SYNC_INTERVAL_SECONDS = int(os.environ.get("PLEX_SYNC_INTERVAL", "600"))

ProgressCallback = Callable[[str, int, int, str], Awaitable[None]]


# ---------------------------------------------------------------------------
# Item conversion (mirrors _plex_item in media_server.py)
# ---------------------------------------------------------------------------

def _tmdb_id_from_guids(guids: list[dict]) -> int | None:
    for g in guids:
        gid = g.get("id", "")
        if gid.startswith("tmdb://"):
            try:
                return int(gid[7:])
            except ValueError:
                pass
    return None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Sync state helpers
# ---------------------------------------------------------------------------

async def _get_sync_state(session, server_id: str = "default") -> PlexSyncState:
    row = await session.get(PlexSyncState, server_id)
    if row is None:
        row = PlexSyncState(server_id=server_id, last_synced_at=None,
                            is_syncing=False, current_phase=None, error=None)
        session.add(row)
        await session.commit()
    return row


async def _set_phase(app: FastAPI, phase: str, server_id: str = "default") -> None:
    async with app.state.Session() as session:
        row = await _get_sync_state(session, server_id)
        row.is_syncing = True
        row.current_phase = phase
        row.error = None
        await session.commit()


async def _set_done(app: FastAPI, server_id: str = "default") -> None:
    async with app.state.Session() as session:
        row = await _get_sync_state(session, server_id)
        row.is_syncing = False
        row.current_phase = "done"
        row.last_synced_at = _now()
        row.error = None
        await session.commit()


async def _set_error(app: FastAPI, error: str, server_id: str = "default") -> None:
    async with app.state.Session() as session:
        row = await _get_sync_state(session, server_id)
        row.is_syncing = False
        row.current_phase = None
        row.error = error
        await session.commit()


# ---------------------------------------------------------------------------
# Upsert helper
# ---------------------------------------------------------------------------

async def _upsert_item(session, *, id: str, title: str, year: int | None,
                       type: str, item_index: int | None, tmdb_id: int | None,
                       leaf_count: int | None, child_count: int | None,
                       parent_id: str | None, collection_ids: str | None = None,
                       server_id: str = "default",
                       library_title: str | None = None) -> None:
    now = _now()
    existing = await session.get(PlexLibraryItem, id)
    if existing:
        existing.server_id = server_id
        existing.title = title
        existing.year = year
        existing.type = type
        existing.item_index = item_index
        existing.tmdb_id = tmdb_id
        existing.leaf_count = leaf_count
        existing.child_count = child_count
        existing.parent_id = parent_id
        if collection_ids is not None:
            existing.collection_ids = collection_ids
        if library_title is not None:
            existing.library_title = library_title
        existing.synced_at = now
    else:
        session.add(PlexLibraryItem(
            id=id, server_id=server_id, title=title, year=year, type=type,
            item_index=item_index, tmdb_id=tmdb_id, leaf_count=leaf_count,
            child_count=child_count, parent_id=parent_id,
            collection_ids=collection_ids or "[]",
            library_title=library_title, synced_at=now,
        ))


def _item_from_plex(raw: dict, type_override: str | None = None,
                    parent_id: str | None = None) -> dict:
    guids = raw.get("Guid") or []
    return {
        "id": str(raw.get("ratingKey", "")),
        "title": raw.get("title", ""),
        "year": raw.get("year"),
        "type": type_override or raw.get("type", ""),
        "item_index": raw.get("index"),
        "tmdb_id": _tmdb_id_from_guids(guids),
        "leaf_count": raw.get("leafCount"),
        "child_count": raw.get("childCount"),
        "parent_id": parent_id,
    }


# ---------------------------------------------------------------------------
# Full library sync
# ---------------------------------------------------------------------------

async def _sync_one_server(app: FastAPI, server: dict,
                           progress_cb: ProgressCallback | None = None) -> None:
    """Sync a single configured server into SQLite."""
    server_id = server["id"]
    base_url = server["base_url"]
    token = server["token"]
    movie_libraries: list[str] = server.get("movie_libraries", [])
    tv_libraries: list[str] = server.get("tv_libraries", [])

    async def _progress(phase: str, done: int, total: int, message: str) -> None:
        await _set_phase(app, phase, server_id)
        if progress_cb:
            await progress_cb(phase, done, total, message)

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            sections = await _get_sections(client, base_url, token)

            # ── Phase 1: Movies ──────────────────────────────────────────────
            await _progress("movies", 0, 0, "Fetching movies…")
            # list of (raw_item_dict, section_title) pairs
            raw_movies: list[tuple[dict, str]] = []
            raw_collections: list[tuple[dict, str]] = []

            for sec in sections:
                if sec.get("title") not in movie_libraries or sec.get("type") != "movie":
                    continue
                sec_key = sec.get("key", "")
                sec_title: str = sec.get("title", "")
                try:
                    r = await client.get(
                        f"{base_url}/library/sections/{sec_key}/all",
                        params=_plex_params(token, includeGuids="1"),
                        headers=_PLEX_HEADERS, timeout=60.0,
                    )
                    r.raise_for_status()
                    raw_movies.extend(
                        (item, sec_title)
                        for item in r.json().get("MediaContainer", {}).get("Metadata", [])
                    )
                except Exception as e:
                    logger.warning("plex_sync[%s]: failed to fetch movies section %s: %s",
                                   server_id, sec_key, e)

                try:
                    r = await client.get(
                        f"{base_url}/library/sections/{sec_key}/collections",
                        params=_plex_params(token, includeGuids="1"),
                        headers=_PLEX_HEADERS, timeout=60.0,
                    )
                    r.raise_for_status()
                    raw_collections.extend(
                        (item, sec_title)
                        for item in r.json().get("MediaContainer", {}).get("Metadata", [])
                    )
                except Exception as e:
                    logger.warning("plex_sync[%s]: failed to fetch collections section %s: %s",
                                   server_id, sec_key, e)

            async with app.state.Session() as session:
                for raw, sec_title in raw_movies:
                    d = _item_from_plex(raw, type_override="movie")
                    if d["id"]:
                        await _upsert_item(session, **d, collection_ids="[]",
                                           server_id=server_id, library_title=sec_title)
                await session.commit()

            # ── Phase 2: Shows ───────────────────────────────────────────────
            await _progress("shows", 0, 0, "Fetching TV shows…")
            raw_shows: list[tuple[dict, str]] = []

            for sec in sections:
                if sec.get("title") not in tv_libraries or sec.get("type") != "show":
                    continue
                sec_key = sec.get("key", "")
                sec_title = sec.get("title", "")
                try:
                    r = await client.get(
                        f"{base_url}/library/sections/{sec_key}/all",
                        params=_plex_params(token, includeGuids="1"),
                        headers=_PLEX_HEADERS, timeout=60.0,
                    )
                    r.raise_for_status()
                    raw_shows.extend(
                        (item, sec_title)
                        for item in r.json().get("MediaContainer", {}).get("Metadata", [])
                    )
                except Exception as e:
                    logger.warning("plex_sync[%s]: failed to fetch shows section %s: %s",
                                   server_id, sec_key, e)

            async with app.state.Session() as session:
                for raw, sec_title in raw_shows:
                    d = _item_from_plex(raw, type_override="show")
                    if d["id"]:
                        await _upsert_item(session, **d, server_id=server_id,
                                           library_title=sec_title)
                await session.commit()

            # ── Phase 3: Collections ─────────────────────────────────────────
            await _progress("collections", 0, 0, "Fetching collections…")

            async with app.state.Session() as session:
                for raw, sec_title in raw_collections:
                    d = _item_from_plex(raw, type_override="collection")
                    if d["id"]:
                        await _upsert_item(session, **d, server_id=server_id,
                                           library_title=sec_title)
                await session.commit()

            # ── Phase 4: Collection children (builds movie→collection map) ───
            total_colls = len(raw_collections)
            await _progress("collection_children", 0, total_colls,
                            "Building collection membership…")

            movie_to_colls: dict[str, set[str]] = {}

            for i, (coll_raw, _sec_title) in enumerate(raw_collections):
                coll_id = str(coll_raw.get("ratingKey", ""))
                coll_title = coll_raw.get("title", "")
                if not coll_id:
                    continue
                await _progress("collection_children", i, total_colls,
                                f"Indexing: {coll_title}")
                try:
                    children = await _get_children(client, base_url, token, coll_id)
                    for child in children:
                        movie_id = str(child.get("ratingKey", ""))
                        if movie_id:
                            movie_to_colls.setdefault(movie_id, set()).add(coll_id)
                except Exception as e:
                    logger.warning("plex_sync[%s]: failed to fetch children of collection %s: %s",
                                   server_id, coll_id, e)

            async with app.state.Session() as session:
                for movie_id, coll_ids in movie_to_colls.items():
                    row = await session.get(PlexLibraryItem, movie_id)
                    if row:
                        row.collection_ids = json.dumps(sorted(coll_ids))
                        row.synced_at = _now()
                await session.commit()

            # ── Phase 5: Seasons ─────────────────────────────────────────────
            total_shows = len(raw_shows)
            await _progress("seasons", 0, total_shows, "Fetching seasons…")

            for i, (show_raw, _sec_title) in enumerate(raw_shows):
                show_id = str(show_raw.get("ratingKey", ""))
                show_title = show_raw.get("title", "")
                if not show_id:
                    continue
                await _progress("seasons", i, total_shows, f"Seasons: {show_title}")
                try:
                    seasons = await _get_children(client, base_url, token, show_id)
                    async with app.state.Session() as session:
                        for raw in seasons:
                            d = _item_from_plex(raw, type_override="season",
                                                parent_id=show_id)
                            if d["id"]:
                                await _upsert_item(session, **d, server_id=server_id)
                        await session.commit()
                except Exception as e:
                    logger.warning("plex_sync[%s]: failed to fetch seasons for show %s: %s",
                                   server_id, show_id, e)

        await _progress("done", 0, 0, "Done")
        await _set_done(app, server_id)
        if progress_cb:
            await progress_cb("done", 0, 0, "Sync complete")
        logger.info("plex_sync[%s]: full sync complete", server_id)

    except Exception as e:
        err = str(e)
        logger.error("plex_sync[%s]: sync failed: %s", server_id, err)
        await _set_error(app, err, server_id)
        if progress_cb:
            await progress_cb("error", 0, 0, f"Sync failed: {err}")


async def plex_sync_once(app: FastAPI,
                         server_id: str | None = None,
                         progress_cb: ProgressCallback | None = None) -> None:
    """Sync all configured Plex servers (or a single one if server_id given)."""
    cfg = app.state.cfg
    servers = _load_servers(cfg.data_dir)
    plex_servers = [s for s in servers if s.get("type") == "plex"]

    if server_id is not None:
        plex_servers = [s for s in plex_servers if s["id"] == server_id]

    if not plex_servers:
        logger.warning("plex_sync: no Plex servers configured")
        return

    for server in plex_servers:
        await _sync_one_server(app, server, progress_cb)


# ---------------------------------------------------------------------------
# Per-item synchronous refresh
# ---------------------------------------------------------------------------

async def plex_item_refresh(app: FastAPI, item_id: str,
                            progress_cb: ProgressCallback | None = None) -> None:
    """Synchronously refresh a single item and its children from Plex.

    - collection  → refreshes collection row + all child movies + updates collection_ids
    - show        → refreshes show row + all seasons
    - season      → refreshes season row + all episodes
    - movie/episode → refreshes just the single item
    """
    cfg = app.state.cfg
    servers = _load_servers(cfg.data_dir)
    plex_servers = [s for s in servers if s.get("type") == "plex"]
    if not plex_servers:
        raise RuntimeError("No Plex settings configured")
    # Use the server_id from the cached item if available, else first server
    server = plex_servers[0]
    async with app.state.Session() as _s:
        cached = await _s.get(PlexLibraryItem, item_id)
        if cached and cached.server_id:
            matched = next((s for s in plex_servers if s["id"] == cached.server_id), None)
            if matched:
                server = matched
    base_url = server["base_url"]
    token = server["token"]
    server_id = server["id"]

    async def _cb(phase: str, done: int, total: int, message: str) -> None:
        if progress_cb:
            await progress_cb(phase, done, total, message)

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Fetch the item's own metadata first
        try:
            r = await client.get(
                f"{base_url}/library/metadata/{item_id}",
                params=_plex_params(token, includeGuids="1"),
                headers=_PLEX_HEADERS,
            )
            r.raise_for_status()
            metadata_list = r.json().get("MediaContainer", {}).get("Metadata", [])
            if not metadata_list:
                raise RuntimeError(f"Item {item_id} not found in Plex")
            raw = metadata_list[0]
        except Exception as e:
            raise RuntimeError(f"Failed to fetch item {item_id} from Plex: {e}") from e

        item_type = raw.get("type", "")
        item_title = raw.get("title", "")

        await _cb(item_type, 0, 0, f"Refreshing {item_title}…")

        # Upsert the item itself
        async with app.state.Session() as session:
            existing = await session.get(PlexLibraryItem, item_id)
            parent_id = existing.parent_id if existing else None
            d = _item_from_plex(raw, parent_id=parent_id)
            if d["id"]:
                await _upsert_item(session, **d, server_id=server_id)
            await session.commit()

        if item_type == "collection":
            # Refresh children + rebuild collection_ids on movies
            children = await _get_children(client, base_url, token, item_id)
            movie_ids: list[str] = []
            async with app.state.Session() as session:
                for i, child_raw in enumerate(children):
                    await _cb("collection_children", i, len(children),
                              child_raw.get("title", ""))
                    d = _item_from_plex(child_raw, type_override="movie")
                    if d["id"]:
                        movie_ids.append(d["id"])
                        await _upsert_item(session, **d, server_id=server_id)
                await session.commit()

            # Update collection_ids on each movie
            async with app.state.Session() as session:
                for movie_id in movie_ids:
                    row = await session.get(PlexLibraryItem, movie_id)
                    if row:
                        existing_ids: list[str] = json.loads(row.collection_ids or "[]")
                        if item_id not in existing_ids:
                            existing_ids.append(item_id)
                        row.collection_ids = json.dumps(existing_ids)
                        row.synced_at = _now()
                await session.commit()
            await _cb("done", len(movie_ids), len(movie_ids),
                      f"Refreshed {len(movie_ids)} movies")

        elif item_type == "show":
            seasons = await _get_children(client, base_url, token, item_id)
            async with app.state.Session() as session:
                for i, raw_season in enumerate(seasons):
                    await _cb("seasons", i, len(seasons),
                              raw_season.get("title", f"Season {i+1}"))
                    d = _item_from_plex(raw_season, type_override="season",
                                        parent_id=item_id)
                    if d["id"]:
                        await _upsert_item(session, **d, server_id=server_id)
                await session.commit()
            await _cb("done", len(seasons), len(seasons),
                      f"Refreshed {len(seasons)} seasons")

        elif item_type == "season":
            episodes = await _get_children(client, base_url, token, item_id)
            async with app.state.Session() as session:
                for i, raw_ep in enumerate(episodes):
                    await _cb("episodes", i, len(episodes),
                              raw_ep.get("title", f"Episode {i+1}"))
                    d = _item_from_plex(raw_ep, type_override="episode",
                                        parent_id=item_id)
                    if d["id"]:
                        await _upsert_item(session, **d, server_id=server_id)
                await session.commit()
            await _cb("done", len(episodes), len(episodes),
                      f"Refreshed {len(episodes)} episodes")

        else:
            # movie or episode — already upserted above
            await _cb("done", 1, 1, f"Refreshed {item_title}")


# ---------------------------------------------------------------------------
# SSE helper
# ---------------------------------------------------------------------------

async def sse_item_refresh(app: FastAPI, item_id: str) -> AsyncIterator[str]:
    """Async generator yielding SSE-formatted progress events for a per-item refresh."""
    queue: asyncio.Queue[dict | None] = asyncio.Queue()

    async def _cb(phase: str, done: int, total: int, message: str) -> None:
        await queue.put({"phase": phase, "done": done, "total": total,
                         "message": message})

    async def _run() -> None:
        try:
            await plex_item_refresh(app, item_id, progress_cb=_cb)
        except Exception as e:
            await queue.put({"phase": "error", "done": 0, "total": 0,
                             "message": str(e)})
        finally:
            await queue.put(None)  # sentinel

    task = asyncio.create_task(_run())
    try:
        while True:
            event = await queue.get()
            if event is None:
                break
            yield f"data: {json.dumps(event)}\n\n"
    finally:
        task.cancel()


# ---------------------------------------------------------------------------
# Background loop
# ---------------------------------------------------------------------------

async def _plex_sync_loop(app: FastAPI) -> None:
    while True:
        await asyncio.sleep(SYNC_INTERVAL_SECONDS)
        try:
            await plex_sync_once(app)
        except Exception as e:
            logger.error("plex_sync: background loop error: %s", e)


async def _enrich_server_names(app: FastAPI) -> None:
    """Fetch real server names for any servers still showing the generic migration default."""
    cfg = app.state.cfg
    servers = _load_servers(cfg.data_dir)
    updated = False
    for server in servers:
        if server.get("name") in ("Plex", "", None) and server.get("type") == "plex":
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    r = await client.get(
                        f"{server['base_url']}/",
                        params={"X-Plex-Token": server["token"]},
                        headers={"Accept": "application/json", "X-Plex-Product": "OpenPoster"},
                    )
                    if r.is_success:
                        name = r.json().get("MediaContainer", {}).get("friendlyName")
                        if name:
                            server["name"] = name
                            updated = True
                            logger.info("plex_sync: enriched server name for %s → %s",
                                        server["id"], name)
            except Exception as e:
                logger.warning("plex_sync: could not fetch server name for %s: %s",
                               server["id"], e)
    if updated:
        _save_servers(cfg.data_dir, servers)


def attach_plex_sync(app: FastAPI) -> None:
    """Attach background Plex sync tasks. Call from lifecycle.py after DB is ready."""
    # Enrich server names for any auto-migrated servers with generic "Plex" name
    asyncio.create_task(_enrich_server_names(app))
    # Fire an initial sync immediately (non-blocking)
    app.state.plex_sync_task = asyncio.create_task(plex_sync_once(app))
    app.state.plex_sync_loop_task = asyncio.create_task(_plex_sync_loop(app))
