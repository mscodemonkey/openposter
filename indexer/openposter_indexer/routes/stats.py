from __future__ import annotations

from fastapi import APIRouter, Request
from sqlalchemy import func, select

from ..db import IndexedPoster, NodeHealth

router = APIRouter()


@router.get("/stats")
async def stats(request: Request):
    """Simple indexer stats for UI/debug."""

    Session = request.app.state.Session

    async with Session() as session:
        posters = (await session.execute(select(func.count()).select_from(IndexedPoster))).scalar_one()
        nodes_total = (await session.execute(select(func.count()).select_from(NodeHealth))).scalar_one()
        nodes_up = (
            await session.execute(select(func.count()).select_from(NodeHealth).where(NodeHealth.status == "up"))
        ).scalar_one()

    return {
        "posters": int(posters or 0),
        "nodes": {"total": int(nodes_total or 0), "up": int(nodes_up or 0)},
    }
