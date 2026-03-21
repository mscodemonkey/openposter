from __future__ import annotations

from fastapi import APIRouter, Request
from sqlalchemy import select

from ..db import NodeCursor

router = APIRouter()


@router.post("/admin/reindex")
async def admin_reindex(request: Request):
    """Reset all node cursors so the next crawler cycle re-indexes everything from scratch."""
    async with request.app.state.Session() as session:
        cursors = (await session.execute(select(NodeCursor))).scalars().all()
        for cursor in cursors:
            cursor.since = None
        await session.commit()
    return {"ok": True, "cursors_reset": len(cursors)}
