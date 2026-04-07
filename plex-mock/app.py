from __future__ import annotations

import base64
import copy
import os
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse

app = FastAPI(title="OpenPoster Plex Mock", version="0.1.0")

PLEX_TOKEN = os.environ.get("PLEX_TOKEN", "dev-plex-token")
RESET_TOKEN = os.environ.get("OPENPOSTER_DEV_RESET_TOKEN", "dev-reset")
SERVER_NAME = os.environ.get("PLEX_SERVER_NAME", "OpenPoster Plex Mock")

# Tiny valid PNGs so the UI has real image bytes to work with.
BLUE_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAwMBAS8S7hUAAAAASUVORK5CYII="
)
RED_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8zwAAAgEBAM0G0w0AAAAASUVORK5CYII="
)
GREEN_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN6kAAAAASUVORK5CYII="
)
YELLOW_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/58AAwMCAQotR6cAAAAASUVORK5CYII="
)


def _require_token(token: str | None) -> None:
    if token != PLEX_TOKEN:
        raise HTTPException(status_code=401, detail="invalid token")


def _images(slot_prefix: str) -> dict[str, bytes]:
    return {
        "poster": BLUE_PNG,
        "art": GREEN_PNG,
        "logo": YELLOW_PNG,
        "square": RED_PNG,
    }


def _item(
    rating_key: str,
    *,
    title: str,
    item_type: str,
    year: int | None = None,
    index: int | None = None,
    tmdb_id: int | None = None,
    child_count: int | None = None,
    leaf_count: int | None = None,
    children: list[str] | None = None,
    defaults: dict[str, bytes] | None = None,
) -> dict[str, Any]:
    return {
        "ratingKey": rating_key,
        "title": title,
        "type": item_type,
        "year": year,
        "index": index,
        "childCount": child_count,
        "leafCount": leaf_count,
        "Guid": ([{"id": f"tmdb://{tmdb_id}"}] if tmdb_id is not None else []),
        "children": children or [],
        "labels": [],
        "artwork": defaults or _images(rating_key),
    }


def _default_state() -> dict[str, Any]:
    return {
        "sections": [
            {"key": "1", "title": "Movies", "type": "movie"},
            {"key": "2", "title": "TV Shows", "type": "show"},
        ],
        "items": {
            "movie-646": _item(
                "movie-646",
                title="Dr. No",
                item_type="movie",
                year=1962,
                tmdb_id=646,
            ),
            "collection-645": _item(
                "collection-645",
                title="James Bond Collection",
                item_type="collection",
                child_count=1,
                leaf_count=1,
                children=["movie-646"],
                defaults=_images("collection-645"),
            ),
            "show-201834": _item(
                "show-201834",
                title="ted",
                item_type="show",
                year=2024,
                tmdb_id=201834,
                child_count=1,
                leaf_count=1,
                children=["season-201834-1"],
            ),
            "season-201834-1": _item(
                "season-201834-1",
                title="Season 1",
                item_type="season",
                index=1,
                child_count=1,
                leaf_count=1,
                children=["episode-201834-1-1"],
            ),
            "episode-201834-1-1": _item(
                "episode-201834-1-1",
                title="Pilot",
                item_type="episode",
                index=1,
            ),
        },
        "section_items": {
            "1": ["movie-646"],
            "2": ["show-201834"],
        },
        "collections": {
            "1": ["collection-645"],
        },
    }


app.state.mock = _default_state()


def _clone_item(item: dict[str, Any]) -> dict[str, Any]:
    data = {
        "ratingKey": item["ratingKey"],
        "title": item["title"],
        "type": item["type"],
    }
    if item.get("year") is not None:
        data["year"] = item["year"]
    if item.get("index") is not None:
        data["index"] = item["index"]
    if item.get("childCount") is not None:
        data["childCount"] = item["childCount"]
    if item.get("leafCount") is not None:
        data["leafCount"] = item["leafCount"]
    if item.get("Guid"):
        data["Guid"] = copy.deepcopy(item["Guid"])
    if item.get("labels"):
        data["Label"] = [{"tag": label} for label in item["labels"]]
    images: list[dict[str, str]] = []
    if item["artwork"].get("logo") is not None:
        images.append({"type": "clearLogo", "url": f"/library/metadata/{item['ratingKey']}/clearLogo/current"})
    if item["artwork"].get("square") is not None:
        images.append({"type": "backgroundSquare", "url": f"/library/metadata/{item['ratingKey']}/squareArt/current"})
    if images:
        data["Image"] = images
    return data


@app.get("/healthz")
async def healthz():
    return {"ok": True}


@app.get("/dev/reset")
async def dev_reset(token: str = Query(default="")):
    if token != RESET_TOKEN:
        return JSONResponse(status_code=404, content={"error": {"code": "not_found", "message": "not found"}})
    app.state.mock = _default_state()
    return {"ok": True, "wiped": True}


@app.get("/")
async def root(x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    return {"MediaContainer": {"friendlyName": SERVER_NAME}}


@app.get("/System/Info")
async def system_info(request: Request):
    _require_token(request.headers.get("X-Emby-Token"))
    return {"ServerName": SERVER_NAME}


@app.get("/library/sections")
async def library_sections(x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    return {"MediaContainer": {"Directory": copy.deepcopy(app.state.mock["sections"])}}


@app.get("/library/sections/{section_key}/all")
async def section_all(section_key: str, x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    ids = app.state.mock["section_items"].get(section_key, [])
    return {"MediaContainer": {"Metadata": [_clone_item(app.state.mock["items"][item_id]) for item_id in ids]}}


@app.get("/library/sections/{section_key}/collections")
async def section_collections(section_key: str, x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    ids = app.state.mock["collections"].get(section_key, [])
    return {"MediaContainer": {"Metadata": [_clone_item(app.state.mock["items"][item_id]) for item_id in ids]}}


@app.get("/library/metadata/{rating_key}")
async def metadata(rating_key: str, x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    item = app.state.mock["items"].get(rating_key)
    if item is None:
        return Response(status_code=404)
    return {"MediaContainer": {"Metadata": [_clone_item(item)]}}


@app.put("/library/metadata/{rating_key}")
async def update_metadata(rating_key: str, request: Request, x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    item = app.state.mock["items"].get(rating_key)
    if item is None:
        return Response(status_code=404)
    labels: list[str] = []
    for key, value in request.query_params.multi_items():
        if key.startswith("label[") and key.endswith("].tag.tag") and value:
            labels.append(value)
    item["labels"] = labels
    return {"MediaContainer": {"Metadata": [_clone_item(item)]}}


@app.get("/library/metadata/{rating_key}/children")
async def children(rating_key: str, x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    item = app.state.mock["items"].get(rating_key)
    if item is None:
        return Response(status_code=404)
    return {
        "MediaContainer": {
            "Metadata": [_clone_item(app.state.mock["items"][child_id]) for child_id in item.get("children", [])]
        }
    }


def _slot_response(rating_key: str, slot: str) -> Response:
    item = app.state.mock["items"].get(rating_key)
    if item is None:
        return Response(status_code=404)
    data = item["artwork"].get(slot)
    if data is None:
        return Response(status_code=404)
    return Response(content=data, media_type="image/png")


@app.get("/library/metadata/{rating_key}/thumb")
async def thumb(rating_key: str, x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    return _slot_response(rating_key, "poster" if app.state.mock["items"].get(rating_key, {}).get("type") != "episode" else "thumb")


@app.get("/library/metadata/{rating_key}/art")
async def art(rating_key: str, x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    return _slot_response(rating_key, "art")


@app.get("/library/metadata/{rating_key}/clearLogo/current")
async def clear_logo_current(rating_key: str, x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    return _slot_response(rating_key, "logo")


@app.get("/library/metadata/{rating_key}/squareArt/current")
async def square_art_current(rating_key: str, x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    return _slot_response(rating_key, "square")


async def _store_artwork(rating_key: str, request: Request, slot: str) -> Response:
    item = app.state.mock["items"].get(rating_key)
    if item is None:
        return Response(status_code=404)
    item["artwork"][slot] = await request.body()
    return Response(status_code=200)


@app.post("/library/metadata/{rating_key}/posters")
async def upload_poster(rating_key: str, request: Request, x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    return await _store_artwork(rating_key, request, "poster")


@app.post("/library/metadata/{rating_key}/thumbs")
async def upload_thumb(rating_key: str, request: Request, x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    return await _store_artwork(rating_key, request, "thumb")


@app.post("/library/metadata/{rating_key}/arts")
async def upload_art(rating_key: str, request: Request, x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    return await _store_artwork(rating_key, request, "art")


@app.post("/library/metadata/{rating_key}/clearLogos")
async def upload_logo(rating_key: str, request: Request, x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    return await _store_artwork(rating_key, request, "logo")


@app.post("/library/metadata/{rating_key}/squareArts")
async def upload_square(rating_key: str, request: Request, x_plex_token: str | None = Query(default=None, alias="X-Plex-Token")):
    _require_token(x_plex_token)
    return await _store_artwork(rating_key, request, "square")
