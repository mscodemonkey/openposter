from __future__ import annotations

import json

from fastapi import APIRouter, Query, Request
from sqlalchemy import and_, desc, or_, select

from ..db import IndexedPoster
from ..pagination import decode_cursor, encode_cursor

router = APIRouter()


@router.get("/recent")
async def recent(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    media_type: str | None = Query(None),
    creator_id: str | None = Query(None),
    cursor: str | None = Query(None),
):
    """Return recently changed posters.

    Ordered by changed_at desc, then poster_id desc.
    Cursor is opaque (base64 json: {c:<changed_at>, p:<poster_id>}).
    """

    cur = decode_cursor(cursor) if cursor else None
    cur_changed_at = cur.get("c") if isinstance(cur, dict) else None
    cur_poster_id = cur.get("p") if isinstance(cur, dict) else None

    Session = request.app.state.Session

    async with Session() as session:
        stmt = select(IndexedPoster)
        if media_type is not None:
            stmt = stmt.where(IndexedPoster.media_type == str(media_type))
        if creator_id is not None:
            stmt = stmt.where(IndexedPoster.creator_id == str(creator_id))

        if cur_changed_at and cur_poster_id:
            stmt = stmt.where(
                or_(
                    IndexedPoster.changed_at < str(cur_changed_at),
                    and_(
                        IndexedPoster.changed_at == str(cur_changed_at),
                        IndexedPoster.poster_id < str(cur_poster_id),
                    ),
                )
            )

        stmt = stmt.order_by(desc(IndexedPoster.changed_at), desc(IndexedPoster.poster_id)).limit(limit)
        rows = (await session.execute(stmt)).scalars().all()

    results = [json.loads(r.poster_json) for r in rows]

    next_cursor = None
    if rows:
        last = rows[-1]
        next_cursor = encode_cursor({"c": last.changed_at, "p": last.poster_id})

    return {"results": results, "next_cursor": next_cursor}
