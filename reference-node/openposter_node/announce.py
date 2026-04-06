"""
Announce this node to a directory node on startup.

If OPENPOSTER_ANNOUNCE_TO is set, the node will POST its registration URL to
that directory's /v1/nodes endpoint after startup, retrying with backoff.

OPENPOSTER_ANNOUNCE_URL   — the URL the directory should store and serve to
                             indexers (typically the Docker-internal service URL,
                             e.g. http://node-a:8080). Defaults to BASE_URL.
OPENPOSTER_ANNOUNCE_TO    — the directory node's base URL to announce to
                             (e.g. http://directory:8080).
"""
from __future__ import annotations

import asyncio
import logging

import httpx
from fastapi import FastAPI

logger = logging.getLogger(__name__)


def schedule_announce(app: FastAPI, directory_url: str, announce_as: str) -> None:
    """Schedule a background task to announce this node to the directory."""

    directory = directory_url.rstrip("/")

    async def _task() -> None:
        for attempt in range(6):
            if attempt > 0:
                delay = min(2 ** attempt, 30)
                await asyncio.sleep(delay)
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    r = await client.post(
                        f"{directory}/v1/nodes",
                        json={"url": announce_as},
                    )
                if r.status_code in (200, 201):
                    logger.info(
                        "Announced to directory %s as %s", directory, announce_as
                    )
                    return
                logger.warning(
                    "Directory announce HTTP %s (attempt %d)", r.status_code, attempt + 1
                )
            except Exception as exc:
                logger.warning("Directory announce attempt %d failed: %s", attempt + 1, exc)

        logger.error("Gave up announcing to directory %s after 6 attempts", directory)

    asyncio.create_task(_task())
