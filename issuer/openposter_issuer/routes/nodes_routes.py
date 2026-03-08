from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from ..auth import require_user_id
from ..db import Node, NodeAdmin, NodeUrl, new_uuid
from ..util import canonicalize_public_url

router = APIRouter()


def _bad(code: str, message: str, status: int = 400):
    raise HTTPException(status_code=status, detail={"error": {"code": code, "message": message}})


def _normalize_base(url: str) -> str:
    base = (url or "").strip().rstrip("/")

    # Dev convenience: if issuer is running in Docker, "localhost" points at the
    # issuer container. Docker Desktop provides host.docker.internal to reach host.
    if base.startswith("http://localhost") or base.startswith("http://127.0.0.1"):
        base = base.replace("http://localhost", "http://host.docker.internal", 1)
        base = base.replace("http://127.0.0.1", "http://host.docker.internal", 1)
    if base.startswith("https://localhost") or base.startswith("https://127.0.0.1"):
        base = base.replace("https://localhost", "https://host.docker.internal", 1)
        base = base.replace("https://127.0.0.1", "https://host.docker.internal", 1)

    return base


class ClaimNodeReq(BaseModel):
    local_url: str
    node_admin_token: str


@router.post("/v1/nodes/claim")
async def claim_node(req: ClaimNodeReq, request: Request):
    """Claim a node as admin.

    MVP: issuer verifies admin rights by calling the node's local URL using the provided
    node_admin_token (obtained from node bootstrap claim flow).
    """

    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))

    local_base = _normalize_base(req.local_url)
    if not local_base.startswith("http://") and not local_base.startswith("https://"):
        _bad("invalid_url", "local_url must start with http:// or https://")

    token = (req.node_admin_token or "").strip()
    if not token:
        _bad("invalid_request", "missing node_admin_token")

    async with httpx.AsyncClient(timeout=5.0) as client:
        # Verify admin token works and obtain node_id.
        try:
            who = await client.get(
                f"{local_base}/v1/admin/whoami",
                headers={"authorization": f"Bearer {token}"},
            )
        except Exception as e:
            _bad("node_unreachable", f"failed to reach node: {e}")
        if who.status_code != 200:
            _bad("node_admin_failed", f"node admin check failed: {who.status_code}")

        who_json: Any = who.json()
        node_id = ((who_json or {}).get("admin") or {}).get("node_id")
        if not isinstance(node_id, str) or not node_id:
            _bad("node_admin_failed", "node did not return node_id")

        # Fetch public node info (optional but handy for UI)
        node_info: dict[str, Any] | None = None
        try:
            ni = await client.get(f"{local_base}/v1/node")
            if ni.status_code == 200:
                node_info = ni.json()
        except Exception:
            node_info = None

    session = request.app.state.Session
    async with session() as s:
        n = (await s.execute(select(Node).where(Node.node_id == node_id))).scalar_one_or_none()
        if n is None:
            n = Node(node_id=node_id, owner_user_id=user_id)
            s.add(n)
        else:
            # If the node already exists, only the owner can (re-)claim admin.
            if n.owner_user_id != user_id:
                raise HTTPException(
                    status_code=403,
                    detail={"error": {"code": "not_owner", "message": "node is owned by another user"}},
                )

        # Ensure user is recorded as admin of the node.
        existing_admin = (
            await s.execute(
                select(NodeAdmin).where(NodeAdmin.user_id == user_id, NodeAdmin.node_id == node_id)
            )
        ).scalar_one_or_none()
        if existing_admin is None:
            s.add(NodeAdmin(id=new_uuid(), user_id=user_id, node_id=node_id))

        await s.commit()

    return {
        "node": {
            "node_id": node_id,
            "owner_user_id": user_id,
        },
        "node_info": node_info,
    }


class AttachUrlReq(BaseModel):
    node_id: str
    public_url: str


@router.post("/v1/nodes/attach_url")
async def attach_url(req: AttachUrlReq, request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))

    node_id = (req.node_id or "").strip()
    if not node_id:
        _bad("invalid_request", "missing node_id")

    url = canonicalize_public_url(req.public_url)
    if not url:
        _bad("invalid_url", "invalid public_url")

    session = request.app.state.Session
    async with session() as s:
        n = (await s.execute(select(Node).where(Node.node_id == node_id))).scalar_one_or_none()
        if n is None:
            raise HTTPException(status_code=404, detail={"error": {"code": "not_found", "message": "node not found"}})

        # Must be node owner to manage its public URLs.
        if n.owner_user_id != user_id:
            raise HTTPException(status_code=403, detail={"error": {"code": "not_owner", "message": "not node owner"}})

        existing = (await s.execute(select(NodeUrl).where(NodeUrl.public_url == url))).scalar_one_or_none()
        if existing is None:
            s.add(NodeUrl(public_url=url, node_id=node_id, owner_user_id=user_id))
            await s.commit()
            return {"public_url": url, "node_id": node_id, "replaced": False}

        # If URL exists, only the URL owner can replace it.
        if existing.owner_user_id != user_id:
            raise HTTPException(status_code=403, detail={"error": {"code": "url_taken", "message": "public URL owned by another user"}})

        replaced = existing.node_id != node_id
        existing.node_id = node_id
        await s.commit()
        return {"public_url": url, "node_id": node_id, "replaced": replaced}


@router.get("/v1/nodes")
async def list_nodes(request: Request):
    """Directory list for bootstrapping.

    MVP: returns node_id + its attached public URLs.
    """

    session = request.app.state.Session
    async with session() as s:
        nodes = (await s.execute(select(Node))).scalars().all()
        urls = (await s.execute(select(NodeUrl))).scalars().all()

    urls_by_node: dict[str, list[str]] = {}
    for u in urls:
        urls_by_node.setdefault(u.node_id, []).append(u.public_url)

    return {
        "nodes": [
            {
                "node_id": n.node_id,
                "owner_user_id": n.owner_user_id,
                "public_urls": sorted(urls_by_node.get(n.node_id, [])),
            }
            for n in nodes
        ]
    }


@router.get("/v1/nodes/by_url")
async def by_url(public_url: str, request: Request):
    url = canonicalize_public_url(public_url)
    if not url:
        _bad("invalid_url", "invalid public_url")

    session = request.app.state.Session
    async with session() as s:
        row = (await s.execute(select(NodeUrl).where(NodeUrl.public_url == url))).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail={"error": {"code": "not_found", "message": "url not found"}})
        return {"public_url": url, "node_id": row.node_id, "owner_user_id": row.owner_user_id}
