from __future__ import annotations

import json

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, select

from ..crypto.signing import sign_poster_entry
from ..db import CreatorProfile, CreatorTheme, Poster
from ..errors import http_error

router = APIRouter()


def _serialize_poster(p: Poster, cfg, request: Request) -> dict:
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
    if p.collection_tmdb_id is not None:
        media["collection_tmdb_id"] = p.collection_tmdb_id
    if p.theme_id is not None:
        media["theme_id"] = p.theme_id

    links = None
    if p.links_json:
        try:
            links = json.loads(p.links_json)
        except Exception:
            links = None

    return {
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


@router.get("/creators/{creator_id}/themes")
async def list_creator_themes(request: Request, creator_id: str):
    """List all public themes for a creator, with poster counts and cover thumbnail URL."""
    cfg = request.app.state.cfg

    async with request.app.state.Session() as session:
        stmt = select(CreatorTheme).where(
            CreatorTheme.creator_id == creator_id,
            CreatorTheme.deleted_at.is_(None),
        ).order_by(CreatorTheme.created_at.asc())
        themes = (await session.execute(stmt)).scalars().all()

        count_stmt = select(Poster.theme_id, func.count(Poster.poster_id)).where(
            Poster.creator_id == creator_id,
            Poster.deleted_at.is_(None),
            Poster.theme_id.is_not(None),
        ).group_by(Poster.theme_id)
        counts = dict((await session.execute(count_stmt)).all())

        # For each theme, grab the cover blob URL (first poster preview if no explicit cover)
        cover_urls: dict[str, str | None] = {}
        for t in themes:
            if t.cover_hash:
                cover_urls[t.theme_id] = (
                    f"{cfg.base_url}/v1/blobs/{t.cover_hash}"
                    if cfg.base_url
                    else f"{request.base_url}v1/blobs/{t.cover_hash}"
                )
            else:
                # Use first poster's preview as implicit cover
                first = (await session.execute(
                    select(Poster)
                    .where(Poster.theme_id == t.theme_id, Poster.deleted_at.is_(None))
                    .order_by(Poster.created_at.asc())
                    .limit(1)
                )).scalar_one_or_none()
                if first:
                    cover_urls[t.theme_id] = (
                        f"{cfg.base_url}/v1/blobs/{first.preview_hash}"
                        if cfg.base_url
                        else f"{request.base_url}v1/blobs/{first.preview_hash}"
                    )
                else:
                    cover_urls[t.theme_id] = None

    return {"creator_id": creator_id, "themes": [
        {
            "theme_id": t.theme_id,
            "name": t.name,
            "description": t.description,
            "cover_url": cover_urls.get(t.theme_id),
            "poster_count": counts.get(t.theme_id, 0),
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }
        for t in themes
    ]}


@router.get("/creators/{creator_id}/themes/{theme_id}")
async def get_creator_theme(
    request: Request,
    creator_id: str,
    theme_id: str,
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = Query(None),
):
    """Get a single theme with its paginated poster list."""
    cfg = request.app.state.cfg

    async with request.app.state.Session() as session:
        t = await session.get(CreatorTheme, theme_id)
        if t is None or t.deleted_at is not None or t.creator_id != creator_id:
            raise http_error(404, "not_found", "theme not found")

        stmt = select(Poster).where(
            Poster.theme_id == theme_id,
            Poster.creator_id == creator_id,
            Poster.deleted_at.is_(None),
        ).order_by(Poster.created_at.desc()).limit(limit)

        if cursor:
            stmt = stmt.where(Poster.created_at < cursor)

        posters = (await session.execute(stmt)).scalars().all()

    cover_url = None
    if t.cover_hash:
        cover_url = f"{cfg.base_url}/v1/blobs/{t.cover_hash}" if cfg.base_url else f"{request.base_url}v1/blobs/{t.cover_hash}"

    results = []
    next_cursor = None
    for p in posters:
        entry = _serialize_poster(p, cfg, request)
        signed = sign_poster_entry(request.app.state.signing_key, entry, key_id=request.app.state.signing_info.key_id)
        results.append(signed)
        next_cursor = p.created_at

    return {
        "theme": {
            "theme_id": t.theme_id,
            "creator_id": t.creator_id,
            "name": t.name,
            "description": t.description,
            "cover_url": cover_url,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        },
        "results": results,
        "next_cursor": next_cursor if len(posters) == limit else None,
    }


@router.get("/creators/{creator_id}/profile")
async def get_creator_profile(request: Request, creator_id: str):
    """Return public profile metadata for a creator (backdrop URL, etc.)."""
    cfg = request.app.state.cfg

    async with request.app.state.Session() as session:
        profile = await session.get(CreatorProfile, creator_id)

    backdrop_url = None
    if profile and profile.backdrop_hash:
        backdrop_url = (
            f"{cfg.base_url}/v1/blobs/{profile.backdrop_hash}"
            if cfg.base_url
            else f"{request.base_url}v1/blobs/{profile.backdrop_hash}"
        )

    return {"creator_id": creator_id, "backdrop_url": backdrop_url}
