from __future__ import annotations

import json

from fastapi import APIRouter, Query, Request
from sqlalchemy import desc, select

from ..db import IndexedPoster

router = APIRouter()


@router.get("/recent")
async def recent(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    media_type: str | None = Query(None),
):
    """Return recently changed posters.

    MVP browse endpoint for the web UI.
    """

    Session = request.app.state.Session

    async with Session() as session:
        stmt = select(IndexedPoster)
        if media_type is not None:
            stmt = stmt.where(IndexedPoster.media_type == str(media_type))
        stmt = stmt.order_by(desc(IndexedPoster.changed_at)).limit(limit)
        rows = (await session.execute(stmt)).scalars().all()

    results = [json.loads(r.poster_json) for r in rows]
    return {"results": results}
