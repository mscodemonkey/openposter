from __future__ import annotations

import base64
import json
from fastapi import APIRouter, Query, Request
from sqlalchemy import select

from ..crypto.signing import sign_poster_entry
from ..db import Poster

router = APIRouter()


def encode_cursor(updated_at: str, poster_id: str) -> str:
    payload = {"u": updated_at, "p": poster_id}
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: str) -> tuple[str, str] | None:
    if not cursor:
        return None
    pad = "=" * (-len(cursor) % 4)
    raw = base64.urlsafe_b64decode((cursor + pad).encode("ascii"))
    payload = json.loads(raw)
    return payload.get("u"), payload.get("p")


@router.get("/posters")
async def list_posters(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = Query(None),
    creator_id: str | None = Query(None),
    kind: str | None = Query(None),
):
    """List posters on this node.

    This is primarily for creator tooling and indexers.
    """

    cfg = request.app.state.cfg

    since = decode_cursor(cursor) if cursor else None
    since_updated_at, since_poster_id = since if since else (None, None)

    session_maker = request.app.state.Session
    async with session_maker() as session:
        stmt = select(Poster).where(Poster.deleted_at.is_(None))
        if creator_id:
            stmt = stmt.where(Poster.creator_id == creator_id)
        if kind:
            stmt = stmt.where(Poster.kind == kind)

        if since_updated_at:
            stmt = stmt.where(
                (Poster.updated_at > since_updated_at)
                | ((Poster.updated_at == since_updated_at) & (Poster.poster_id > (since_poster_id or "")))
            )

        stmt = stmt.order_by(Poster.updated_at.asc(), Poster.poster_id.asc()).limit(limit)
        posters = (await session.execute(stmt)).scalars().all()

    results = []
    next_cursor = None
    for p in posters:
        origin_preview_url = f"{cfg.base_url}/v1/blobs/{p.preview_hash}" if cfg.base_url else f"{request.base_url}v1/blobs/{p.preview_hash}"
        origin_full_url = f"{cfg.base_url}/v1/blobs/{p.full_hash}" if cfg.base_url else f"{request.base_url}v1/blobs/{p.full_hash}"
        mirror_preview_urls = [f"{m}/v1/blobs/{p.preview_hash}" for m in cfg.mirrors]
        mirror_full_urls = [f"{m}/v1/blobs/{p.full_hash}" for m in cfg.mirrors]

        media = {
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

        entry = {
            "poster_id": p.poster_id,
            "kind": p.kind or "poster",
            "published": bool(p.published),
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
        next_cursor = encode_cursor(p.updated_at, p.poster_id)

    return {"results": results, "next_cursor": next_cursor}
