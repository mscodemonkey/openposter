from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone

from fastapi import Request

from ..errors import http_error


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def require_admin(request: Request) -> None:
    """Accept either legacy OPENPOSTER_ADMIN_TOKEN (dev) or a claimed admin session token."""
    auth = request.headers.get("authorization") or ""
    if not auth.startswith("Bearer "):
        raise http_error(401, "unauthorized", "missing bearer token")

    provided = auth.split(" ", 1)[1].strip()

    # Legacy: static admin token (kept for dev/backwards compat)
    legacy = os.environ.get("OPENPOSTER_ADMIN_TOKEN")
    if legacy and provided == legacy:
        return

    from ..db import AdminSession

    h = _token_hash(provided)
    async with request.app.state.Session() as session:
        row = await session.get(AdminSession, h)
        if row is None:
            raise http_error(403, "forbidden", "invalid admin token")

        now = datetime.now(timezone.utc)
        try:
            exp = datetime.fromisoformat(row.expires_at.replace("Z", "+00:00"))
        except Exception:
            exp = None
        if exp and now >= exp:
            await session.delete(row)
            await session.commit()
            raise http_error(403, "forbidden", "admin session expired")
