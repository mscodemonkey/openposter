from __future__ import annotations

import json

from fastapi import APIRouter, Query, Request
from sqlalchemy import select

from ..db import IndexedPoster

router = APIRouter()


@router.get("/search")
async def search(
    request: Request,
    tmdb_id: str | None = Query(None),
    type: str | None = Query(None),  # noqa: A002
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = Query(None),
):
    # MVP: only tmdb_id/type filtering. Cursor ignored.
    Session = request.app.state.Session

    async with Session() as session:
        stmt = select(IndexedPoster)
        if tmdb_id is not None:
            stmt = stmt.where(IndexedPoster.tmdb_id == str(tmdb_id))
        if type is not None:
            stmt = stmt.where(IndexedPoster.media_type == type)
        stmt = stmt.limit(limit)

        rows = (await session.execute(stmt)).scalars().all()

    results = [json.loads(r.poster_json) for r in rows]
    return {"results": results, "next_cursor": None}
