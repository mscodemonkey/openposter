from __future__ import annotations

import base64
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request
from sqlalchemy import select

from ..db import Poster

router = APIRouter()


def _now_rfc3339() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def encode_cursor(updated_at: str, poster_id: str) -> str:
    payload = {"u": updated_at, "p": poster_id}
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: str) -> tuple[str, str] | None:
    if not cursor:
        return None
    pad = "=" * (-len(cursor) % 4)
    raw = base64.urlsafe_b64decode((cursor + pad).encode("ascii"))
    payload = json.loads(raw)
    return payload.get("u"), payload.get("p")


@router.get("/changes")
async def changes(
    request: Request,
    since: str | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
):
    # MVP: cursor is (updated_at, poster_id). This supports stable paging.
    since_decoded = decode_cursor(since) if since else None
    since_updated_at, since_poster_id = since_decoded if since_decoded else (None, None)

    session_maker = request.app.state.Session

    async with session_maker() as session:
        stmt = select(Poster)

        if since_updated_at:
            # (updated_at, poster_id) > (since_updated_at, since_poster_id)
            stmt = stmt.where(
                (Poster.updated_at > since_updated_at)
                | ((Poster.updated_at == since_updated_at) & (Poster.poster_id > (since_poster_id or "")))
            )

        stmt = stmt.order_by(Poster.updated_at.asc(), Poster.poster_id.asc()).limit(limit)
        posters = (await session.execute(stmt)).scalars().all()

    changes_out = []
    next_since = None
    for p in posters:
        kind = "delete" if p.deleted_at is not None else "upsert"
        changes_out.append({"poster_id": p.poster_id, "changed_at": p.updated_at, "kind": kind})
        next_since = encode_cursor(p.updated_at, p.poster_id)

    return {"changes": changes_out, "next_since": next_since}
