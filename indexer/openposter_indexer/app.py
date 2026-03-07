from fastapi import FastAPI

from .lifecycle import attach_lifecycle
from .routes.search import router as search_router

app = FastAPI(title="OpenPoster Indexer", version="0.1.0")

@app.get("/v1/health")
async def health():
    return {"ok": True}

attach_lifecycle(app)

app.include_router(search_router, prefix="/v1")
