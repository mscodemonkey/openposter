from fastapi import FastAPI, Request

from .cors import attach_cors
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .lifecycle import attach_lifecycle
from .routes.admin import router as admin_router
from .routes.blobs import router as blobs_router
from .routes.changes import router as changes_router
from .routes.node_descriptor import router as node_descriptor_router
from .routes.node_info import router as node_info_router
from .routes.pair_ui import router as pair_ui_router
from .routes.nodes import router as nodes_router
from .routes.feed import router as feed_router
from .routes.applied_artwork import router as applied_artwork_router
from .routes.plex import router as plex_router
from .routes.media_server import router as media_server_router
from .routes.webhooks import router as webhooks_router
from .routes.posters import router as posters_router
from .routes.themes import router as themes_router
from .routes.posters_list import router as posters_list_router
from .routes.search import router as search_router

app = FastAPI(title="OpenPoster Reference Node", version="0.1.0")

attach_cors(app)

@app.get("/v1/health")
async def health():
    return {"ok": True}


@app.get("/.well-known/openposter-claim.txt")
async def well_known_claim(request: Request):
    from fastapi.responses import PlainTextResponse
    token = getattr(request.app.state, "claim_token", None)
    if not token:
        return JSONResponse(status_code=404, content={"error": {"code": "not_found", "message": "no claim token set"}})
    return PlainTextResponse(token)


@app.get("/dev/reset")
async def dev_reset(request: Request, token: str = ""):
    """Wipe all data for local testing. Only works when OPENPOSTER_DEV_RESET_TOKEN is set."""
    import os
    import shutil
    from sqlalchemy import text
    expected = os.environ.get("OPENPOSTER_DEV_RESET_TOKEN", "")
    if not expected or token != expected:
        return JSONResponse(status_code=404, content={"error": {"code": "not_found", "message": "not found"}})
    session = request.app.state.Session
    async with session() as s:
        for table in ("applied_artwork", "plex_library_items", "plex_sync_state", "creator_settings",
                      "creator_profile", "creator_theme", "posters", "admin_sessions", "peers"):
            await s.execute(text(f"DELETE FROM {table}"))
        await s.commit()
    # Remove blobs and seed data
    data_dir = request.app.state.cfg.data_dir
    blobs_dir = data_dir / "blobs"
    if blobs_dir.exists():
        shutil.rmtree(blobs_dir)
        blobs_dir.mkdir(parents=True, exist_ok=True)
    seed_file = data_dir / "seed.json"
    if seed_file.exists():
        seed_file.unlink()
    return {"ok": True, "wiped": True}

attach_lifecycle(app)


@app.on_event("shutdown")
async def _shutdown():
    for attr in ("gossip_health_task", "gossip_revalidation_task", "gossip_discovery_task", "mirror_task"):
        task = getattr(app.state, attr, None)
        if task:
            task.cancel()


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all so unhandled errors return JSON with CORS headers rather than Starlette's plain-text 500."""
    import logging
    logging.getLogger(__name__).exception("Unhandled exception on %s %s", request.method, request.url.path)
    origin = request.headers.get("origin", "")
    headers = {"access-control-allow-origin": origin} if origin else {}
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal", "message": "internal server error"}},
        headers=headers,
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # If our code raised an HTTPException with detail already matching {"error": ...},
    # return it as-is (spec wants top-level error object, not under "detail").
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": "invalid_request", "message": str(exc.detail)}})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    fields = []
    for err in exc.errors():
        loc = err.get("loc", [])
        # loc like ("query","tmdb_id") or ("body","field")
        path = "/" + "/".join(str(p) for p in loc[1:]) if len(loc) > 1 else "/"
        fields.append({"path": path, "error": err.get("type", "invalid")})
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "invalid_request",
                "message": "validation error",
                "details": {"fields": fields},
            }
        },
    )


app.include_router(node_descriptor_router)
app.include_router(node_info_router)
app.include_router(search_router, prefix="/v1")
app.include_router(changes_router, prefix="/v1")
app.include_router(nodes_router, prefix="/v1")
app.include_router(posters_list_router, prefix="/v1")
app.include_router(posters_router, prefix="/v1")
app.include_router(blobs_router, prefix="/v1")
app.include_router(admin_router, prefix="/v1")
app.include_router(themes_router, prefix="/v1")
app.include_router(feed_router, prefix="/v1")
app.include_router(plex_router, prefix="/v1")
app.include_router(applied_artwork_router, prefix="/v1")
app.include_router(media_server_router, prefix="/v1")
app.include_router(webhooks_router, prefix="/v1")
app.include_router(pair_ui_router)
