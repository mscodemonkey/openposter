from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI
from sqlalchemy import select

from .config import load_config
from .db import Base, IndexedPoster, NodeCursor, NodeHealth, make_engine, make_sessionmaker


def _now_rfc3339() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _norm_rfc3339(ts: str | None) -> str:
    """Normalize timestamps for stable ordering.

    Accepts a few common ISO-8601 variants and returns RFC3339 with Z.
    Falls back to now if parsing fails.
    """

    if not ts:
        return _now_rfc3339()

    try:
        s = str(ts)
        if s.endswith("Z"):
            s2 = s.replace("Z", "+00:00")
        else:
            s2 = s
        dt = datetime.fromisoformat(s2)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    except Exception:
        return _now_rfc3339()


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

                nh = (await session.execute(select(NodeHealth).where(NodeHealth.node_url == node))).scalar_one_or_none()
                if nh is None:
                    nh = NodeHealth(
                        node_url=node,
                        status="unknown",
                        last_crawled_at=None,
                        last_seen_up=None,
                        down_since=None,
                        consecutive_failures="0",
                    )
                    session.add(nh)

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

                    nh.status = "up"
                    nh.last_seen_up = _now_rfc3339()
                    nh.down_since = None
                    nh.consecutive_failures = "0"
                except Exception:
                    # mark failure
                    nh.last_crawled_at = _now_rfc3339()
                    fails = int(nh.consecutive_failures or "0") + 1
                    nh.consecutive_failures = str(fails)
                    if nh.status != "down":
                        nh.status = "down"
                        nh.down_since = nh.down_since or _now_rfc3339()
                    continue

                nh.last_crawled_at = _now_rfc3339()

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

                    creator = poster.get("creator") or {}
                    row = IndexedPoster(
                        poster_id=poster_id,
                        source_node=node,
                        media_type=str(media_type),
                        tmdb_id=str(tmdb_id),
                        title=(str(media.get("title")) if media.get("title") is not None else None),
                        year=(str(media.get("year")) if media.get("year") is not None else None),
                        creator_id=(str(creator.get("creator_id")) if creator.get("creator_id") is not None else None),
                        creator_display_name=(str(creator.get("display_name")) if creator.get("display_name") is not None else None),
                        changed_at=_norm_rfc3339(changed_at),
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

        # lightweight migrations for SQLite (dev/MVP)
        cols = await conn.exec_driver_sql("PRAGMA table_info(indexed_posters)")
        existing = {row[1] for row in cols}
        for col, ddl in [
            ("title", "ALTER TABLE indexed_posters ADD COLUMN title VARCHAR"),
            ("year", "ALTER TABLE indexed_posters ADD COLUMN year VARCHAR"),
            ("creator_id", "ALTER TABLE indexed_posters ADD COLUMN creator_id VARCHAR"),
            ("creator_display_name", "ALTER TABLE indexed_posters ADD COLUMN creator_display_name VARCHAR"),
        ]:
            if col not in existing:
                await conn.exec_driver_sql(ddl)

        # Indexes (CREATE INDEX IF NOT EXISTS is safe for SQLite)
        await conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS idx_indexed_posters_changed_at ON indexed_posters(changed_at)"
        )
        await conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS idx_indexed_posters_creator_id ON indexed_posters(creator_id)"
        )
        await conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS idx_indexed_posters_media_type ON indexed_posters(media_type)"
        )
        await conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS idx_indexed_posters_tmdb_id ON indexed_posters(tmdb_id)"
        )
        await conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS idx_indexed_posters_title ON indexed_posters(title)"
        )
        await conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS idx_indexed_posters_creator_display_name ON indexed_posters(creator_display_name)"
        )

    # backfill denormalized columns for existing rows
    async with app.state.Session() as session:
        rows = (
            await session.execute(
                select(IndexedPoster)
                .where(
                    (IndexedPoster.title.is_(None))
                    | (IndexedPoster.creator_display_name.is_(None))
                    | (IndexedPoster.creator_id.is_(None))
                )
                .limit(5000)
            )
        ).scalars().all()
        for r in rows:
            try:
                poster = json.loads(r.poster_json)
                media = poster.get("media") or {}
                creator = poster.get("creator") or {}
                r.title = (str(media.get("title")) if media.get("title") is not None else None)
                r.year = (str(media.get("year")) if media.get("year") is not None else None)
                r.creator_id = (str(creator.get("creator_id")) if creator.get("creator_id") is not None else None)
                r.creator_display_name = (
                    str(creator.get("display_name")) if creator.get("display_name") is not None else None
                )
            except Exception:
                continue
        await session.commit()

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
