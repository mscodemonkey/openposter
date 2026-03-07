from __future__ import annotations

from fastapi import APIRouter, Query, Request
from sqlalchemy import select

from ..db import NodeHealth

router = APIRouter()


@router.get("/nodes")
async def nodes(request: Request, limit: int = Query(500, ge=1, le=5000)):
    Session = request.app.state.Session

    async with Session() as session:
        rows = (await session.execute(select(NodeHealth).limit(limit))).scalars().all()

    return {
        "nodes": [
            {
                "url": r.node_url,
                "status": r.status,
                "last_crawled_at": r.last_crawled_at,
                "last_seen_up": r.last_seen_up,
                "down_since": r.down_since,
                "consecutive_failures": int(r.consecutive_failures or "0"),
            }
            for r in rows
        ]
    }
