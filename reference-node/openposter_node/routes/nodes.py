from __future__ import annotations

from datetime import datetime, timezone
import os
import socket
import ipaddress
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Body, Query, Request

from ..errors import http_error

router = APIRouter()


def _now_rfc3339() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _is_private_host(host: str) -> bool:
    # Resolve host to IPs and check if any are private/loopback/link-local.
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:
        return True

    for info in infos:
        sockaddr = info[4]
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except Exception:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return True
    return False


def _normalize_url(url: str) -> str:
    url = url.strip().rstrip("/")
    p = urlparse(url)
    if p.scheme not in {"http", "https"}:
        raise http_error(400, "invalid_request", "node url must be http(s)")
    if not p.netloc:
        raise http_error(400, "invalid_request", "node url missing host")

    # Basic SSRF hardening: block private/localhost by default.
    allow_private = os.environ.get("OPENPOSTER_ALLOW_PRIVATE_NODES", "").lower() in {"1", "true", "yes"}
    host = p.hostname
    if host is None:
        raise http_error(400, "invalid_request", "node url missing host")
    if not allow_private and _is_private_host(host):
        raise http_error(400, "invalid_request", "private/localhost node urls are not allowed")

    return url


async def _validate_node(url: str) -> dict:
    # Minimal validation: fetch node descriptor.
    # NOTE: this is not a complete SSRF defense; production deployments should harden this.
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

    # Very basic anti-abuse rate limiting (per-process).
    # This is a stopgap for beta testing; production should use a real rate limiter.
    bucket = getattr(request.app.state, "nodes_reg_bucket", {"t": 0, "n": 0})
    import time

    now = int(time.time())
    if now != bucket.get("t"):
        bucket = {"t": now, "n": 0}
    bucket["n"] += 1
    request.app.state.nodes_reg_bucket = bucket
    if bucket["n"] > 10:
        raise http_error(429, "rate_limited", "too many registrations, slow down")

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
