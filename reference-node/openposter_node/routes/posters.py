from __future__ import annotations

from fastapi import APIRouter, Request
from sqlalchemy import select

from ..crypto.signing import sign_poster_entry
from ..db import Poster
from ..errors import http_error

router = APIRouter()


@router.get("/posters/{poster_id}")
async def get_poster(request: Request, poster_id: str):
    session_maker = request.app.state.Session

    async with session_maker() as session:
        p = (await session.execute(select(Poster).where(Poster.poster_id == poster_id))).scalar_one_or_none()

    if p is None:
        raise http_error(404, "not_found", "poster not found")

    cfg = request.app.state.cfg

    entry = {
        "poster_id": p.poster_id,
        "media": {
            "type": p.media_type,
            "tmdb_id": p.tmdb_id,
            "title": p.title,
            "year": p.year,
        },
        "creator": {
            "creator_id": p.creator_id,
            "display_name": p.creator_display_name,
            "home_node": p.creator_home_node,
        },
        "assets": {
            "preview": {
                "hash": p.preview_hash,
                "url": f"{cfg.base_url}/v1/blobs/{p.preview_hash}" if cfg.base_url else f"{request.base_url}v1/blobs/{p.preview_hash}",
                "bytes": p.preview_bytes,
                "mime": p.preview_mime,
                "width": p.preview_width,
                "height": p.preview_height,
            },
            "full": {
                "access": p.full_access,
                "hash": p.full_hash,
                "url": f"{cfg.base_url}/v1/blobs/{p.full_hash}" if cfg.base_url else f"{request.base_url}v1/blobs/{p.full_hash}",
                "bytes": p.full_bytes,
                "mime": p.full_mime,
                "width": p.full_width,
                "height": p.full_height,
            },
        },
        "attribution": {
            "source_url": p.attribution_source_url,
            "license": p.attribution_license,
            "redistribution": p.attribution_redistribution,
        },
    }

    signed = sign_poster_entry(request.app.state.signing_key, entry, key_id=request.app.state.signing_info.key_id)
    return signed
