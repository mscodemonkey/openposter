from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from ..auth import require_user_id
from ..db import CreatorHandle

router = APIRouter()

_HANDLE_RE = re.compile(r"^[a-z0-9_]{3,32}$")


def normalize_handle(handle: str) -> str:
    return (handle or "").strip().lower()


def validate_handle(handle: str) -> None:
    if not _HANDLE_RE.match(handle):
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "invalid_handle",
                    "message": "handle must be 3-32 chars: a-z, 0-9, underscore",
                }
            },
        )


class ClaimReq(BaseModel):
    handle: str


@router.get("/v1/creator/availability")
async def availability(handle: str, request: Request):
    h = normalize_handle(handle)
    validate_handle(h)

    session = request.app.state.Session
    async with session() as s:
        existing = (await s.execute(select(CreatorHandle).where(CreatorHandle.handle == h))).scalar_one_or_none()

    return {"handle": h, "available": existing is None}


@router.post("/v1/creator/claim_handle")
async def claim_handle(req: ClaimReq, request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))

    h = normalize_handle(req.handle)
    validate_handle(h)

    session = request.app.state.Session
    async with session() as s:
        existing = (await s.execute(select(CreatorHandle).where(CreatorHandle.handle == h))).scalar_one_or_none()
        if existing:
            if existing.user_id == user_id:
                return {"creator": {"handle": h, "user_id": user_id}}
            raise HTTPException(
                status_code=409,
                detail={"error": {"code": "handle_taken", "message": "handle already taken"}},
            )

        s.add(CreatorHandle(handle=h, user_id=user_id))
        await s.commit()

    return {"creator": {"handle": h, "user_id": user_id}}
