"""
routes/webhooks.py — Inbound webhook receivers.

Plex Webhooks (Plex Pass required):
  POST /v1/webhooks/plex

Register this URL in Plex → Settings → Webhooks.
Plex sends multipart/form-data with a single `payload` field containing JSON.

Handled events:
  library.new        — new item added; triggers a targeted item refresh
  library.on.deck    — item moved to On Deck; same targeted refresh

All other events are acknowledged but ignored.
"""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Request

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/webhooks/plex")
async def plex_webhook(request: Request):
    """
    Receive a Plex webhook and trigger a targeted sync for relevant events.
    Returns 200 immediately — the refresh runs as a background task.
    """
    from ..plex_sync import plex_item_refresh

    try:
        form = await request.form()
        payload_raw = form.get("payload", "")
        payload = json.loads(payload_raw) if payload_raw else {}
    except Exception as e:
        logger.warning("plex_webhook: failed to parse payload: %s", e)
        return {"ok": True}

    event = payload.get("event", "")
    metadata = payload.get("Metadata", {})
    rating_key = str(metadata.get("ratingKey", "")).strip()

    logger.info("plex_webhook: event=%s ratingKey=%s", event, rating_key or "(none)")

    if event in ("library.new", "library.on.deck") and rating_key:
        asyncio.create_task(
            _safe_refresh(request.app, rating_key, event)
        )

    return {"ok": True}


async def _safe_refresh(app, item_id: str, event: str) -> None:
    try:
        await plex_item_refresh(app, item_id)
        logger.info("plex_webhook: refreshed item %s (triggered by %s)", item_id, event)
    except Exception as e:
        logger.warning("plex_webhook: refresh failed for item %s: %s", item_id, e)
