from __future__ import annotations

import json

from fastapi import APIRouter, Request
from sqlalchemy import asc, select

from ..db import IndexedPoster

router = APIRouter()


@router.get("/tv_boxset/{show_tmdb_id}")
async def tv_boxset(request: Request, show_tmdb_id: str):
    """Return a structured TV box-set view for a show.

    This is a UI convenience endpoint that groups:
    - main show posters
    - season posters
    - episode title cards

    Grouping key for seasons/episodes is media.show_tmdb_id.
    """

    Session = request.app.state.Session

    async with Session() as session:
        # main show posters
        show_rows = (
            await session.execute(
                select(IndexedPoster)
                .where(IndexedPoster.media_type == "show")
                .where(IndexedPoster.tmdb_id == str(show_tmdb_id))
            )
        ).scalars().all()

        season_rows = (
            await session.execute(
                select(IndexedPoster)
                .where(IndexedPoster.media_type == "season")
                .where(IndexedPoster.show_tmdb_id == str(show_tmdb_id))
                .order_by(asc(IndexedPoster.season_number), asc(IndexedPoster.changed_at))
            )
        ).scalars().all()

        episode_rows = (
            await session.execute(
                select(IndexedPoster)
                .where(IndexedPoster.media_type == "episode")
                .where(IndexedPoster.show_tmdb_id == str(show_tmdb_id))
                .order_by(
                    asc(IndexedPoster.season_number),
                    asc(IndexedPoster.episode_number),
                    asc(IndexedPoster.changed_at),
                )
            )
        ).scalars().all()

    show = [json.loads(r.poster_json) for r in show_rows]
    seasons = [json.loads(r.poster_json) for r in season_rows]

    episodes_by_season: dict[str, list[dict]] = {}
    for r in episode_rows:
        season = r.season_number or "0"
        episodes_by_season.setdefault(season, []).append(json.loads(r.poster_json))

    return {
        "show_tmdb_id": str(show_tmdb_id),
        "show": show,
        "seasons": seasons,
        "episodes_by_season": episodes_by_season,
    }
