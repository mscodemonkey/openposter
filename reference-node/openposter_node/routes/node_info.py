from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/v1/node")
async def node_info(request: Request):
    cfg = request.app.state.cfg
    return {
        "node": {
            # New stable identity (UUID)
            "node_id": request.app.state.node_uuid,
            # Legacy id still used in poster ids
            "legacy_node_id": request.app.state.node_id,
            "name": cfg.node_name,
            "operator": {
                "name": cfg.operator_name,
                "contact": cfg.operator_contact,
            },
            "base_url": cfg.base_url,
            "mirrors": cfg.mirrors,
        }
    }
