from __future__ import annotations

"""Media-server-agnostic adapter.

Currently supports Plex only. Imports Plex-specific helpers from .plex.
All endpoints require admin authentication.
"""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, Query, Request
from fastapi.responses import Response

from ..errors import http_error
from .plex import (
    _PLEX_HEADERS,
    _get_children,
    _get_sections,
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

# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

_LIBRARY_CACHE_TTL = 300  # seconds


def _cache_dir(data_dir: Path) -> Path:
    d = data_dir / "media_server_cache"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _thumb_cache_path(data_dir: Path, item_id: str) -> Path:
    d = _cache_dir(data_dir) / "thumbs"
    d.mkdir(exist_ok=True)
    # item_id is a numeric Plex ratingKey — safe as filename
    safe = "".join(c for c in item_id if c.isalnum() or c in "-_")
    return d / safe


def _art_cache_path(data_dir: Path, item_id: str) -> Path:
    d = _cache_dir(data_dir) / "arts"
    d.mkdir(exist_ok=True)
    safe = "".join(c for c in item_id if c.isalnum() or c in "-_")
    return d / safe


def _library_cache_path(data_dir: Path) -> Path:
    return _cache_dir(data_dir) / "library.json"


def _load_library_cache(data_dir: Path) -> dict | None:
    p = _library_cache_path(data_dir)
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text())
        if time.time() - data.get("_ts", 0) < _LIBRARY_CACHE_TTL:
            return {k: v for k, v in data.items() if not k.startswith("_")}
    except Exception:
        pass
    return None


def _save_library_cache(data_dir: Path, payload: dict) -> None:
    try:
        _library_cache_path(data_dir).write_text(
            json.dumps({**payload, "_ts": time.time()})
        )
    except Exception:
        pass

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
# Item conversion helpers
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


def _plex_item(item: dict, type_override: str | None = None) -> dict:
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
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/admin/media-server/library")
async def media_server_library(request: Request, refresh: bool = Query(default=False)):
    """Return the user's Plex library as { movies, shows, collections }.

    Result is cached for 5 minutes. Pass ?refresh=true to force a re-fetch.
    """
    from .auth import require_admin
    await require_admin(request)

    cfg = request.app.state.cfg
    settings = _load_settings(cfg.data_dir)
    if not settings:
        raise http_error(400, "not_configured", "No media server configured. Go to Settings to connect Plex.")

    if not refresh:
        cached = _load_library_cache(cfg.data_dir)
        if cached is not None:
            return cached

    base_url = settings["base_url"]
    token = settings["token"]
    movie_libraries: list[str] = settings.get("movie_libraries", [])
    tv_libraries: list[str] = settings.get("tv_libraries", [])

    movies: list[dict] = []
    shows: list[dict] = []
    collections: list[dict] = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            sections = await _get_sections(client, base_url, token)
        except Exception as e:
            raise http_error(502, "plex_error", f"Could not list Plex sections: {e}")

        for section in sections:
            sec_title = section.get("title", "")
            sec_type = section.get("type", "")
            sec_key = section.get("key", "")

            if sec_title in movie_libraries and sec_type == "movie":
                try:
                    r = await client.get(
                        f"{base_url}/library/sections/{sec_key}/all",
                        params=_plex_params(token, includeGuids="1"),
                        headers=_PLEX_HEADERS,
                        timeout=30.0,
                    )
                    r.raise_for_status()
                    items = r.json().get("MediaContainer", {}).get("Metadata", [])
                    movies.extend(_plex_item(i) for i in items)
                except Exception:
                    pass

                try:
                    r = await client.get(
                        f"{base_url}/library/sections/{sec_key}/collections",
                        params=_plex_params(token, includeGuids="1"),
                        headers=_PLEX_HEADERS,
                        timeout=30.0,
                    )
                    r.raise_for_status()
                    items = r.json().get("MediaContainer", {}).get("Metadata", [])
                    collections.extend(_plex_item(i, type_override="collection") for i in items)
                except Exception:
                    pass

            elif sec_title in tv_libraries and sec_type == "show":
                try:
                    r = await client.get(
                        f"{base_url}/library/sections/{sec_key}/all",
                        params=_plex_params(token, includeGuids="1"),
                        headers=_PLEX_HEADERS,
                        timeout=30.0,
                    )
                    r.raise_for_status()
                    items = r.json().get("MediaContainer", {}).get("Metadata", [])
                    shows.extend(_plex_item(i) for i in items)
                except Exception:
                    pass

    result = {"movies": movies, "shows": shows, "collections": collections}
    _save_library_cache(cfg.data_dir, result)
    return result


@router.get("/admin/media-server/items/{item_id}/children")
async def media_server_children(request: Request, item_id: str):
    """Return children (seasons, episodes, collection items) for a given item."""
    from .auth import require_admin
    await require_admin(request)

    cfg = request.app.state.cfg
    settings = _load_settings(cfg.data_dir)
    if not settings:
        raise http_error(400, "not_configured", "No media server configured.")

    base_url = settings["base_url"]
    token = settings["token"]

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            children = await _get_children(client, base_url, token, item_id)
        except Exception as e:
            raise http_error(502, "plex_error", f"Could not fetch children: {e}")

    return {"items": [_plex_item(c) for c in children]}


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

    settings = _load_settings(cfg.data_dir)
    if not settings:
        return Response(status_code=404)

    base_url = settings["base_url"]
    token = settings["token"]

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
            # Save to disk cache
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

    settings = _load_settings(cfg.data_dir)
    if not settings:
        return Response(status_code=404)

    base_url = settings["base_url"]
    token = settings["token"]

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
