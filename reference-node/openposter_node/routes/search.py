from __future__ import annotations

from fastapi import APIRouter, Query, Request
from sqlalchemy import select

from ..crypto.signing import sign_poster_entry
from ..db import Poster

router = APIRouter()


@router.get("/search")
async def search(
    request: Request,
    tmdb_id: int = Query(...),
    type: str | None = Query(None),  # noqa: A002 (spec uses `type`)
    kind: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = Query(None),
):
    # Cursor is opaque; MVP ignores it and returns first page only.
    session_maker = request.app.state.Session

    async with session_maker() as session:
        stmt = select(Poster).where(Poster.tmdb_id == tmdb_id).where(Poster.deleted_at.is_(None))
        if type:
            stmt = stmt.where(Poster.media_type == type)
        if kind:
            stmt = stmt.where(Poster.kind == kind)
        stmt = stmt.limit(limit)
        posters = (await session.execute(stmt)).scalars().all()

    cfg = request.app.state.cfg
    node_id = request.app.state.node_id

    results = []
    for p in posters:
        origin_preview_url = f"{cfg.base_url}/v1/blobs/{p.preview_hash}" if cfg.base_url else f"{request.base_url}v1/blobs/{p.preview_hash}"
        origin_full_url = f"{cfg.base_url}/v1/blobs/{p.full_hash}" if cfg.base_url else f"{request.base_url}v1/blobs/{p.full_hash}"

        # Mirror URLs are simply alternate hosts serving the same blob hash.
        mirror_preview_urls = [f"{m}/v1/blobs/{p.preview_hash}" for m in cfg.mirrors]
        mirror_full_urls = [f"{m}/v1/blobs/{p.full_hash}" for m in cfg.mirrors]

        entry = {
            "poster_id": p.poster_id,
            "kind": p.kind or "poster",
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
                    "url": origin_preview_url,
                    "bytes": p.preview_bytes,
                    "mime": p.preview_mime,
                    "width": p.preview_width,
                    "height": p.preview_height,
                    "sources": ([
                        {"url": origin_preview_url, "role": "origin"},
                        *[{"url": u, "role": "mirror"} for u in mirror_preview_urls],
                    ] if (cfg.mirrors) else [{"url": origin_preview_url, "role": "origin"}]),
                },
                "full": {
                    "access": p.full_access,
                    "hash": p.full_hash,
                    "url": (mirror_full_urls[0] if mirror_full_urls else origin_full_url),
                    "bytes": p.full_bytes,
                    "mime": p.full_mime,
                    "width": p.full_width,
                    "height": p.full_height,
                    "sources": ([
                        {"url": origin_full_url, "role": "origin"},
                        *[{"url": u, "role": "mirror"} for u in mirror_full_urls],
                    ] if (cfg.mirrors) else [{"url": origin_full_url, "role": "origin"}]),
                    "encryption": (
                        {
                            "alg": p.enc_alg,
                            "key_id": p.enc_key_id,
                            "nonce": p.enc_nonce,
                        }
                        if p.full_access == "premium"
                        else None
                    ),
                },
            },
            "attribution": {
                "source_url": p.attribution_source_url,
                "license": p.attribution_license,
                "redistribution": p.attribution_redistribution,
            },
        }

        # Remove encryption: null if not premium
        if entry["assets"]["full"]["encryption"] is None:
            entry["assets"]["full"].pop("encryption")

        signed = sign_poster_entry(request.app.state.signing_key, entry, key_id=request.app.state.signing_info.key_id)
        results.append(signed)

    return {"results": results, "next_cursor": None}
