from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI
from sqlalchemy import select

from .config import load_config
from .crypto.signing import ensure_ed25519_keypair
from .db import Base, Poster, make_engine, make_sessionmaker


async def init_app_state(app: FastAPI) -> None:
    cfg = load_config()
    app.state.cfg = cfg

    # node_id persistence
    node_id_path = cfg.data_dir / "node_id.txt"
    if node_id_path.exists():
        node_id = node_id_path.read_text().strip()
    else:
        import secrets

        node_id = "opn_" + secrets.token_hex(16)
        node_id_path.write_text(node_id)
    app.state.node_id = node_id

    # signing key
    signing_key, signing_info = ensure_ed25519_keypair(cfg.data_dir / "keys")
    app.state.signing_key = signing_key
    app.state.signing_info = signing_info

    # db
    engine = make_engine(cfg.data_dir)
    app.state.engine = engine
    app.state.Session = make_sessionmaker(engine)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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
                    for row in payload:
                        session.add(Poster(**row))
                    await session.commit()


def attach_lifecycle(app: FastAPI) -> None:
    @app.on_event("startup")
    async def _startup():
        await init_app_state(app)
