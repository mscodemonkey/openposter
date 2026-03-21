from __future__ import annotations

"""Artwork tracking — CRUD for applied artwork records and auto-update settings."""

import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import select

from ..db import AppliedArtwork
from .auth import require_admin
from .plex import (
    _PLEX_HEADERS,
    _load_auto_update_settings,
    _load_settings,
    _plex_params,
    _remove_plex_label,
    _save_auto_update_settings,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Tracked artwork list
# ---------------------------------------------------------------------------

@router.get("/admin/artwork/tracked")
async def list_tracked(request: Request):
    """Return all applied artwork records."""
    await require_admin(request)
    async with request.app.state.Session() as session:
        rows = (await session.execute(select(AppliedArtwork))).scalars().all()
    return {
        "items": [
            {
                "media_item_id": r.media_item_id,
                "tmdb_id": r.tmdb_id,
                "media_type": r.media_type,
                "poster_id": r.poster_id,
                "asset_hash": r.asset_hash,
                "creator_id": r.creator_id,
                "theme_id": r.theme_id,
                "node_base": r.node_base,
                "applied_at": r.applied_at,
                "auto_update": r.auto_update,
                "plex_label": r.plex_label,
                "creator_display_name": r.creator_display_name,
            }
            for r in rows
        ]
    }


# ---------------------------------------------------------------------------
# Auto-update settings
# ---------------------------------------------------------------------------

@router.get("/admin/artwork/settings")
async def get_artwork_settings(request: Request):
    """Return auto-update and label settings."""
    await require_admin(request)
    return _load_auto_update_settings(request.app.state.cfg.data_dir)


class ArtworkSettings(BaseModel):
    auto_update_artwork: bool | None = None
    add_plex_labels: bool | None = None


@router.put("/admin/artwork/settings")
async def save_artwork_settings(request: Request, body: ArtworkSettings):
    """Update auto-update and/or label settings."""
    await require_admin(request)
    data_dir = request.app.state.cfg.data_dir
    current = _load_auto_update_settings(data_dir)
    if body.auto_update_artwork is not None:
        current["auto_update_artwork"] = body.auto_update_artwork
    if body.add_plex_labels is not None:
        current["add_plex_labels"] = body.add_plex_labels
    _save_auto_update_settings(data_dir, current)
    return current


# ---------------------------------------------------------------------------
# Remove all Plex labels
# ---------------------------------------------------------------------------

@router.post("/admin/artwork/remove-labels")
async def remove_all_labels(request: Request):
    """Remove all op: labels from Plex items and clear them from the DB."""
    await require_admin(request)
    data_dir = request.app.state.cfg.data_dir
    cfg = _load_settings(data_dir)
    if not cfg:
        return {"ok": True, "removed": 0}

    async with request.app.state.Session() as session:
        rows = (
            await session.execute(
                select(AppliedArtwork).where(AppliedArtwork.plex_label.isnot(None))
            )
        ).scalars().all()

    removed = 0
    async with httpx.AsyncClient(timeout=15.0) as client:
        for row in rows:
            if row.plex_label:
                await _remove_plex_label(
                    client, cfg["base_url"], cfg["token"], row.media_item_id, row.plex_label
                )
                removed += 1

    # Clear plex_label in DB and update settings.
    async with request.app.state.Session() as session:
        for row in rows:
            db_row = await session.get(AppliedArtwork, row.media_item_id)
            if db_row:
                db_row.plex_label = None
        await session.commit()

    _save_auto_update_settings(
        data_dir,
        {**_load_auto_update_settings(data_dir), "add_plex_labels": False},
    )

    return {"ok": True, "removed": removed}


# ---------------------------------------------------------------------------
# Untrack (reset) a single artwork record
# ---------------------------------------------------------------------------

@router.delete("/admin/artwork/tracked/{media_item_id:path}")
async def untrack_artwork(request: Request, media_item_id: str):
    """Remove OP tracking for one media item and restore the original Plex artwork.

    Backdrop tracking records are stored with a ":bg" suffix on the media_item_id.
    For those records the real Plex ratingKey is the part before ":bg", and the
    art (backdrop) lock is released rather than the thumb lock.

    - Deletes the AppliedArtwork record from the DB.
    - Removes the op: Plex label if one was set.
    - Unlocks the appropriate field so Plex reverts to the agent-selected image.
    - Triggers a metadata refresh so Plex re-downloads the original artwork.
    """
    await require_admin(request)
    data_dir = request.app.state.cfg.data_dir
    plex_cfg = _load_settings(data_dir)

    is_backdrop = media_item_id.endswith(":bg")
    plex_key = media_item_id[:-3] if is_backdrop else media_item_id

    async with request.app.state.Session() as session:
        row = await session.get(AppliedArtwork, media_item_id)
        if not row:
            return {"ok": True}
        plex_label = row.plex_label
        await session.delete(row)
        await session.commit()

    if plex_cfg:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if plex_label:
                await _remove_plex_label(
                    client, plex_cfg["base_url"], plex_cfg["token"], plex_key, plex_label
                )
            try:
                params = _plex_params(plex_cfg["token"])
                params["art.locked" if is_backdrop else "thumb.locked"] = "0"
                await client.put(
                    f"{plex_cfg['base_url']}/library/metadata/{plex_key}",
                    params=params,
                    headers=_PLEX_HEADERS,
                )
            except Exception:
                pass
            try:
                await client.put(
                    f"{plex_cfg['base_url']}/library/metadata/{plex_key}/refresh",
                    params=_plex_params(plex_cfg["token"]),
                    headers=_PLEX_HEADERS,
                )
            except Exception:
                pass

    # Bust the disk-cache for the appropriate image type.
    if is_backdrop:
        from .media_server import _art_cache_path
        try:
            _art_cache_path(data_dir, plex_key).unlink(missing_ok=True)
        except Exception:
            pass
    else:
        from .media_server import _thumb_cache_path
        try:
            _thumb_cache_path(data_dir, plex_key).unlink(missing_ok=True)
        except Exception:
            pass

    return {"ok": True}
