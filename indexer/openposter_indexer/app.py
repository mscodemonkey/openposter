from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from .lifecycle import attach_lifecycle
from .routes.admin import router as admin_router
from .routes.blob_sources import router as blob_sources_router
from .routes.creators import router as creators_router
from .routes.facets import router as facets_router
from .routes.nodes import router as nodes_router
from .routes.posters import router as posters_router
from .routes.recent import router as recent_router
from .routes.search import router as search_router
from .routes.stats import router as stats_router
from .routes.tv_boxset import router as tv_boxset_router

app = FastAPI(title="OpenPoster Indexer", version="0.1.0")

# CORS: the web UI is typically served from a different origin (e.g. http://localhost:3000)
# than the indexer API (e.g. http://localhost:8090). Allow browser access.
# Note: wildcard origins can't be used with credentialed requests, so we allow common local dev origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/v1/health")
async def health():
    return {"ok": True}


@app.get("/dev/reset")
async def dev_reset(token: str = ""):
    """Wipe all indexed data for local testing. Only works when OPENPOSTER_DEV_RESET_TOKEN is set."""
    import os
    from sqlalchemy import text

    expected = os.environ.get("OPENPOSTER_DEV_RESET_TOKEN", "")
    if not expected or token != expected:
        return JSONResponse(status_code=404, content={"error": {"code": "not_found", "message": "not found"}})

    session = app.state.Session
    async with session() as s:
        for table in ("blob_mirrors", "indexed_posters", "node_cursors", "node_health"):
            await s.execute(text(f"DELETE FROM {table}"))
        await s.commit()

    return {"ok": True, "wiped": True}

attach_lifecycle(app)

app.include_router(search_router, prefix="/v1")
app.include_router(recent_router, prefix="/v1")
app.include_router(creators_router, prefix="/v1")
app.include_router(facets_router, prefix="/v1")
app.include_router(posters_router, prefix="/v1")
app.include_router(stats_router, prefix="/v1")
app.include_router(tv_boxset_router, prefix="/v1")
app.include_router(nodes_router, prefix="/v1")
app.include_router(blob_sources_router, prefix="/v1")
app.include_router(admin_router, prefix="/v1")
