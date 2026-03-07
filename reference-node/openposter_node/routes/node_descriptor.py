from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/.well-known/openposter-node")
async def node_descriptor(request: Request):
    cfg = request.app.state.cfg
    node_id = request.app.state.node_id
    signing_info = request.app.state.signing_info

    base_url = cfg.base_url or str(request.base_url).rstrip("/")

    return {
        "protocol": "openposter",
        "api_versions": ["v1"],
        "node_id": node_id,
        "name": cfg.node_name,
        "base_url": base_url,
        "operator": {
            "display_name": cfg.operator_name,
            "contact": cfg.operator_contact,
        },
        "features": {
            "search": True,
            "nodes_gossip": False,
            "blobs": True,
            "premium": False,
            "signed_metadata": True,
        },
        "signing_keys": [
            {
                "key_id": signing_info.key_id,
                "alg": signing_info.alg,
                "public_key": signing_info.public_key_b64,
            }
        ],
        "trusted_issuers": [],
    }
