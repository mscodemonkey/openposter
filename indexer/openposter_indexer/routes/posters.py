from __future__ import annotations

import json

from fastapi import APIRouter, Request
from sqlalchemy import select

from ..db import IndexedPoster

router = APIRouter()


@router.get("/posters/{poster_id}")
async def get_indexed_poster(request: Request, poster_id: str):
    """Fetch a single indexed poster by poster_id.

    Convenience endpoint for the web UI.
    """

    Session = request.app.state.Session

    async with Session() as session:
        row = (
            await session.execute(
                select(IndexedPoster).where(IndexedPoster.poster_id == str(poster_id))
            )
        ).scalar_one_or_none()

    if row is None:
        return {"error": "not_found"}

    return json.loads(row.poster_json)
