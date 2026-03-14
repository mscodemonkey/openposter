from __future__ import annotations

from fastapi import APIRouter, Request
from sqlalchemy import select

from ..db import BlobMirror

router = APIRouter()


@router.get("/blobs/{blob_hash}/sources")
async def get_blob_sources(request: Request, blob_hash: str):
    """Return all known mirror URLs for a blob.

    The mirror registry is built as a byproduct of crawling sources[] in signed
    poster records.  Only mirror-role sources are stored here; the origin URL is
    always the node that served the poster.
    """
    async with request.app.state.Session() as session:
        rows = (
            await session.execute(
                select(BlobMirror).where(BlobMirror.blob_hash == blob_hash)
            )
        ).scalars().all()

    return {
        "blob_hash": blob_hash,
        "mirrors": [r.mirror_url for r in rows],
    }
