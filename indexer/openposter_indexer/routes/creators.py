from __future__ import annotations

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, select

from ..db import IndexedPoster

router = APIRouter()


@router.get("/creators")
async def creators(
    request: Request,
    limit: int = Query(200, ge=1, le=500),
    q: str | None = Query(None),
):
    """List creators seen by the indexer.

    Returns aggregate stats for basic browsing.
    """

    Session = request.app.state.Session

    async with Session() as session:
        stmt = (
            select(
                IndexedPoster.creator_id,
                func.max(IndexedPoster.creator_display_name).label("display_name"),
                func.count(IndexedPoster.poster_id).label("count"),
                func.max(IndexedPoster.changed_at).label("last_changed_at"),
            )
            .where(IndexedPoster.creator_id.is_not(None))
        )

        if q is not None and q.strip() != "":
            stmt = stmt.where(IndexedPoster.creator_display_name.ilike(f"%{q.strip()}%"))

        stmt = (
            stmt.group_by(IndexedPoster.creator_id)
            .order_by(func.max(IndexedPoster.changed_at).desc())
            .limit(limit)
        )

        rows = (await session.execute(stmt)).all()

    results = []
    for creator_id, display_name, count, last_changed_at in rows:
        results.append(
            {
                "creator_id": creator_id,
                "display_name": display_name,
                "count": int(count or 0),
                "last_changed_at": last_changed_at,
            }
        )

    return {"results": results}


@router.get("/by_creator")
async def by_creator(
    request: Request,
    creator_id: str,
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = Query(None),
):
    """List posters for a given creator.

    For pagination, use the next_cursor returned by /v1/search or /v1/recent.
    (cursor format: {c, p}).
    """

    # reuse same semantics as /recent (changed_at desc, poster_id desc)
    from sqlalchemy import and_, desc, or_

    from ..pagination import decode_cursor, encode_cursor

    cur = decode_cursor(cursor) if cursor else None
    cur_changed_at = cur.get("c") if isinstance(cur, dict) else None
    cur_poster_id = cur.get("p") if isinstance(cur, dict) else None

    Session = request.app.state.Session

    async with Session() as session:
        stmt = select(IndexedPoster).where(IndexedPoster.creator_id == str(creator_id))

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

    import json

    results = [json.loads(r.poster_json) for r in rows]

    next_cursor = None
    if rows:
        last = rows[-1]
        next_cursor = encode_cursor({"c": last.changed_at, "p": last.poster_id})

    return {"results": results, "next_cursor": next_cursor}
