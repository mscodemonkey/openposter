from __future__ import annotations

"""Background gossip tasks for the reference node.

Three independent loops:
- Health check (every 30 min): GET /v1/health on each active peer.
  After 3 consecutive failures → status: unreachable.
- Revalidation (every 24h): re-fetch descriptor, verify signing key.
- Peer discovery (every 1h): GET /v1/nodes from each active peer, add newly
  discovered peers with trust vouching.
- Eviction runs at the end of every health-check cycle: peers that have been
  unreachable for 30+ days are removed.
"""

import asyncio
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import FastAPI
from sqlalchemy import delete, select

from .db import Peer
from .routes.nodes import TRUST_THRESHOLD, _normalize_url, fetch_and_validate_descriptor


def _now_rfc3339() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _days_ago_rfc3339(days: int) -> str:
    dt = datetime.now(timezone.utc) - timedelta(days=days)
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Health checks
# ---------------------------------------------------------------------------

async def _health_check_once(app: FastAPI) -> None:
    now = _now_rfc3339()
    async with app.state.Session() as session:
        peers = (await session.execute(select(Peer))).scalars().all()

    async with httpx.AsyncClient(timeout=5.0) as client:
        for peer in peers:
            try:
                r = await client.get(peer.url + "/v1/health")
                ok = r.status_code == 200
            except Exception:
                ok = False

            async with app.state.Session() as session:
                p = await session.get(Peer, peer.url)
                if p is None:
                    continue
                if ok:
                    p.last_seen = now
                    p.consecutive_failures = 0
                    if p.status == "unreachable":
                        p.status = "active"
                else:
                    p.consecutive_failures = p.consecutive_failures + 1
                    if p.consecutive_failures >= 3:
                        p.status = "unreachable"
                await session.commit()


async def _evict_old_peers(app: FastAPI) -> None:
    """Evict peers that have been unreachable for 30+ days."""
    cutoff = _days_ago_rfc3339(30)
    async with app.state.Session() as session:
        await session.execute(
            delete(Peer).where(
                (Peer.status == "unreachable") & (Peer.last_seen < cutoff)
            )
        )
        await session.commit()


async def _health_loop(app: FastAPI) -> None:
    while True:
        await asyncio.sleep(30 * 60)  # 30 minutes
        try:
            await _health_check_once(app)
        except Exception:
            pass
        try:
            await _evict_old_peers(app)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Revalidation
# ---------------------------------------------------------------------------

async def _revalidate_once(app: FastAPI) -> None:
    """Re-fetch descriptor and verify signing key for all active peers."""
    now = _now_rfc3339()
    async with app.state.Session() as session:
        peers = (
            await session.execute(select(Peer).where(Peer.status == "active"))
        ).scalars().all()

    for peer in peers:
        try:
            desc = await fetch_and_validate_descriptor(peer.url)
        except Exception:
            continue  # revalidation failure doesn't immediately penalise; health check handles that

        async with app.state.Session() as session:
            p = await session.get(Peer, peer.url)
            if p is None:
                continue
            # If node_id changed, this is a different node — demote trust.
            if p.node_id and desc.get("node_id") != p.node_id:
                p.trust_score = 0
                p.status = "unreachable"
            else:
                p.node_id = desc.get("node_id")
                p.name = desc.get("name")
                p.last_validated = now
            await session.commit()


async def _revalidation_loop(app: FastAPI) -> None:
    while True:
        await asyncio.sleep(24 * 60 * 60)  # 24 hours
        try:
            await _revalidate_once(app)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Peer discovery
# ---------------------------------------------------------------------------

async def _discover_once(app: FastAPI) -> None:
    """Learn about new peers from each active peer's /v1/nodes list."""
    now = _now_rfc3339()

    async with app.state.Session() as session:
        active_peers = (
            await session.execute(select(Peer).where(Peer.status == "active"))
        ).scalars().all()

    async with httpx.AsyncClient(timeout=8.0) as client:
        for peer in active_peers:
            try:
                r = await client.get(peer.url + "/v1/nodes")
                if r.status_code != 200:
                    continue
                data = r.json()
            except Exception:
                continue

            for n in data.get("nodes", []):
                raw_url = (n.get("url") or "").strip().rstrip("/")
                if not raw_url:
                    continue

                # Normalize and SSRF-check the URL.
                try:
                    import os
                    from urllib.parse import urlparse
                    import socket, ipaddress
                    from .routes.nodes import _normalize_url as _norm
                    discovered_url = _norm(raw_url)
                except Exception:
                    continue

                async with app.state.Session() as session:
                    existing = await session.get(Peer, discovered_url)
                    if existing is not None:
                        # Already known; if peer has high trust, increment score.
                        if peer.trust_score >= TRUST_THRESHOLD and existing.trust_score < peer.trust_score:
                            existing.trust_score = existing.trust_score + 1
                            await session.commit()
                        continue

                    # New peer — add if the vouching peer has sufficient trust.
                    if peer.trust_score >= TRUST_THRESHOLD:
                        new_peer = Peer(
                            url=discovered_url,
                            node_id=n.get("node_id"),
                            name=n.get("name"),
                            status="active",
                            trust_score=1,
                            first_seen=now,
                            last_seen=now,
                            last_validated=None,
                            consecutive_failures=0,
                        )
                        session.add(new_peer)
                        await session.commit()
                    else:
                        # Low-trust voucher: validate independently before adding.
                        try:
                            desc = await fetch_and_validate_descriptor(discovered_url)
                        except Exception:
                            continue

                        new_peer = Peer(
                            url=discovered_url,
                            node_id=desc.get("node_id"),
                            name=desc.get("name"),
                            status="active",
                            trust_score=1,
                            first_seen=now,
                            last_seen=now,
                            last_validated=now,
                            consecutive_failures=0,
                        )
                        session.add(new_peer)
                        await session.commit()


async def _discovery_loop(app: FastAPI) -> None:
    while True:
        await asyncio.sleep(60 * 60)  # 1 hour
        try:
            await _discover_once(app)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Attach to app
# ---------------------------------------------------------------------------

def attach_gossip(app: FastAPI) -> None:
    app.state.gossip_health_task = asyncio.create_task(_health_loop(app))
    app.state.gossip_revalidation_task = asyncio.create_task(_revalidation_loop(app))
    app.state.gossip_discovery_task = asyncio.create_task(_discovery_loop(app))
