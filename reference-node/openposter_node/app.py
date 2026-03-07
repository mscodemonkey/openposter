from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .lifecycle import attach_lifecycle
from .routes.blobs import router as blobs_router
from .routes.node_descriptor import router as node_descriptor_router
from .routes.posters import router as posters_router
from .routes.search import router as search_router

app = FastAPI(title="OpenPoster Reference Node", version="0.1.0")

attach_lifecycle(app)


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
app.include_router(search_router, prefix="/v1")
app.include_router(posters_router, prefix="/v1")
app.include_router(blobs_router, prefix="/v1")
