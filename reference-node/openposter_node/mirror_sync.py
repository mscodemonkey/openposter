from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import FastAPI

from .storage.blobs import blob_path


def _now_rfc3339() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


async def _download_blob(client: httpx.AsyncClient, url: str, dst: Path) -> None:
    r = await client.get(url)
    r.raise_for_status()
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(r.content)


async def mirror_sync_once(app: FastAPI) -> None:
    cfg = app.state.cfg
    origin = getattr(app.state, "mirror_origin", None)
    if not origin:
        return

    state_path = cfg.data_dir / "mirror_state.json"
    since = None
    if state_path.exists():
        try:
            since = json.loads(state_path.read_text()).get("since")
        except Exception:
            since = None

    params = {}
    if since:
        params["since"] = since

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        r = await client.get(origin + "/v1/changes", params=params)
        if r.status_code == 409:
            # cursor expired, full resync
            r = await client.get(origin + "/v1/changes")
        r.raise_for_status()
        payload = r.json()

        for ch in payload.get("changes", []):
            if ch.get("kind") != "upsert":
                continue
            poster_id = ch.get("poster_id")
            if not poster_id:
                continue

            pr = await client.get(origin + f"/v1/posters/{poster_id}")
            if pr.status_code != 200:
                continue
            poster = pr.json()

            # Pull all blob urls from sources (prefer origin role)
            for key in ("preview", "full"):
                asset = (poster.get("assets") or {}).get(key) or {}
                sources = asset.get("sources") or []
                # Find origin source; else fall back to asset.url
                url = None
                for s in sources:
                    if s.get("role") == "origin":
                        url = s.get("url")
                        break
                url = url or asset.get("url")
                h = asset.get("hash")
                if not url or not h:
                    continue
                dst = blob_path(cfg.data_dir, h)
                if dst.exists():
                    continue
                try:
                    await _download_blob(client, url, dst)
                except Exception:
                    continue

        next_since = payload.get("next_since")
        state_path.write_text(json.dumps({"since": next_since, "updated_at": _now_rfc3339()}, indent=2) + "\n")


async def mirror_loop(app: FastAPI) -> None:
    while True:
        try:
            await mirror_sync_once(app)
        except Exception:
            pass
        await asyncio.sleep(getattr(app.state, "mirror_poll_seconds", 30))


def attach_mirror(app: FastAPI, *, origin: str, poll_seconds: int = 30) -> None:
    app.state.mirror_origin = origin.rstrip("/")
    app.state.mirror_poll_seconds = poll_seconds
    app.state.mirror_task = asyncio.create_task(mirror_loop(app))
