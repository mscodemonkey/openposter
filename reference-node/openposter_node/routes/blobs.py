from __future__ import annotations

from fastapi import APIRouter, Request

from ..config import load_config
from ..storage.blobs import serve_blob

router = APIRouter()


@router.get("/blobs/{hash}")
async def get_blob(request: Request, hash: str):  # noqa: A002 (spec uses `hash`)
    cfg = request.app.state.cfg
    return serve_blob(cfg.data_dir, hash)
