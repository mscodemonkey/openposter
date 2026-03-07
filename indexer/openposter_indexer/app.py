from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .lifecycle import attach_lifecycle
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
# MVP: allow all origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/v1/health")
async def health():
    return {"ok": True}

attach_lifecycle(app)

app.include_router(search_router, prefix="/v1")
app.include_router(recent_router, prefix="/v1")
app.include_router(creators_router, prefix="/v1")
app.include_router(facets_router, prefix="/v1")
app.include_router(posters_router, prefix="/v1")
app.include_router(stats_router, prefix="/v1")
app.include_router(tv_boxset_router, prefix="/v1")
app.include_router(nodes_router, prefix="/v1")
