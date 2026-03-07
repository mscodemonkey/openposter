from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Body, Query, Request
from sqlalchemy import String, select

from ..errors import http_error

router = APIRouter()


def _now_rfc3339() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _normalize_url(url: str) -> str:
    url = url.strip().rstrip("/")
    p = urlparse(url)
    if p.scheme not in {"http", "https"}:
        raise http_error(400, "invalid_request", "node url must be http(s)")
    if not p.netloc:
        raise http_error(400, "invalid_request", "node url missing host")
    return url


async def _validate_node(url: str) -> dict:
    # Minimal validation: fetch node descriptor.
    desc_url = url + "/.well-known/openposter-node"
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            r = await client.get(desc_url)
            if r.status_code != 200:
                raise http_error(400, "invalid_request", f"node descriptor not reachable: {r.status_code}")
            data = r.json()
    except http_error:
        raise
    except Exception as e:
        raise http_error(400, "invalid_request", f"failed to validate node: {e}")

    if data.get("protocol") != "openposter":
        raise http_error(400, "invalid_request", "node descriptor protocol mismatch")
    if "v1" not in (data.get("api_versions") or []):
        raise http_error(400, "invalid_request", "node does not advertise v1")

    return data


@router.get("/nodes")
async def get_nodes(
    request: Request,
    limit: int = Query(200, ge=1, le=1000),
):
    # Stored in a simple JSON file in /data for now.
    cfg = request.app.state.cfg
    store_path = cfg.data_dir / "nodes.json"
    if not store_path.exists():
        nodes = []
    else:
        import json

        nodes = json.loads(store_path.read_text())

    # always include ourselves
    base_url = cfg.base_url or str(request.base_url).rstrip("/")
    self_entry = {"url": base_url, "last_seen": _now_rfc3339()}

    # de-dupe
    seen = {self_entry["url"]}
    out = [self_entry]
    for n in nodes:
        u = n.get("url")
        if not u or u in seen:
            continue
        seen.add(u)
        out.append(n)
        if len(out) >= limit:
            break

    return {"nodes": out}


@router.post("/nodes")
async def register_node(
    request: Request,
    payload: dict = Body(...),
):
    url = payload.get("url") or payload.get("node_url")
    if not isinstance(url, str):
        raise http_error(400, "invalid_request", "missing url")

    url = _normalize_url(url)

    # Validate by fetching descriptor.
    _ = await _validate_node(url)

    cfg = request.app.state.cfg
    store_path = cfg.data_dir / "nodes.json"
    import json

    nodes = []
    if store_path.exists():
        nodes = json.loads(store_path.read_text())

    now = _now_rfc3339()
    # Update or insert
    updated = False
    for n in nodes:
        if n.get("url") == url:
            n["last_seen"] = now
            updated = True
            break
    if not updated:
        nodes.append({"url": url, "last_seen": now})

    store_path.write_text(json.dumps(nodes, indent=2) + "\n")

    return {"ok": True, "url": url, "last_seen": now}
