from __future__ import annotations

"""Plex media server integration.

The node stores Plex credentials server-side (never in the browser).
All Plex API calls are proxied through the node admin API.
"""

import base64
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..errors import http_error
from ..storage.blobs import blob_path
from .auth import require_admin


def _sniff_content_type(data: bytes) -> str:
    if data[:2] == b"\xff\xd8":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"

router = APIRouter()

_PLEX_HEADERS = {
    "Accept": "application/json",
    "X-Plex-Product": "OpenPoster",
    "X-Plex-Client-Identifier": "openposter-node",
}


# ---------------------------------------------------------------------------
# Multi-server storage helpers
# ---------------------------------------------------------------------------

def _servers_path(data_dir: Path) -> Path:
    return data_dir / "media_servers.json"


def _load_legacy_plex_settings(data_dir: Path) -> dict | None:
    """Read the old single-server plex_settings.json (migration only)."""
    p = data_dir / "plex_settings.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def _load_servers(data_dir: Path) -> list[dict]:
    """Return list of configured media server dicts (each includes token)."""
    p = _servers_path(data_dir)
    if not p.exists():
        # Auto-migrate legacy plex_settings.json on first access
        legacy = _load_legacy_plex_settings(data_dir)
        if legacy:
            server: dict = {
                "id": "default",
                "type": "plex",
                "name": "Plex",
                **legacy,
            }
            _save_servers(data_dir, [server])
            return [server]
        return []
    try:
        return json.loads(p.read_text())
    except Exception:
        return []


def _save_servers(data_dir: Path, servers: list[dict]) -> None:
    _servers_path(data_dir).write_text(json.dumps(servers, indent=2) + "\n")


def _get_server(data_dir: Path, server_id: str) -> dict | None:
    return next((s for s in _load_servers(data_dir) if s["id"] == server_id), None)


# ---------------------------------------------------------------------------
# Legacy single-server helpers (kept for backwards compatibility)
# Used by plex_apply and other routes that haven't migrated to multi-server yet.
# ---------------------------------------------------------------------------

def _load_settings(data_dir: Path) -> dict | None:
    """Return the first configured Plex server as a settings dict, or None."""
    servers = _load_servers(data_dir)
    plex_servers = [s for s in servers if s.get("type") == "plex"]
    if not plex_servers:
        return None
    s = plex_servers[0]
    return {
        "base_url": s.get("base_url", ""),
        "token": s.get("token", ""),
        "tv_libraries": s.get("tv_libraries", []),
        "movie_libraries": s.get("movie_libraries", []),
    }


def _save_settings(data_dir: Path, settings: dict) -> None:
    """Upsert a single Plex server (legacy compat — upserts the 'default' server)."""
    servers = _load_servers(data_dir)
    existing = next((s for s in servers if s["id"] == "default"), None)
    if existing:
        existing.update({
            "base_url": settings.get("base_url", ""),
            "token": settings.get("token", ""),
            "tv_libraries": settings.get("tv_libraries", []),
            "movie_libraries": settings.get("movie_libraries", []),
        })
    else:
        servers.insert(0, {
            "id": "default",
            "type": "plex",
            "name": "Plex",
            **settings,
        })
    _save_servers(data_dir, servers)


def _delete_settings(data_dir: Path) -> None:
    """Remove the legacy 'default' Plex server."""
    servers = _load_servers(data_dir)
    servers = [s for s in servers if s["id"] != "default"]
    _save_servers(data_dir, servers)


# ---------------------------------------------------------------------------
# Auto-update settings helpers
# ---------------------------------------------------------------------------

def _auto_update_settings_path(data_dir: Path) -> Path:
    return data_dir / "auto_update_settings.json"


def _load_auto_update_settings(data_dir: Path) -> dict:
    p = _auto_update_settings_path(data_dir)
    defaults: dict = {"auto_update_artwork": False, "add_plex_labels": True}
    if not p.exists():
        return defaults
    try:
        return {**defaults, **json.loads(p.read_text())}
    except Exception:
        return defaults


def _save_auto_update_settings(data_dir: Path, settings: dict) -> None:
    _auto_update_settings_path(data_dir).write_text(json.dumps(settings, indent=2) + "\n")


# ---------------------------------------------------------------------------
# Plex API helpers
# ---------------------------------------------------------------------------

def _plex_params(token: str, **extra) -> dict:
    return {"X-Plex-Token": token, **extra}


async def _get_sections(client: httpx.AsyncClient, base_url: str, token: str) -> list[dict]:
    r = await client.get(f"{base_url}/library/sections", params=_plex_params(token), headers=_PLEX_HEADERS)
    r.raise_for_status()
    return r.json().get("MediaContainer", {}).get("Directory", [])


async def _find_item_by_tmdb_id(
    client: httpx.AsyncClient, base_url: str, token: str, section_key: str, tmdb_id: int
) -> dict | None:
    """Search a library section for an item matching tmdb://{tmdb_id}."""
    r = await client.get(
        f"{base_url}/library/sections/{section_key}/all",
        params=_plex_params(token, includeGuids="1"),
        headers=_PLEX_HEADERS,
        timeout=30.0,
    )
    r.raise_for_status()
    items = r.json().get("MediaContainer", {}).get("Metadata", [])
    for item in items:
        for guid in (item.get("Guid") or []):
            if guid.get("id") == f"tmdb://{tmdb_id}":
                return item
    return None


async def _get_children(
    client: httpx.AsyncClient, base_url: str, token: str, rating_key: str
) -> list[dict]:
    r = await client.get(
        f"{base_url}/library/metadata/{rating_key}/children",
        params=_plex_params(token, includeGuids="1"),
        headers=_PLEX_HEADERS,
    )
    r.raise_for_status()
    return r.json().get("MediaContainer", {}).get("Metadata", [])


async def _apply_image(
    client: httpx.AsyncClient,
    base_url: str,
    token: str,
    rating_key: str,
    image_data: bytes,
    content_type: str,
    is_episode: bool = False,
    is_backdrop: bool = False,
    is_logo: bool = False,
    is_square: bool = False,
) -> None:
    """Upload image bytes to Plex as the poster/thumb/art/logo/square."""
    if is_logo:
        endpoint = "logos"
    elif is_square:
        endpoint = "squares"
    elif is_backdrop:
        endpoint = "arts"
    elif is_episode:
        endpoint = "thumbs"
    else:
        endpoint = "posters"
    r = await client.post(
        f"{base_url}/library/metadata/{rating_key}/{endpoint}",
        content=image_data,
        params=_plex_params(token),
        headers={**_PLEX_HEADERS, "Content-Type": content_type},
    )
    r.raise_for_status()


async def _add_plex_label(
    client: httpx.AsyncClient, base_url: str, token: str, rating_key: str, label: str
) -> None:
    """Add a label to a Plex item. Silently ignores failures."""
    try:
        params = _plex_params(token)
        params["label[0].tag.tag"] = label
        params["label[0].tag.locked"] = "0"
        await client.put(
            f"{base_url}/library/metadata/{rating_key}",
            params=params,
            headers=_PLEX_HEADERS,
        )
    except Exception:
        pass


async def _remove_plex_label(
    client: httpx.AsyncClient, base_url: str, token: str, rating_key: str, label: str
) -> None:
    """Remove a specific label from a Plex item. Silently ignores failures."""
    try:
        r = await client.get(
            f"{base_url}/library/metadata/{rating_key}",
            params=_plex_params(token, includeFields="labels"),
            headers=_PLEX_HEADERS,
        )
        if not r.is_success:
            return
        data = r.json()
        metadata = data.get("MediaContainer", {}).get("Metadata", [{}])[0]
        existing = [lbl["tag"] for lbl in metadata.get("Label", []) if lbl.get("tag") != label]
        params = _plex_params(token)
        params["label.locked"] = "1"
        for i, lbl in enumerate(existing):
            params[f"label[{i}].tag.tag"] = lbl
        await client.put(
            f"{base_url}/library/metadata/{rating_key}",
            params=params,
            headers=_PLEX_HEADERS,
        )
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Connect / status / disconnect
# ---------------------------------------------------------------------------

class PlexConnectRequest(BaseModel):
    base_url: str
    token: str
    tv_libraries: list[str]
    movie_libraries: list[str]
    test_only: bool = False


@router.post("/admin/plex/connect")
async def plex_connect(request: Request, body: PlexConnectRequest):
    """Test (and optionally save) Plex connection details.

    Pass test_only=true to verify credentials without saving.
    """
    await require_admin(request)

    base_url = body.base_url.rstrip("/")

    # Test the connection by listing library sections.
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            sections = await _get_sections(client, base_url, body.token)
    except httpx.HTTPStatusError as e:
        raise http_error(400, "plex_error", f"Plex returned {e.response.status_code}")
    except Exception as e:
        raise http_error(400, "plex_error", f"Could not reach Plex: {e}")

    section_titles = {s.get("title") for s in sections}
    all_requested = set(body.tv_libraries) | set(body.movie_libraries)
    missing = all_requested - section_titles
    if missing:
        raise http_error(
            400, "plex_error",
            f"Library not found in Plex: {', '.join(sorted(missing))}. "
            f"Available: {', '.join(sorted(section_titles))}",
        )

    if not body.test_only:
        cfg = request.app.state.cfg
        _save_settings(cfg.data_dir, {
            "base_url": base_url,
            "token": body.token,
            "tv_libraries": body.tv_libraries,
            "movie_libraries": body.movie_libraries,
        })

    return {
        "ok": True,
        "base_url": base_url,
        "tv_libraries": body.tv_libraries,
        "movie_libraries": body.movie_libraries,
        "sections": [{"key": s.get("key"), "title": s.get("title"), "type": s.get("type")} for s in sections],
    }


@router.get("/admin/plex/status")
async def plex_status(request: Request):
    """Return current Plex connection status. Token is never exposed."""
    await require_admin(request)
    cfg = request.app.state.cfg
    settings = _load_settings(cfg.data_dir)
    if not settings:
        return {"connected": False}
    return {
        "connected": True,
        "base_url": settings.get("base_url"),
        "tv_libraries": settings.get("tv_libraries", []),
        "movie_libraries": settings.get("movie_libraries", []),
    }


@router.delete("/admin/plex/disconnect")
async def plex_disconnect(request: Request):
    """Remove saved Plex credentials from the node."""
    await require_admin(request)
    cfg = request.app.state.cfg
    _delete_settings(cfg.data_dir)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Multi-server CRUD API
# ---------------------------------------------------------------------------

class MediaServerDetectRequest(BaseModel):
    url: str
    token: str


@router.post("/admin/media-servers/detect")
async def media_server_detect(request: Request, body: MediaServerDetectRequest):
    """Detect server type (Plex/Jellyfin) and fetch its name. Does not save."""
    await require_admin(request)
    base_url = body.url.rstrip("/")

    # Try Plex first
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                f"{base_url}/",
                params={"X-Plex-Token": body.token},
                headers={"Accept": "application/json", "X-Plex-Product": "OpenPoster"},
            )
            if r.is_success:
                data = r.json().get("MediaContainer", {})
                if "friendlyName" in data:
                    return {"type": "plex", "name": data["friendlyName"]}
    except Exception:
        pass

    # Try Jellyfin / Emby
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                f"{base_url}/System/Info",
                headers={"X-Emby-Token": body.token, "Accept": "application/json"},
            )
            if r.is_success:
                data = r.json()
                if "ServerName" in data:
                    return {"type": "jellyfin", "name": data["ServerName"]}
    except Exception:
        pass

    raise http_error(400, "detect_failed",
                     "Could not detect server type at this URL. "
                     "Check the URL and token are correct.")


class MediaServerAddRequest(BaseModel):
    id: str | None = None          # omit to auto-generate
    type: str                      # "plex" | "jellyfin"
    name: str
    base_url: str
    token: str
    tv_libraries: list[str] = []
    movie_libraries: list[str] = []


@router.get("/admin/media-servers")
async def media_servers_list(request: Request):
    """Return all configured media servers (token redacted)."""
    await require_admin(request)
    cfg = request.app.state.cfg
    servers = _load_servers(cfg.data_dir)
    return [
        {k: v for k, v in s.items() if k != "token"}
        for s in servers
    ]


@router.post("/admin/media-servers")
async def media_servers_add(request: Request, body: MediaServerAddRequest):
    """Add or update a media server. Validates the connection before saving."""
    await require_admin(request)
    cfg = request.app.state.cfg

    base_url = body.base_url.rstrip("/")
    server_id = body.id or str(uuid.uuid4())

    # Validate connection for Plex servers
    if body.type == "plex":
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                sections = await _get_sections(client, base_url, body.token)
        except httpx.HTTPStatusError as e:
            raise http_error(400, "plex_error", f"Plex returned {e.response.status_code}")
        except Exception as e:
            raise http_error(400, "plex_error", f"Could not reach server: {e}")

        section_titles = {s.get("title") for s in sections}
        all_requested = set(body.tv_libraries) | set(body.movie_libraries)
        missing = all_requested - section_titles
        if missing:
            raise http_error(
                400, "plex_error",
                f"Library not found: {', '.join(sorted(missing))}. "
                f"Available: {', '.join(sorted(section_titles))}",
            )

    servers = _load_servers(cfg.data_dir)
    existing_idx = next((i for i, s in enumerate(servers) if s["id"] == server_id), None)
    server_record = {
        "id": server_id,
        "type": body.type,
        "name": body.name,
        "base_url": base_url,
        "token": body.token,
        "tv_libraries": body.tv_libraries,
        "movie_libraries": body.movie_libraries,
    }
    if existing_idx is not None:
        servers[existing_idx] = server_record
    else:
        servers.append(server_record)
    _save_servers(cfg.data_dir, servers)

    return {k: v for k, v in server_record.items() if k != "token"}


@router.delete("/admin/media-servers/{server_id}")
async def media_servers_remove(request: Request, server_id: str):
    """Remove a media server by ID."""
    await require_admin(request)
    cfg = request.app.state.cfg
    servers = _load_servers(cfg.data_dir)
    servers = [s for s in servers if s["id"] != server_id]
    _save_servers(cfg.data_dir, servers)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Apply artwork
# ---------------------------------------------------------------------------

class PlexApplyRequest(BaseModel):
    image_url: str | None = None
    # base64-encoded image bytes; used by the frontend when the poster lives on
    # a remote node that the backend can't reach directly via HTTP.
    image_data: str | None = None
    tmdb_id: int | None = None
    media_type: str          # movie | show | season | episode | collection
    show_tmdb_id: int | None = None
    season_number: int | None = None
    episode_number: int | None = None
    # When provided, skip the TMDB-based item search and apply directly to this
    # Plex ratingKey. Useful for collections which Plex doesn't tag with TMDB GUIDs.
    plex_rating_key: str | None = None
    # Tracking fields (optional — only present when applied via OpenPoster UI):
    poster_id: str | None = None
    asset_hash: str | None = None
    creator_id: str | None = None
    creator_display_name: str | None = None
    theme_id: str | None = None
    node_base: str | None = None
    auto_update: bool = False
    is_backdrop: bool = False
    is_logo: bool = False
    is_square: bool = False


@router.post("/admin/plex/apply")
async def plex_apply(request: Request, body: PlexApplyRequest):
    """Apply a poster image to the matching item in the user's Plex library.

    For seasons/episodes the show is found via show_tmdb_id, then drilled
    into by season_number / episode_number.
    """
    await require_admin(request)
    cfg = request.app.state.cfg
    settings = _load_settings(cfg.data_dir)
    if not settings:
        raise http_error(400, "plex_not_configured", "Plex is not configured. Go to Settings.")

    base_url = settings["base_url"]
    token = settings["token"]

    # Fetch the image first (fail fast before bothering Plex).
    # image_data (base64) takes precedence — the frontend sends this when the
    # poster lives on a remote node that the backend can't reach directly.
    # Otherwise, if the URL is a local blob URL (/v1/blobs/sha256:<hex>) read
    # from disk to avoid Docker port-mapping issues when the node fetches itself.
    if body.image_data:
        try:
            image_data = base64.b64decode(body.image_data)
        except Exception as e:
            raise http_error(400, "image_fetch_error", f"Invalid image_data: {e}")
        content_type = _sniff_content_type(image_data)
    elif body.image_url:
        _local_blob_re = re.compile(r"/v1/blobs/(sha256:[0-9a-f]{64})$")
        _local_match = _local_blob_re.search(body.image_url)
        _is_local_blob = bool(_local_match) and (
            body.image_url.startswith("/") or body.image_url.startswith(cfg.base_url)
        )

        if _is_local_blob:
            blob_hash = _local_match.group(1)
            local_path = blob_path(cfg.data_dir, blob_hash)
            if not local_path.exists():
                raise http_error(400, "image_fetch_error", f"Local blob not found: {blob_hash}")
            image_data = local_path.read_bytes()
            content_type = _sniff_content_type(image_data)
        else:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as _img_client:
                try:
                    img_r = await _img_client.get(body.image_url)
                    img_r.raise_for_status()
                except Exception as e:
                    raise http_error(400, "image_fetch_error", f"Could not fetch image: {e}")
                image_data = img_r.content
                content_type = _sniff_content_type(image_data)
    else:
        raise http_error(400, "validation_error", "Either image_url or image_data is required")

    if not body.plex_rating_key and body.tmdb_id is None:
        raise http_error(400, "validation_error", "Either tmdb_id or plex_rating_key is required")

    # Determine library type and search TMDB ID.
    is_movie = body.media_type in {"movie", "collection"}
    search_tmdb_id = (
        body.tmdb_id if is_movie else (body.show_tmdb_id or body.tmdb_id)
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        if body.plex_rating_key:
            # Caller already knows the Plex ratingKey — skip the TMDB item search.
            # This is the typical path for collections, which Plex doesn't tag with
            # TMDB GUIDs even when a TMDB collection ID is known.
            rating_key = body.plex_rating_key
        else:
            # Standard path: search the configured library sections by TMDB ID.
            library_names = (
                settings.get("movie_libraries", []) if is_movie else settings.get("tv_libraries", [])
            )

            # Get library sections.
            try:
                sections = await _get_sections(client, base_url, token)
            except Exception as e:
                raise http_error(502, "plex_error", f"Could not list Plex sections: {e}")

            target_type = "movie" if is_movie else "show"
            matching_sections = [
                s for s in sections
                if s.get("title") in library_names and s.get("type") == target_type
            ]
            if not matching_sections:
                raise http_error(404, "not_found", f"No matching Plex library section for {library_names!r}")

            plex_item = None
            for section in matching_sections:
                plex_item = await _find_item_by_tmdb_id(
                    client, base_url, token, section["key"], search_tmdb_id
                )
                if plex_item:
                    break

            if not plex_item:
                raise http_error(
                    404, "not_found",
                    f"TMDB ID {search_tmdb_id} not found in your Plex library. "
                    "Make sure the item is in the library and Plex has matched it to TMDB."
                )

            rating_key = plex_item["ratingKey"]

        # Drill down for seasons and episodes — only when plex_rating_key was NOT
        # provided. When it is provided the caller already has the direct ratingKey
        # of the target item (season/episode), so no further drill-down is needed.
        if not body.plex_rating_key:
            if body.media_type == "season":
                if body.season_number is None:
                    raise http_error(400, "invalid_request", "season_number required for season")
                seasons = await _get_children(client, base_url, token, rating_key)
                season = next((s for s in seasons if s.get("index") == body.season_number), None)
                if not season:
                    raise http_error(404, "not_found", f"Season {body.season_number} not found in Plex")
                rating_key = season["ratingKey"]

            elif body.media_type == "episode":
                if body.season_number is None or body.episode_number is None:
                    raise http_error(400, "invalid_request", "season_number and episode_number required for episode")
                seasons = await _get_children(client, base_url, token, rating_key)
                season = next((s for s in seasons if s.get("index") == body.season_number), None)
                if not season:
                    raise http_error(404, "not_found", f"Season {body.season_number} not found in Plex")
                episodes = await _get_children(client, base_url, token, season["ratingKey"])
                episode = next((e for e in episodes if e.get("index") == body.episode_number), None)
                if not episode:
                    raise http_error(
                        404, "not_found",
                        f"S{body.season_number:02d}E{body.episode_number:02d} not found in Plex"
                    )
                rating_key = episode["ratingKey"]

        # Apply the image.
        try:
            await _apply_image(
                client, base_url, token, rating_key,
                image_data, content_type,
                is_episode=(body.media_type == "episode"),
                is_backdrop=body.is_backdrop,
                is_logo=body.is_logo,
                is_square=body.is_square,
            )
        except httpx.HTTPStatusError as e:
            err_body = e.response.text[:200]
            raise http_error(502, "plex_error", f"Plex rejected the artwork: {e.response.status_code} — {err_body}")
        except Exception as e:
            raise http_error(502, "plex_error", f"Failed to apply artwork to Plex: {e}")

        # Bust the disk-cache so the next page load fetches fresh art from Plex.
        if body.is_logo:
            from .media_server import _logo_cache_path
            try:
                _logo_cache_path(cfg.data_dir, rating_key).unlink(missing_ok=True)
            except Exception:
                pass
        elif body.is_square:
            from .media_server import _square_cache_path
            try:
                _square_cache_path(cfg.data_dir, rating_key).unlink(missing_ok=True)
            except Exception:
                pass
        elif body.is_backdrop:
            from .media_server import _art_cache_path
            try:
                _art_cache_path(cfg.data_dir, rating_key).unlink(missing_ok=True)
            except Exception:
                pass
        else:
            from .media_server import _thumb_cache_path
            try:
                _thumb_cache_path(cfg.data_dir, rating_key).unlink(missing_ok=True)
            except Exception:
                pass

        # Record tracking if poster_id and asset_hash are present.
        if body.poster_id and body.asset_hash:
            data_dir = cfg.data_dir
            au_settings = _load_auto_update_settings(data_dir)
            # Use a short label based on the pst_ suffix to keep it readable in Plex
            _pst_part = body.poster_id.split(":")[-1] if ":" in body.poster_id else body.poster_id
            plex_label = f"op:{_pst_part}" if au_settings.get("add_plex_labels") else None

            if plex_label:
                await _add_plex_label(client, base_url, token, rating_key, plex_label)

            from ..db import AppliedArtwork
            from sqlalchemy.dialects.sqlite import insert as sqlite_insert

            # Each artwork slot gets a distinct tracking key so poster, backdrop, and
            # logo records for the same item can coexist in the table.
            if body.is_logo:
                tracking_key = f"{rating_key}:logo"
            elif body.is_square:
                tracking_key = f"{rating_key}:square"
            elif body.is_backdrop:
                tracking_key = f"{rating_key}:bg"
            else:
                tracking_key = str(rating_key)

            now_str = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            async with request.app.state.Session() as session:
                stmt = sqlite_insert(AppliedArtwork).values(
                    media_item_id=tracking_key,
                    tmdb_id=body.tmdb_id,
                    media_type=body.media_type,
                    poster_id=body.poster_id,
                    asset_hash=body.asset_hash,
                    creator_id=body.creator_id,
                    creator_display_name=body.creator_display_name,
                    theme_id=body.theme_id,
                    node_base=body.node_base,
                    applied_at=now_str,
                    auto_update=body.auto_update,
                    plex_label=plex_label,
                ).on_conflict_do_update(
                    index_elements=["media_item_id"],
                    set_=dict(
                        poster_id=body.poster_id,
                        asset_hash=body.asset_hash,
                        creator_id=body.creator_id,
                        creator_display_name=body.creator_display_name,
                        theme_id=body.theme_id,
                        node_base=body.node_base,
                        applied_at=now_str,
                        auto_update=body.auto_update,
                        plex_label=plex_label,
                    ),
                )
                await session.execute(stmt)
                await session.commit()

    return {"ok": True, "media_item_id": str(rating_key)}
