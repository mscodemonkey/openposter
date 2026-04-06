from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import FastAPI
from sqlalchemy import select

from .config import load_config
from .crypto.signing import ensure_ed25519_keypair
from .db import AppliedArtwork, Base, CreatorProfile, CreatorSettings, CreatorTheme, Peer, Poster, make_engine, make_sessionmaker


async def init_app_state(app: FastAPI) -> None:
    cfg = load_config()
    app.state.cfg = cfg

    # node_id persistence (legacy string id used in poster_ids)
    node_id_path = cfg.data_dir / "node_id.txt"
    if node_id_path.exists():
        node_id = node_id_path.read_text().strip()
    else:
        import secrets

        node_id = "opn_" + secrets.token_hex(16)
        node_id_path.write_text(node_id)
    app.state.node_id = node_id

    # node_uuid persistence (new stable node identity for issuer/ownership)
    import uuid

    node_uuid_path = cfg.data_dir / "node_uuid.txt"
    if node_uuid_path.exists():
        node_uuid = node_uuid_path.read_text().strip()
    else:
        node_uuid = str(uuid.uuid4())
        node_uuid_path.write_text(node_uuid)
    app.state.node_uuid = node_uuid

    # bootstrap code for first admin claim (rotatable via admin endpoint)
    bootstrap_path = cfg.data_dir / "bootstrap_code.txt"
    if bootstrap_path.exists():
        bootstrap_code = bootstrap_path.read_text().strip()
    else:
        import secrets

        bootstrap_code = secrets.token_urlsafe(18)
        bootstrap_path.write_text(bootstrap_code)
    app.state.bootstrap_code = bootstrap_code

    # signing key
    signing_key, signing_info = ensure_ed25519_keypair(cfg.data_dir / "keys")
    app.state.signing_key = signing_key
    app.state.signing_info = signing_info

    # db
    engine = make_engine(cfg.data_dir)
    app.state.engine = engine
    app.state.Session = make_sessionmaker(engine)

    async with engine.begin() as conn:
        # Pre-migration: drop plex_sync_state if it uses old singleton schema (id INTEGER PK)
        # so create_all can recreate it with the new per-server schema (server_id TEXT PK).
        pss_pre_cols = {c[1] for c in (await conn.exec_driver_sql("PRAGMA table_info(plex_sync_state)")).all()}
        if "id" in pss_pre_cols and "server_id" not in pss_pre_cols:
            await conn.exec_driver_sql("DROP TABLE plex_sync_state")

        await conn.run_sync(Base.metadata.create_all)

        await conn.exec_driver_sql("PRAGMA foreign_keys=ON")

        # Posters table migrations
        cols = (await conn.exec_driver_sql("PRAGMA table_info(posters)")).all()
        col_names = {c[1] for c in cols}
        for name, ddl in [
            ("created_at", "ALTER TABLE posters ADD COLUMN created_at TEXT"),
            ("updated_at", "ALTER TABLE posters ADD COLUMN updated_at TEXT"),
            ("deleted_at", "ALTER TABLE posters ADD COLUMN deleted_at TEXT"),
            ("show_tmdb_id", "ALTER TABLE posters ADD COLUMN show_tmdb_id INTEGER"),
            ("season_number", "ALTER TABLE posters ADD COLUMN season_number INTEGER"),
            ("episode_number", "ALTER TABLE posters ADD COLUMN episode_number INTEGER"),
            ("links_json", "ALTER TABLE posters ADD COLUMN links_json TEXT"),
            ("theme_id", "ALTER TABLE posters ADD COLUMN theme_id TEXT"),
            ("collection_tmdb_id", "ALTER TABLE posters ADD COLUMN collection_tmdb_id INTEGER"),
            ("published", "ALTER TABLE posters ADD COLUMN published INTEGER NOT NULL DEFAULT 1"),
            ("kind", "ALTER TABLE posters ADD COLUMN kind TEXT"),
            ("language", "ALTER TABLE posters ADD COLUMN language TEXT"),
        ]:
            if name not in col_names:
                await conn.exec_driver_sql(ddl)

        # Backfill timestamps if they are missing (existing early DBs).
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        await conn.exec_driver_sql("UPDATE posters SET created_at = COALESCE(created_at, ?)", (now,))
        await conn.exec_driver_sql("UPDATE posters SET updated_at = COALESCE(updated_at, ?)", (now,))
        # Backfill kind for existing backdrop posters
        await conn.exec_driver_sql(
            "UPDATE posters SET kind = 'background' WHERE media_type = 'backdrop' AND kind IS NULL"
        )

        # creator_profile and creator_settings tables — created by create_all above, nothing to migrate yet
        _ = CreatorProfile  # ensure the import is used
        _ = CreatorSettings  # ensure the import is used
        _ = AppliedArtwork  # ensure the import is used

        # applied_artwork table — use CREATE TABLE IF NOT EXISTS for safety on existing DBs
        await conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS applied_artwork ("
            "  media_item_id TEXT PRIMARY KEY, "
            "  tmdb_id INTEGER, "
            "  media_type TEXT NOT NULL, "
            "  poster_id TEXT NOT NULL, "
            "  asset_hash TEXT NOT NULL, "
            "  creator_id TEXT, "
            "  theme_id TEXT, "
            "  node_base TEXT, "
            "  applied_at TEXT NOT NULL, "
            "  auto_update INTEGER NOT NULL DEFAULT 0, "
            "  plex_label TEXT"
            ")"
        )
        # applied_artwork column additions (for existing DBs that predate this column)
        aa_cols = {c[1] for c in (await conn.exec_driver_sql("PRAGMA table_info(applied_artwork)")).all()}
        if "creator_display_name" not in aa_cols:
            await conn.exec_driver_sql("ALTER TABLE applied_artwork ADD COLUMN creator_display_name TEXT")

        # plex_library_items — add new columns if missing (table may have existed before these migrations)
        pli_cols = {c[1] for c in (await conn.exec_driver_sql("PRAGMA table_info(plex_library_items)")).all()}
        if "server_id" not in pli_cols and pli_cols:
            await conn.exec_driver_sql(
                "ALTER TABLE plex_library_items ADD COLUMN server_id TEXT NOT NULL DEFAULT 'default'"
            )
        if "library_title" not in pli_cols and pli_cols:
            await conn.exec_driver_sql(
                "ALTER TABLE plex_library_items ADD COLUMN library_title TEXT"
            )

        # Peers table migrations (table is created by create_all above; add any new columns here)
        peer_cols = (await conn.exec_driver_sql("PRAGMA table_info(peers)")).all()
        peer_col_names = {c[1] for c in peer_cols}
        for name, ddl in [
            ("node_id", "ALTER TABLE peers ADD COLUMN node_id TEXT"),
            ("name", "ALTER TABLE peers ADD COLUMN name TEXT"),
            ("trust_score", "ALTER TABLE peers ADD COLUMN trust_score INTEGER NOT NULL DEFAULT 1"),
            ("consecutive_failures", "ALTER TABLE peers ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0"),
            ("last_validated", "ALTER TABLE peers ADD COLUMN last_validated TEXT"),
            ("first_seen", "ALTER TABLE peers ADD COLUMN first_seen TEXT"),
            ("last_seen", "ALTER TABLE peers ADD COLUMN last_seen TEXT"),
            ("status", "ALTER TABLE peers ADD COLUMN status TEXT"),
        ]:
            if name not in peer_col_names:
                await conn.exec_driver_sql(ddl)

    # Seed peers table from legacy nodes.json if it exists and peers table is empty.
    nodes_json_path = cfg.data_dir / "nodes.json"
    if nodes_json_path.exists():
        async with app.state.Session() as session:
            existing_count = (await session.execute(select(Peer))).scalars().first()
            if existing_count is None:
                try:
                    legacy_nodes = json.loads(nodes_json_path.read_text())
                except Exception:
                    legacy_nodes = []

                from datetime import datetime, timezone
                now_str = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
                for n in legacy_nodes:
                    url = (n.get("url") or "").strip().rstrip("/")
                    if not url:
                        continue
                    last_seen = n.get("last_seen") or now_str
                    session.add(Peer(
                        url=url,
                        node_id=None,
                        name=None,
                        status="active",
                        trust_score=1,
                        first_seen=last_seen,
                        last_seen=last_seen,
                        last_validated=None,
                        consecutive_failures=0,
                    ))
                await session.commit()

    # Optional mirror mode (pull blobs from an origin)
    mirror_origin = os.environ.get("OPENPOSTER_MIRROR_ORIGIN")
    if mirror_origin:
        from .mirror_sync import attach_mirror

        poll = int(os.environ.get("OPENPOSTER_MIRROR_POLL_SECONDS", "30"))
        attach_mirror(app, origin=mirror_origin, poll_seconds=poll)

    # Seed sample data once (optional): if posters table empty and seed file exists
    seed = cfg.data_dir / "seed.json"
    if seed.exists():
        try:
            payload = json.loads(seed.read_text())
        except Exception:
            payload = None
        if isinstance(payload, list):
            async with app.state.Session() as session:
                existing = (await session.execute(select(Poster).limit(1))).scalar_one_or_none()
                if existing is None:
                    from datetime import datetime, timezone

                    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
                    for row in payload:
                        row.setdefault("created_at", now)
                        row.setdefault("updated_at", now)
                        row.setdefault("deleted_at", None)
                        session.add(Poster(**row))
                    await session.commit()

    # Start gossip background tasks (not in mirror-only mode)
    if not mirror_origin:
        from .gossip import attach_gossip
        attach_gossip(app)

    # Announce to directory node if configured
    if cfg.announce_to:
        from .announce import schedule_announce
        schedule_announce(app, cfg.announce_to, cfg.announce_url or cfg.base_url)

    # Start Plex library sync (initial sync on startup + periodic background loop)
    from .plex_sync import attach_plex_sync
    attach_plex_sync(app)

    # Start Plex WebSocket listeners for real-time metadata-refresh events
    from .plex_ws import attach_plex_ws
    attach_plex_ws(app)


def attach_lifecycle(app: FastAPI) -> None:
    @app.on_event("startup")
    async def _startup():
        await init_app_state(app)

    @app.on_event("shutdown")
    async def _shutdown():
        for attr in ("plex_sync_task", "plex_sync_loop_task"):
            task = getattr(app.state, attr, None)
            if task and not task.done():
                task.cancel()
        for task in getattr(app.state, "plex_ws_tasks", []):
            if not task.done():
                task.cancel()
