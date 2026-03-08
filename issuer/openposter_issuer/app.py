from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware

from .lifecycle import attach_lifecycle
from .routes.auth_routes import router as auth_router
from .routes.creator_routes import router as creator_router
from .routes.nodes_routes import router as nodes_router
from .routes.url_claim_routes import router as url_claim_router

app = FastAPI(title="OpenPoster Issuer", version="0.1.0")

# CORS: allow the local web UI to call the issuer from the browser.
# (MVP: permissive; tighten later.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/v1/health")
async def health():
    return {"ok": True}


attach_lifecycle(app)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": "invalid_request", "message": str(exc.detail)}})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    fields = []
    for err in exc.errors():
        loc = err.get("loc", [])
        path = "/" + "/".join(str(p) for p in loc[1:]) if len(loc) > 1 else "/"
        fields.append({"path": path, "error": err.get("type", "invalid")})
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "invalid_request", "message": "validation error", "details": {"fields": fields}}},
    )


app.include_router(auth_router)
app.include_router(creator_router)
app.include_router(nodes_router)
app.include_router(url_claim_router)
