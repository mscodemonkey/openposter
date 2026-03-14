from __future__ import annotations

from fastapi import APIRouter, Request

from ..storage.blobs import blob_path, serve_blob
from ..errors import http_error
from .auth import require_admin

router = APIRouter()


@router.get("/blobs/{hash}")
async def get_blob(request: Request, hash: str):  # noqa: A002 (spec uses `hash`)
    cfg = request.app.state.cfg
    return serve_blob(cfg.data_dir, hash)


@router.delete("/blobs/{hash}")
async def delete_blob(request: Request, hash: str):  # noqa: A002
    """Delete a stored blob by SHA-256 hash.

    Used by the indexer to propagate creator deletions to mirror nodes.
    Requires admin auth.
    """
    await require_admin(request)
    cfg = request.app.state.cfg
    path = blob_path(cfg.data_dir, hash)
    if not path.exists():
        raise http_error(404, "not_found", "blob not found")
    path.unlink()
    return {"ok": True, "hash": hash}
