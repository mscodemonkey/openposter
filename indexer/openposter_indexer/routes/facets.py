from __future__ import annotations

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, select

from ..db import IndexedPoster

router = APIRouter()


@router.get("/facets")
async def facets(
    request: Request,
    creators_limit: int = Query(50, ge=1, le=500),
):
    """Facet aggregates for basic browsing/filter UIs."""

    Session = request.app.state.Session

    async with Session() as session:
        media_type_rows = (
            await session.execute(
                select(IndexedPoster.media_type, func.count(IndexedPoster.poster_id))
                .group_by(IndexedPoster.media_type)
                .order_by(func.count(IndexedPoster.poster_id).desc())
            )
        ).all()

        creator_rows = (
            await session.execute(
                select(
                    IndexedPoster.creator_id,
                    func.max(IndexedPoster.creator_display_name),
                    func.count(IndexedPoster.poster_id),
                )
                .where(IndexedPoster.creator_id.is_not(None))
                .group_by(IndexedPoster.creator_id)
                .order_by(func.count(IndexedPoster.poster_id).desc())
                .limit(creators_limit)
            )
        ).all()

    return {
        "media_types": [
            {"type": mt, "count": int(c or 0)} for (mt, c) in media_type_rows if mt
        ],
        "creators": [
            {
                "creator_id": cid,
                "display_name": dn,
                "count": int(c or 0),
            }
            for (cid, dn, c) in creator_rows
            if cid
        ],
    }
