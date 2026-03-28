"""
plex_ws.py — Plex WebSocket listener for real-time library updates.

Connects to each configured Plex server's /:/websocket endpoint and listens
for TimelineEntry events.  When Plex finishes refreshing metadata for an item
(state=5) we fire a targeted plex_item_refresh so the local cache stays in
sync without waiting for the next full polling cycle (default 30 min).

Debouncing: Plex can fire many events in quick succession during a metadata
refresh.  We collect itemIDs for DEBOUNCE_SECONDS then refresh them in one
batch to avoid hammering the DB and Plex API.

Auto-reconnect: each server connection runs in its own task with exponential
back-off capped at MAX_BACKOFF_SECONDS.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger(__name__)

# Only process these Plex media types (others are playlists, photos, etc.)
_REFRESH_TYPES = {
    1,  # movie
    2,  # show
    3,  # season
    4,  # episode
    8,  # collection
}

# state=5 means Plex finished matching / metadata refresh
_STATE_DONE = 5
# state=0 means newly added
_STATE_NEW = 0
# state=9 means deleted (skip — we don't support deletion yet)
_STATE_DELETED = 9

DEBOUNCE_SECONDS = 3.0
MAX_BACKOFF_SECONDS = 60


async def _debounced_refresh(
    app: "FastAPI",
    pending: dict[str, float],
    lock: asyncio.Lock,
) -> None:
    """
    Wait until no new events have arrived for DEBOUNCE_SECONDS, then flush
    all pending item IDs as targeted refreshes.
    """
    from .plex_sync import plex_item_refresh

    while True:
        await asyncio.sleep(DEBOUNCE_SECONDS)
        async with lock:
            if not pending:
                continue
            items = list(pending.keys())
            pending.clear()

        for item_id in items:
            try:
                await plex_item_refresh(app, item_id)
                logger.debug("plex_ws: refreshed item %s", item_id)
            except Exception as e:
                logger.warning("plex_ws: refresh failed for item %s: %s", item_id, e)


async def _listen_server(app: "FastAPI", server: dict) -> None:
    """
    Connect to one Plex server's WebSocket and dispatch timeline events.
    Reconnects automatically with exponential back-off.
    """
    try:
        import websockets  # type: ignore[import-untyped]
    except ImportError:
        logger.warning(
            "plex_ws: 'websockets' package not available — real-time updates disabled. "
            "Install via: uv add websockets"
        )
        return

    server_id = server.get("id", "?")
    base_url = server.get("base_url", "").rstrip("/")
    token = server.get("token", "")
    if not base_url or not token:
        return

    ws_url = (
        base_url.replace("https://", "wss://").replace("http://", "ws://")
        + f"/:/websocket?X-Plex-Token={token}"
    )

    # Shared debounce state for this server
    pending: dict[str, float] = {}
    lock = asyncio.Lock()
    debounce_task = asyncio.create_task(
        _debounced_refresh(app, pending, lock)
    )

    backoff = 2.0
    try:
        while True:
            try:
                logger.info("plex_ws: connecting to server %s", server_id)
                async with websockets.connect(
                    ws_url,
                    ping_interval=30,
                    ping_timeout=10,
                    open_timeout=15,
                    additional_headers={"X-Plex-Product": "OpenPoster"},
                ) as ws:
                    backoff = 2.0  # reset on successful connect
                    logger.info("plex_ws: connected to server %s", server_id)
                    async for raw in ws:
                        try:
                            msg = json.loads(raw)
                        except Exception:
                            continue
                        container = msg.get("NotificationContainer", {})
                        msg_type = container.get("type", "")

                        if msg_type == "timeline":
                            entries = container.get("TimelineEntry", [])
                            async with lock:
                                for entry in entries:
                                    state = entry.get("state", -1)
                                    media_type = entry.get("type", -1)
                                    item_id = str(entry.get("itemID", ""))
                                    if (
                                        state in (_STATE_DONE, _STATE_NEW)
                                        and media_type in _REFRESH_TYPES
                                        and item_id
                                    ):
                                        pending[item_id] = asyncio.get_event_loop().time()
                                        logger.debug(
                                            "plex_ws: queued refresh for item %s "
                                            "(state=%s type=%s)",
                                            item_id, state, media_type,
                                        )

            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(
                    "plex_ws: connection to server %s lost (%s) — retrying in %.0fs",
                    server_id, e, backoff,
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)
    finally:
        debounce_task.cancel()
        with asyncio.suppress(asyncio.CancelledError):
            await debounce_task


def attach_plex_ws(app: "FastAPI") -> None:
    """
    Start one WebSocket listener task per configured Plex server.
    Call from lifecycle.py after DB is ready (alongside attach_plex_sync).
    """
    from .routes.plex import _load_servers

    cfg = app.state.cfg
    servers = [s for s in _load_servers(cfg.data_dir) if s.get("type") == "plex"]
    if not servers:
        return

    tasks: list[asyncio.Task] = []
    for server in servers:
        task = asyncio.create_task(_listen_server(app, server))
        tasks.append(task)
        logger.info("plex_ws: started listener for server %s (%s)", server.get("id"), server.get("name"))

    app.state.plex_ws_tasks = tasks
