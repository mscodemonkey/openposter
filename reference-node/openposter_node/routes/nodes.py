from __future__ import annotations

import base64
import os
import socket
import ipaddress
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Body, Query, Request
from sqlalchemy import select

from ..db import Peer
from ..errors import http_error

router = APIRouter()

TRUST_THRESHOLD = 3  # vouching peers required to skip independent revalidation


def _now_rfc3339() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _is_private_host(host: str) -> bool:
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

    allow_private = os.environ.get("OPENPOSTER_ALLOW_PRIVATE_NODES", "").lower() in {"1", "true", "yes"}
    host = p.hostname
    if host is None:
        raise http_error(400, "invalid_request", "node url missing host")
    if not allow_private and _is_private_host(host):
        raise http_error(400, "invalid_request", "private/localhost node urls are not allowed")

    return url


def _validate_signing_keys(keys: list) -> None:
    """Require at least one valid Ed25519 key (32-byte public key, base64-encoded)."""
    if not keys or not isinstance(keys, list):
        raise http_error(400, "invalid_request", "signing_keys must be a non-empty list")

    for key in keys:
        if not isinstance(key, dict):
            continue
        if key.get("alg") != "ed25519":
            continue
        pub = key.get("public_key")
        if not isinstance(pub, str):
            continue
        raw = pub[len("base64:"):] if pub.startswith("base64:") else pub
        try:
            decoded = base64.b64decode(raw)
            if len(decoded) == 32:
                return  # found a valid key
        except Exception:
            continue

    raise http_error(400, "invalid_request", "signing_keys must contain at least one valid ed25519 key (32 bytes)")


async def fetch_and_validate_descriptor(url: str) -> dict:
    """Fetch node descriptor and validate all required fields. Returns the descriptor."""
    desc_url = url + "/.well-known/openposter-node"
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            r = await client.get(desc_url)
            if r.status_code != 200:
                raise http_error(400, "invalid_request", f"node descriptor not reachable: {r.status_code}")
            data = r.json()
    except http_error:
        raise
    except Exception as e:
        raise http_error(400, "invalid_request", f"failed to fetch node descriptor: {e}")

    if data.get("protocol") != "openposter":
        raise http_error(400, "invalid_request", "node descriptor: protocol != openposter")
    if "v1" not in (data.get("api_versions") or []):
        raise http_error(400, "invalid_request", "node descriptor: api_versions does not include v1")

    node_id = data.get("node_id")
    if not node_id or not isinstance(node_id, str):
        raise http_error(400, "invalid_request", "node descriptor: node_id is missing or invalid")

    _validate_signing_keys(data.get("signing_keys") or [])

    return data


@router.get("/nodes")
async def get_nodes(
    request: Request,
    limit: int = Query(200, ge=1, le=1000),
):
    cfg = request.app.state.cfg
    base_url = cfg.base_url or str(request.base_url).rstrip("/")

    self_entry = {
        "url": base_url,
        "node_id": request.app.state.node_id,
        "name": cfg.node_name,
        "status": "active",
        "last_seen": _now_rfc3339(),
    }

    async with request.app.state.Session() as session:
        rows = (
            await session.execute(
                select(Peer).where(Peer.status == "active").limit(limit - 1)
            )
        ).scalars().all()

    seen = {base_url}
    out = [self_entry]
    for r in rows:
        if r.url in seen:
            continue
        seen.add(r.url)
        out.append({
            "url": r.url,
            "node_id": r.node_id,
            "name": r.name,
            "status": r.status,
            "last_seen": r.last_seen,
        })

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

    # Basic anti-abuse rate limiting (per-process).
    bucket = getattr(request.app.state, "nodes_reg_bucket", {"t": 0, "n": 0})
    import time
    now_ts = int(time.time())
    if now_ts != bucket.get("t"):
        bucket = {"t": now_ts, "n": 0}
    bucket["n"] += 1
    request.app.state.nodes_reg_bucket = bucket
    if bucket["n"] > 10:
        raise http_error(429, "rate_limited", "too many registrations, slow down")

    now = _now_rfc3339()

    async with request.app.state.Session() as session:
        existing = await session.get(Peer, url)

        if existing is not None and existing.trust_score >= TRUST_THRESHOLD:
            # Already trusted — just refresh last_seen, no re-validation needed.
            existing.last_seen = now
            # Reset unreachable status if node is re-announcing after downtime.
            if existing.status == "unreachable":
                # Re-validate before reinstating.
                desc = await fetch_and_validate_descriptor(url)
                existing.status = "active"
                existing.consecutive_failures = 0
                existing.node_id = desc.get("node_id")
                existing.name = desc.get("name")
                existing.last_validated = now
            await session.commit()
        else:
            # Validate descriptor independently.
            desc = await fetch_and_validate_descriptor(url)
            node_id = desc.get("node_id")

            # Check node_id stability: if we already know this peer, its node_id must not change.
            if existing is not None and existing.node_id and existing.node_id != node_id:
                raise http_error(400, "invalid_request", "node_id mismatch: node identity changed")

            if existing is None:
                peer = Peer(
                    url=url,
                    node_id=node_id,
                    name=desc.get("name"),
                    status="active",
                    trust_score=1,
                    first_seen=now,
                    last_seen=now,
                    last_validated=now,
                    consecutive_failures=0,
                )
                session.add(peer)
            else:
                existing.node_id = node_id
                existing.name = desc.get("name")
                existing.status = "active"
                existing.trust_score = existing.trust_score + 1
                existing.last_seen = now
                existing.last_validated = now
                existing.consecutive_failures = 0
            await session.commit()

    return {"ok": True, "url": url, "last_seen": now}
