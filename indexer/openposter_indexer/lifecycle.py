from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI
from sqlalchemy import select

from .config import load_config
from .db import Base, IndexedPoster, NodeCursor, make_engine, make_sessionmaker


def _now_rfc3339() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


async def _fetch_json(client: httpx.AsyncClient, url: str) -> dict:
    r = await client.get(url)
    r.raise_for_status()
    return r.json()


async def crawl_once(app: FastAPI) -> None:
    cfg = app.state.cfg
    Session = app.state.Session

    # Build node set from seeds + discovered node lists.
    nodes: set[str] = set(cfg.seed_nodes)
    issuer_cache: dict[str, dict] = getattr(app.state, "node_desc_cache", {})
    signing_key_cache: dict[str, str] = getattr(app.state, "node_signing_key_cache", {})

    async with httpx.AsyncClient(timeout=8.0) as client:
        # discovery via /v1/nodes
        for seed in list(nodes):
            try:
                data = await _fetch_json(client, seed + "/v1/nodes")
                for n in data.get("nodes", []):
                    u = (n.get("url") or "").rstrip("/")
                    if u:
                        nodes.add(u)
            except Exception:
                continue

        # crawl changes for each node
        async with Session() as session:
            for node in sorted(nodes):
                cur = (await session.execute(select(NodeCursor).where(NodeCursor.node_url == node))).scalar_one_or_none()
                since = cur.since if cur else None

                params = {}
                if since:
                    params["since"] = since

                try:
                    r = await client.get(node + "/v1/changes", params=params)
                    if r.status_code == 409:
                        # cursor expired: reset and try a full sync (since=None)
                        since = None
                        params = {}
                        r = await client.get(node + "/v1/changes", params=params)
                    r.raise_for_status()
                    payload = r.json()
                except Exception:
                    continue

                changes = payload.get("changes", [])
                next_since = payload.get("next_since")

                for ch in changes:
                    poster_id = ch.get("poster_id")
                    kind = ch.get("kind")
                    changed_at = ch.get("changed_at")
                    if not poster_id:
                        continue

                    if kind == "delete":
                        # Remove from index
                        existing = (await session.execute(select(IndexedPoster).where(IndexedPoster.poster_id == poster_id))).scalar_one_or_none()
                        if existing is not None:
                            await session.delete(existing)
                        continue

                    if kind != "upsert":
                        continue

                    try:
                        poster = await _fetch_json(client, node + f"/v1/posters/{poster_id}")
                    except Exception:
                        continue

                    # Verify signature
                    pub = signing_key_cache.get(node)
                    if pub is None:
                        try:
                            desc = await _fetch_json(client, node + "/.well-known/openposter-node")
                            issuer_cache[node] = desc
                            keys = desc.get("signing_keys") or []
                            pub = keys[0].get("public_key") if keys else None
                            if isinstance(pub, str):
                                signing_key_cache[node] = pub
                        except Exception:
                            pub = None

                    if not pub:
                        continue

                    from .verify import verify_poster_signature

                    if not verify_poster_signature(poster, public_key_b64=pub):
                        continue

                    media = poster.get("media", {})
                    tmdb_id = media.get("tmdb_id")
                    media_type = media.get("type")
                    if tmdb_id is None or not media_type:
                        continue

                    row = IndexedPoster(
                        poster_id=poster_id,
                        source_node=node,
                        media_type=str(media_type),
                        tmdb_id=str(tmdb_id),
                        changed_at=changed_at or _now_rfc3339(),
                        poster_json=json.dumps(poster, separators=(",", ":")),
                    )
                    await session.merge(row)

                # update cursor
                if cur is None:
                    cur = NodeCursor(node_url=node, since=next_since)
                    session.add(cur)
                else:
                    cur.since = next_since

            await session.commit()

    app.state.node_desc_cache = issuer_cache
    app.state.node_signing_key_cache = signing_key_cache


async def crawler_loop(app: FastAPI) -> None:
    while True:
        try:
            await crawl_once(app)
        except Exception:
            pass
        await asyncio.sleep(app.state.cfg.poll_seconds)


async def init_app_state(app: FastAPI) -> None:
    cfg = load_config()
    app.state.cfg = cfg

    engine = make_engine(cfg.data_dir)
    app.state.engine = engine
    app.state.Session = make_sessionmaker(engine)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    app.state.crawler_task = asyncio.create_task(crawler_loop(app))


def attach_lifecycle(app: FastAPI) -> None:
    @app.on_event("startup")
    async def _startup():
        await init_app_state(app)

    @app.on_event("shutdown")
    async def _shutdown():
        task = getattr(app.state, "crawler_task", None)
        if task:
            task.cancel()
