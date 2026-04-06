from __future__ import annotations

"""Media-server-agnostic adapter.

Currently supports Plex only. Imports Plex-specific helpers from .plex.
All endpoints require admin authentication.

The library is now backed by a SQLite mirror (PlexLibraryItem / PlexSyncState)
maintained by plex_sync.py. The thumb/art proxy endpoints remain unchanged.
"""

import json
import logging
import os
import time
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

import httpx
from fastapi import APIRouter, Query, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select

from ..db import PlexLibraryItem, PlexSyncState
from ..errors import http_error
from .plex import (
    _PLEX_HEADERS,
    _get_children,
    _load_servers,
    _load_settings,
    _plex_params,
    _sniff_content_type,
)
from .auth import _token_hash

# ---------------------------------------------------------------------------
# In-memory token validation cache (avoids a DB hit per thumbnail request)
# ---------------------------------------------------------------------------

_VALID_TOKENS: dict[str, float] = {}  # token_hash -> expiry unix timestamp
_TOKEN_CACHE_TTL = 300  # seconds

router = APIRouter()


# ---------------------------------------------------------------------------
# Auth helper for query-param token (used by thumb endpoint for <img> tags)
# ---------------------------------------------------------------------------

async def _check_token(request: Request, t: str) -> None:
    """Check admin token from ?t= query param (mirrors require_admin logic).

    Validated tokens are cached in memory for 5 minutes so that bulk
    thumbnail requests (one per image) don't each hit the database.
    """
    provided = (t or "").strip()
    if not provided:
        raise http_error(401, "unauthorized", "missing token")

    # Fast path: legacy static admin token (env var)
    legacy = os.environ.get("OPENPOSTER_ADMIN_TOKEN")
    if legacy and provided == legacy:
        return

    h = _token_hash(provided)
    now_ts = time.time()

    # Fast path: recently validated session token (in-memory cache)
    if _VALID_TOKENS.get(h, 0) > now_ts:
        return

    # Slow path: DB lookup (only runs once per token per 5 minutes)
    from ..db import AdminSession

    async with request.app.state.Session() as session:
        row = await session.get(AdminSession, h)
        if row is None:
            raise http_error(403, "forbidden", "invalid admin token")

        now_dt = datetime.now(timezone.utc)
        try:
            exp = datetime.fromisoformat(row.expires_at.replace("Z", "+00:00"))
        except Exception:
            exp = None
        if exp and now_dt >= exp:
            await session.delete(row)
            await session.commit()
            raise http_error(403, "forbidden", "admin session expired")

    # Cache the successful validation
    _VALID_TOKENS[h] = now_ts + _TOKEN_CACHE_TTL


# ---------------------------------------------------------------------------
# Item serialisation helpers
# ---------------------------------------------------------------------------

def _db_item_to_dict(item: PlexLibraryItem) -> dict:
    """Serialise a PlexLibraryItem row to the API dict format."""
    return {
        "id": item.id,
        "title": item.title,
        "year": item.year,
        "type": item.type,
        "index": item.item_index,
        "tmdb_id": item.tmdb_id,
        "leaf_count": item.leaf_count,
        "child_count": item.child_count,
        "collection_ids": json.loads(item.collection_ids or "[]"),
        "library_title": item.library_title,
    }


def _tmdb_id_from_guids(guids: list[dict]) -> int | None:
    for g in guids:
        gid = g.get("id", "")
        if gid.startswith("tmdb://"):
            try:
                return int(gid[7:])
            except ValueError:
                pass
    return None


def _plex_item(item: dict, type_override: str | None = None) -> dict:
    """Convert a raw Plex API dict to API format (used only in live-fallback paths)."""
    guids = item.get("Guid") or []
    return {
        "id": str(item.get("ratingKey", "")),
        "title": item.get("title", ""),
        "year": item.get("year"),
        "type": type_override or item.get("type", ""),
        "index": item.get("index"),
        "tmdb_id": _tmdb_id_from_guids(guids),
        "leaf_count": item.get("leafCount"),
        "child_count": item.get("childCount"),
        "collection_ids": [],  # not known from live fetch
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/admin/media-server/library")
async def media_server_library(request: Request, server_id: str = Query(default=None)):
    """Return the user's media server library as { movies, shows, collections }.

    Reads from the local SQLite mirror. Pass ?server_id= to scope to a specific
    server; omit to use the first configured server.
    """
    from .auth import require_admin
    await require_admin(request)

    cfg = request.app.state.cfg
    # Resolve effective server_id
    if server_id is None:
        servers = _load_servers(cfg.data_dir)
        server_id = servers[0]["id"] if servers else "default"

    async with request.app.state.Session() as session:
        movies_rows = (await session.scalars(
            select(PlexLibraryItem).where(
                PlexLibraryItem.type == "movie",
                PlexLibraryItem.server_id == server_id,
            )
        )).all()
        shows_rows = (await session.scalars(
            select(PlexLibraryItem).where(
                PlexLibraryItem.type == "show",
                PlexLibraryItem.server_id == server_id,
            )
        )).all()
        colls_rows = (await session.scalars(
            select(PlexLibraryItem).where(
                PlexLibraryItem.type == "collection",
                PlexLibraryItem.server_id == server_id,
            )
        )).all()
        sync = await session.get(PlexSyncState, server_id)

    return {
        "movies": [_db_item_to_dict(r) for r in movies_rows],
        "shows": [_db_item_to_dict(r) for r in shows_rows],
        "collections": [_db_item_to_dict(r) for r in colls_rows],
        "synced_at": sync.last_synced_at if sync else None,
        "is_syncing": sync.is_syncing if sync else False,
    }


@router.get("/admin/media-server/items/{item_id}/children")
async def media_server_children(request: Request, item_id: str):
    """Return children for a given item.

    For collections: returns movies that have this collection_id in their
    collection_ids JSON array.
    For shows/seasons: returns rows where parent_id == item_id.
    Falls back to a live Plex call if no rows are found (e.g. episodes not
    yet cached via per-item refresh).
    """
    from .auth import require_admin
    await require_admin(request)

    async with request.app.state.Session() as session:
        # Determine item type so we know which query to use
        item_row = await session.get(PlexLibraryItem, item_id)

        if item_row and item_row.type == "collection":
            # Movies belonging to this collection (stored as JSON array on each movie)
            children_rows = (await session.scalars(
                select(PlexLibraryItem).where(
                    PlexLibraryItem.type == "movie",
                    func.instr(PlexLibraryItem.collection_ids, '"' + item_id + '"') > 0,
                )
            )).all()
        else:
            # Shows → seasons, seasons → episodes (parent_id relationship)
            children_rows = (await session.scalars(
                select(PlexLibraryItem).where(PlexLibraryItem.parent_id == item_id)
            )).all()

    if children_rows:
        return {"items": [_db_item_to_dict(r) for r in children_rows]}

    # Fallback to live Plex (episodes are not pre-cached; new items not yet synced)
    cfg = request.app.state.cfg
    servers = _load_servers(cfg.data_dir)
    plex_servers = [s for s in servers if s.get("type") == "plex"]
    if not plex_servers:
        return {"items": []}
    fallback_server = plex_servers[0]
    base_url = fallback_server["base_url"]
    token = fallback_server["token"]

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            children = await _get_children(client, base_url, token, item_id)
        except Exception as e:
            raise http_error(502, "plex_error", f"Could not fetch children: {e}")

    return {"items": [_plex_item(c) for c in children]}


@router.get("/admin/media-server/sync/status")
async def media_server_sync_status(request: Request, server_id: str = Query(default=None)):
    """Return the current media server sync state."""
    from .auth import require_admin
    await require_admin(request)

    cfg = request.app.state.cfg
    if server_id is None:
        servers = _load_servers(cfg.data_dir)
        server_id = servers[0]["id"] if servers else "default"

    async with request.app.state.Session() as session:
        sync = await session.get(PlexSyncState, server_id)
        item_count = (await session.execute(
            select(func.count()).select_from(PlexLibraryItem).where(
                PlexLibraryItem.server_id == server_id
            )
        )).scalar_one()

    if sync is None:
        return {
            "is_syncing": False,
            "last_synced_at": None,
            "current_phase": None,
            "error": None,
            "item_count": item_count,
        }

    return {
        "is_syncing": sync.is_syncing,
        "last_synced_at": sync.last_synced_at,
        "current_phase": sync.current_phase,
        "error": sync.error,
        "item_count": item_count,
    }


class SyncTriggerRequest(BaseModel):
    server_id: str | None = None


@router.post("/admin/media-server/sync/trigger")
async def media_server_sync_trigger(request: Request, body: SyncTriggerRequest | None = None):
    """Trigger a background full library sync.

    Returns {"started": true} if a new sync was started, or
    {"started": false, "reason": "already_running"} if one is in progress.
    """
    from .auth import require_admin
    await require_admin(request)

    server_id = body.server_id if body else None

    app = request.app
    existing = getattr(app.state, "plex_sync_task", None)
    if existing and not existing.done():
        return {"started": False, "reason": "already_running"}

    from ..plex_sync import plex_sync_once
    import asyncio
    app.state.plex_sync_task = asyncio.create_task(plex_sync_once(app, server_id=server_id))
    return {"started": True}


@router.get("/admin/media-server/items/{item_id}/refresh")
async def media_server_item_refresh(request: Request, item_id: str):
    """Stream SSE progress events while refreshing a single item from Plex."""
    from .auth import require_admin
    await require_admin(request)

    from ..plex_sync import sse_item_refresh

    return StreamingResponse(
        sse_item_refresh(request.app, item_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/admin/media-server/thumb/{item_id}")
async def media_server_thumb(request: Request, item_id: str, t: str = Query(default="")):
    """Proxy thumbnail image from Plex. Token passed via ?t= query param.

    Images are cached to disk after the first fetch.
    """
    await _check_token(request, t)

    cfg = request.app.state.cfg

    # Serve from disk cache if available
    cache_path = _thumb_cache_path(cfg.data_dir, item_id)
    if cache_path.exists():
        data = cache_path.read_bytes()
        return Response(
            content=data,
            media_type=_sniff_content_type(data),
            headers={"Cache-Control": "no-store"},
        )

    servers = _load_servers(cfg.data_dir)
    plex_srv = next((s for s in servers if s.get("type") == "plex"), None)
    if not plex_srv:
        return Response(status_code=404)

    base_url = plex_srv["base_url"]
    token = plex_srv["token"]

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            r = await client.get(
                f"{base_url}/library/metadata/{item_id}/thumb",
                params=_plex_params(token),
                headers=_PLEX_HEADERS,
            )
            if r.status_code == 404:
                return Response(status_code=404)
            r.raise_for_status()
            data = r.content
            try:
                cache_path.write_bytes(data)
            except Exception:
                pass
            return Response(
                content=data,
                media_type=_sniff_content_type(data),
                headers={"Cache-Control": "no-store"},
            )
    except Exception:
        return Response(status_code=404)


@router.get("/admin/media-server/art/{item_id}")
async def media_server_art(request: Request, item_id: str, t: str = Query(default="")):
    """Proxy background art image from Plex. Token passed via ?t= query param.

    Images are cached to disk after the first fetch.
    """
    await _check_token(request, t)

    cfg = request.app.state.cfg

    cache_path = _art_cache_path(cfg.data_dir, item_id)
    if cache_path.exists():
        data = cache_path.read_bytes()
        return Response(
            content=data,
            media_type=_sniff_content_type(data),
            headers={"Cache-Control": "no-store"},
        )

    servers = _load_servers(cfg.data_dir)
    plex_srv = next((s for s in servers if s.get("type") == "plex"), None)
    if not plex_srv:
        return Response(status_code=404)

    base_url = plex_srv["base_url"]
    token = plex_srv["token"]

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            r = await client.get(
                f"{base_url}/library/metadata/{item_id}/art",
                params=_plex_params(token),
                headers=_PLEX_HEADERS,
            )
            if r.status_code == 404:
                return Response(status_code=404)
            r.raise_for_status()
            data = r.content
            try:
                cache_path.write_bytes(data)
            except Exception:
                pass
            return Response(
                content=data,
                media_type=_sniff_content_type(data),
                headers={"Cache-Control": "no-store"},
            )
    except Exception:
        return Response(status_code=404)


@router.delete("/admin/media-server/thumb/{item_id}/cache")
async def media_server_thumb_cache_bust(request: Request, item_id: str):
    """Delete the cached thumbnail for an item so the next request re-fetches from Plex."""
    from .auth import require_admin
    await require_admin(request)

    cfg = request.app.state.cfg
    try:
        _thumb_cache_path(cfg.data_dir, item_id).unlink(missing_ok=True)
    except Exception:
        pass
    return {"ok": True}


@router.delete("/admin/media-server/art/{item_id}/cache")
async def media_server_art_cache_bust(request: Request, item_id: str):
    """Delete the cached background art for an item so the next request re-fetches from Plex."""
    from .auth import require_admin
    await require_admin(request)

    cfg = request.app.state.cfg
    try:
        _art_cache_path(cfg.data_dir, item_id).unlink(missing_ok=True)
    except Exception:
        pass
    return {"ok": True}


@router.get("/admin/media-server/logo/{item_id}")
async def media_server_logo(request: Request, item_id: str, t: str = Query(default="")):
    """Proxy clearLogo image from Plex. Returns 404 if none exists or server is older than PMS 1.43.

    Images are cached to disk after the first fetch.
    """
    await _check_token(request, t)

    cfg = request.app.state.cfg

    cache_path = _logo_cache_path(cfg.data_dir, item_id)
    if cache_path.exists():
        data = cache_path.read_bytes()
        return Response(
            content=data,
            media_type=_sniff_content_type(data),
            headers={"Cache-Control": "no-store"},
        )

    servers = _load_servers(cfg.data_dir)
    plex_srv = next((s for s in servers if s.get("type") == "plex"), None)
    if not plex_srv:
        return Response(status_code=404)

    base_url = plex_srv["base_url"]
    token = plex_srv["token"]

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            # Plex stores the clearLogo URL in the item metadata's `Image` array
            # as an entry with type="clearLogo". The URL includes the thumbId suffix
            # (e.g. /library/metadata/{id}/clearLogo/{thumbId}) and must be fetched
            # with the token. Fetching /clearLogo without the thumbId returns HTML.
            meta_r = await client.get(
                f"{base_url}/library/metadata/{item_id}",
                params=_plex_params(token),
                headers=_PLEX_HEADERS,
            )
            if meta_r.status_code == 404:
                return Response(status_code=404)
            meta_r.raise_for_status()
            try:
                meta = meta_r.json()
                metadata_obj: dict = meta.get("MediaContainer", {}).get("Metadata", [{}])[0]
                images: list[dict] = metadata_obj.get("Image", [])
                logo_entry = next((img for img in images if img.get("type") in ("clearLogo", "logo", "Logo")), None)
                logo_path: str | None = logo_entry.get("url") if logo_entry else None
            except Exception as exc:
                print(f"[logo proxy] failed to parse metadata: {exc}", flush=True)
                logo_path = None
            if not logo_path:
                return Response(status_code=404)

            r = await client.get(
                f"{base_url}{logo_path}",
                params=_plex_params(token),
                headers=_PLEX_HEADERS,
            )
            if r.status_code == 404:
                return Response(status_code=404)
            r.raise_for_status()
            data = r.content
            try:
                cache_path.write_bytes(data)
            except Exception:
                pass
            return Response(
                content=data,
                media_type=_sniff_content_type(data),
                headers={"Cache-Control": "no-store"},
            )
    except Exception:
        return Response(status_code=404)


@router.delete("/admin/media-server/logo/{item_id}/cache")
async def media_server_logo_cache_bust(request: Request, item_id: str):
    """Delete the cached logo image for an item so the next request re-fetches from Plex."""
    from .auth import require_admin
    await require_admin(request)

    cfg = request.app.state.cfg
    try:
        _logo_cache_path(cfg.data_dir, item_id).unlink(missing_ok=True)
    except Exception:
        pass
    return {"ok": True}


@router.get("/admin/media-server/square/{item_id}")
async def media_server_square(request: Request, item_id: str, t: str = Query(default="")):
    """Proxy square poster image from Plex. Returns 404 if none exists.

    Images are cached to disk after the first fetch.
    PMS 1.43 reports square artwork in the Image[] array as backgroundSquare and
    serves it from /library/metadata/{id}/squareArt/{thumbId}.
    """
    await _check_token(request, t)

    cfg = request.app.state.cfg

    cache_path = _square_cache_path(cfg.data_dir, item_id)
    if cache_path.exists():
        data = cache_path.read_bytes()
        return Response(
            content=data,
            media_type=_sniff_content_type(data),
            headers={"Cache-Control": "no-store"},
        )

    servers = _load_servers(cfg.data_dir)
    plex_srv = next((s for s in servers if s.get("type") == "plex"), None)
    if not plex_srv:
        return Response(status_code=404)

    base_url = plex_srv["base_url"]
    token = plex_srv["token"]

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            meta_r = await client.get(
                f"{base_url}/library/metadata/{item_id}",
                params=_plex_params(token),
                headers=_PLEX_HEADERS,
            )
            if meta_r.status_code == 404:
                return Response(status_code=404)
            meta_r.raise_for_status()
            try:
                meta = meta_r.json()
                metadata_obj: dict = meta.get("MediaContainer", {}).get("Metadata", [{}])[0]
                images: list[dict] = metadata_obj.get("Image", [])
                logger.info(f"[square proxy] Image array for {item_id}: {images}")
                square_entry = next(
                    (
                        img for img in images
                        if img.get("type") in ("backgroundSquare", "squarePoster", "square", "Square")
                    ),
                    None,
                )
                square_path: str | None = square_entry.get("url") if square_entry else None
            except Exception as exc:
                logger.warning(f"[square proxy] failed to parse metadata: {exc}")
                square_path = None
            if not square_path:
                return Response(status_code=404)

            r = await client.get(
                f"{base_url}{square_path}",
                params=_plex_params(token),
                headers=_PLEX_HEADERS,
            )
            if r.status_code == 404:
                return Response(status_code=404)
            r.raise_for_status()
            data = r.content
            try:
                cache_path.write_bytes(data)
            except Exception:
                pass
            return Response(
                content=data,
                media_type=_sniff_content_type(data),
                headers={"Cache-Control": "no-store"},
            )
    except Exception:
        return Response(status_code=404)


@router.delete("/admin/media-server/square/{item_id}/cache")
async def media_server_square_cache_bust(request: Request, item_id: str):
    """Delete the cached square image for an item so the next request re-fetches from Plex."""
    from .auth import require_admin
    await require_admin(request)

    cfg = request.app.state.cfg
    try:
        _square_cache_path(cfg.data_dir, item_id).unlink(missing_ok=True)
    except Exception:
        pass
    return {"ok": True}


@router.delete("/admin/media-server/thumbs/cache")
async def media_server_thumb_cache_bust_all(request: Request):
    """Delete ALL cached thumbnail images so every next request re-fetches fresh from Plex."""
    from .auth import require_admin
    await require_admin(request)

    cfg = request.app.state.cfg
    import shutil
    try:
        thumbs_dir = _cache_dir(cfg.data_dir) / "thumbs"
        if thumbs_dir.exists():
            shutil.rmtree(thumbs_dir)
    except Exception:
        pass
    return {"ok": True}


# ---------------------------------------------------------------------------
# Cache path helpers (thumb/art disk cache — unchanged)
# ---------------------------------------------------------------------------

from pathlib import Path


def _cache_dir(data_dir: Path) -> Path:
    d = data_dir / "media_server_cache"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _thumb_cache_path(data_dir: Path, item_id: str) -> Path:
    d = _cache_dir(data_dir) / "thumbs"
    d.mkdir(exist_ok=True)
    safe = "".join(c for c in item_id if c.isalnum() or c in "-_")
    return d / safe


def _art_cache_path(data_dir: Path, item_id: str) -> Path:
    d = _cache_dir(data_dir) / "arts"
    d.mkdir(exist_ok=True)
    safe = "".join(c for c in item_id if c.isalnum() or c in "-_")
    return d / safe


def _logo_cache_path(data_dir: Path, item_id: str) -> Path:
    d = _cache_dir(data_dir) / "logos"
    d.mkdir(exist_ok=True)
    safe = "".join(c for c in item_id if c.isalnum() or c in "-_")
    return d / safe


def _square_cache_path(data_dir: Path, item_id: str) -> Path:
    d = _cache_dir(data_dir) / "squares"
    d.mkdir(exist_ok=True)
    safe = "".join(c for c in item_id if c.isalnum() or c in "-_")
    return d / safe
