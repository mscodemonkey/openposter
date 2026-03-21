from __future__ import annotations

import json

from fastapi import APIRouter, Query, Request
from sqlalchemy import select

from ..crypto.signing import sign_poster_entry
from ..db import Poster

router = APIRouter()


@router.get("/feed")
async def get_feed(
    request: Request,
    since: str | None = Query(None, description="RFC3339 timestamp — return posters created after this"),
    creator_id: str | None = Query(None),
    theme_id: str | None = Query(None),
    collection_tmdb_id: int | None = Query(None),
    show_tmdb_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """Parameterised feed of new poster entries.

    Returns posters ordered newest-first, filtered by any combination of
    creator_id, theme_id, collection_tmdb_id (media_type=collection), or show_tmdb_id.
    Use `since` (RFC3339) to poll for new additions incrementally.
    """
    cfg = request.app.state.cfg

    async with request.app.state.Session() as session:
        stmt = select(Poster).where(Poster.deleted_at.is_(None))

        if since:
            stmt = stmt.where(Poster.created_at > since)
        if creator_id:
            stmt = stmt.where(Poster.creator_id == creator_id)
        if theme_id:
            stmt = stmt.where(Poster.theme_id == theme_id)
        if collection_tmdb_id is not None:
            stmt = stmt.where(Poster.media_type == "collection", Poster.tmdb_id == collection_tmdb_id)
        if show_tmdb_id is not None:
            stmt = stmt.where(Poster.show_tmdb_id == show_tmdb_id)

        stmt = stmt.order_by(Poster.created_at.desc()).limit(limit)
        posters = (await session.execute(stmt)).scalars().all()

    results = []
    next_since = None
    for p in posters:
        origin_preview_url = f"{cfg.base_url}/v1/blobs/{p.preview_hash}" if cfg.base_url else f"{request.base_url}v1/blobs/{p.preview_hash}"
        origin_full_url = f"{cfg.base_url}/v1/blobs/{p.full_hash}" if cfg.base_url else f"{request.base_url}v1/blobs/{p.full_hash}"
        mirror_preview_urls = [f"{m}/v1/blobs/{p.preview_hash}" for m in cfg.mirrors]
        mirror_full_urls = [f"{m}/v1/blobs/{p.full_hash}" for m in cfg.mirrors]

        media: dict = {
            "type": p.media_type,
            "tmdb_id": p.tmdb_id,
            "title": p.title,
            "year": p.year,
        }
        if p.show_tmdb_id is not None:
            media["show_tmdb_id"] = p.show_tmdb_id
        if p.season_number is not None:
            media["season_number"] = p.season_number
        if p.episode_number is not None:
            media["episode_number"] = p.episode_number
        if p.theme_id is not None:
            media["theme_id"] = p.theme_id

        links = None
        if p.links_json:
            try:
                links = json.loads(p.links_json)
            except Exception:
                links = None

        entry = {
            "poster_id": p.poster_id,
            "media": media,
            "creator": {
                "creator_id": p.creator_id,
                "display_name": p.creator_display_name,
                "home_node": p.creator_home_node,
            },
            "links": links,
            "assets": {
                "preview": {
                    "hash": p.preview_hash,
                    "url": origin_preview_url,
                    "bytes": p.preview_bytes,
                    "mime": p.preview_mime,
                    "width": p.preview_width,
                    "height": p.preview_height,
                    "sources": (
                        [{"url": origin_preview_url, "role": "origin"}, *[{"url": u, "role": "mirror"} for u in mirror_preview_urls]]
                        if cfg.mirrors
                        else [{"url": origin_preview_url, "role": "origin"}]
                    ),
                },
                "full": {
                    "access": p.full_access,
                    "hash": p.full_hash,
                    "url": (mirror_full_urls[0] if mirror_full_urls else origin_full_url),
                    "bytes": p.full_bytes,
                    "mime": p.full_mime,
                    "width": p.full_width,
                    "height": p.full_height,
                    "sources": (
                        [{"url": origin_full_url, "role": "origin"}, *[{"url": u, "role": "mirror"} for u in mirror_full_urls]]
                        if cfg.mirrors
                        else [{"url": origin_full_url, "role": "origin"}]
                    ),
                },
            },
            "attribution": {
                "source_url": p.attribution_source_url,
                "license": p.attribution_license,
                "redistribution": p.attribution_redistribution,
            },
        }

        signed = sign_poster_entry(request.app.state.signing_key, entry, key_id=request.app.state.signing_info.key_id)
        results.append(signed)
        if next_since is None:
            next_since = p.created_at  # first (newest) item's timestamp

    return {"results": results, "next_since": next_since}
