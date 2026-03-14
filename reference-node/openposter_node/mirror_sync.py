from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import FastAPI
from sqlalchemy import select

from .storage.blobs import blob_path


def _now_rfc3339() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


async def _download_blob(client: httpx.AsyncClient, url: str, dst: Path) -> None:
    r = await client.get(url)
    r.raise_for_status()
    dst.parent.mkdir(parents=True, exist_ok=True)
    # Verify hash matches the filename before writing.
    content = r.content
    hex_part = dst.name  # blob filename IS the sha256 hex
    actual = hashlib.sha256(content).hexdigest()
    if actual != hex_part:
        raise ValueError(f"blob hash mismatch: expected {hex_part}, got {actual}")
    dst.write_bytes(content)


def _poster_from_json(poster: dict, origin_url: str) -> dict:
    """Build a Poster kwargs dict from a fetched poster JSON record."""
    from datetime import datetime, timezone

    media = poster.get("media") or {}
    creator = poster.get("creator") or {}
    assets = poster.get("assets") or {}
    preview = assets.get("preview") or {}
    full = assets.get("full") or {}
    attribution = poster.get("attribution") or {}

    now = _now_rfc3339()
    return dict(
        poster_id=poster["poster_id"],
        created_at=now,
        updated_at=now,
        deleted_at=None,
        media_type=str(media.get("type") or ""),
        tmdb_id=int(media["tmdb_id"]) if media.get("tmdb_id") is not None else 0,
        show_tmdb_id=(int(media["show_tmdb_id"]) if media.get("show_tmdb_id") is not None else None),
        season_number=(int(media["season_number"]) if media.get("season_number") is not None else None),
        episode_number=(int(media["episode_number"]) if media.get("episode_number") is not None else None),
        title=media.get("title"),
        year=(int(media["year"]) if media.get("year") is not None else None),
        creator_id=str(creator.get("creator_id") or ""),
        creator_display_name=str(creator.get("display_name") or ""),
        creator_home_node=str(creator.get("home_node") or origin_url),
        attribution_license=str(attribution.get("license") or "all-rights-reserved"),
        attribution_redistribution=str(attribution.get("redistribution") or "mirrors-approved"),
        attribution_source_url=attribution.get("source_url"),
        links_json=(json.dumps(poster["links"]) if poster.get("links") else None),
        preview_hash=str(preview.get("hash") or ""),
        preview_bytes=int(preview.get("bytes") or 0),
        preview_mime=str(preview.get("mime") or "image/jpeg"),
        preview_width=preview.get("width"),
        preview_height=preview.get("height"),
        full_access=str(full.get("access") or "public"),
        full_hash=str(full.get("hash") or ""),
        full_bytes=int(full.get("bytes") or 0),
        full_mime=str(full.get("mime") or "image/jpeg"),
        full_width=full.get("width"),
        full_height=full.get("height"),
        enc_alg=None,
        enc_key_id=None,
        enc_nonce=None,
    )


async def _delete_unreferenced_blobs(app: FastAPI, hashes: list[str]) -> None:
    """Delete blob files that are no longer referenced by any poster."""
    from .db import Poster
    from sqlalchemy import or_

    cfg = app.state.cfg
    for h in hashes:
        if not h:
            continue
        # Check if any active poster still references this blob.
        async with app.state.Session() as session:
            still_used = (
                await session.execute(
                    select(Poster).where(
                        ((Poster.preview_hash == h) | (Poster.full_hash == h))
                        & Poster.deleted_at.is_(None)
                    ).limit(1)
                )
            ).scalar_one_or_none()

        if still_used is None:
            path = blob_path(cfg.data_dir, h)
            if path.exists():
                try:
                    path.unlink()
                except Exception:
                    pass


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
            r = await client.get(origin + "/v1/changes")
        r.raise_for_status()
        payload = r.json()

        for ch in payload.get("changes", []):
            kind = ch.get("kind")
            poster_id = ch.get("poster_id")
            if not poster_id:
                continue

            if kind == "delete":
                # Mark local poster record deleted and clean up orphaned blobs.
                from .db import Poster

                async with app.state.Session() as session:
                    p = await session.get(Poster, poster_id)
                    if p is not None and p.deleted_at is None:
                        deleted_hashes = [p.preview_hash, p.full_hash]
                        p.deleted_at = _now_rfc3339()
                        p.updated_at = p.deleted_at
                        await session.commit()
                        await _delete_unreferenced_blobs(app, deleted_hashes)
                continue

            if kind != "upsert":
                continue

            pr = await client.get(origin + f"/v1/posters/{poster_id}")
            if pr.status_code != 200:
                continue
            poster = pr.json()

            # Save/update the poster record in local DB.
            try:
                from .db import Poster

                kwargs = _poster_from_json(poster, origin)
                async with app.state.Session() as session:
                    existing = await session.get(Poster, poster_id)
                    if existing is None:
                        session.add(Poster(**kwargs))
                    else:
                        for k, v in kwargs.items():
                            if k not in ("poster_id", "created_at", "first_seen"):
                                setattr(existing, k, v)
                    await session.commit()
            except Exception:
                pass

            # Download blobs from origin.
            for key in ("preview", "full"):
                asset = (poster.get("assets") or {}).get(key) or {}
                h = asset.get("hash")
                if not h:
                    continue

                dst = blob_path(cfg.data_dir, h)
                if dst.exists():
                    continue
                try:
                    await _download_blob(client, origin + f"/v1/blobs/{h}", dst)
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
