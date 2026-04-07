from __future__ import annotations

from fastapi import FastAPI

from .config import load_config
from .db import Base, make_engine, make_sessionmaker


async def init_app_state(app: FastAPI) -> None:
    cfg = load_config()
    app.state.cfg = cfg

    engine = make_engine(cfg.data_dir)
    app.state.engine = engine
    app.state.Session = make_sessionmaker(engine)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        node_cols = {c[1] for c in (await conn.exec_driver_sql("PRAGMA table_info(nodes)")).all()}
        if "owner_name" not in node_cols:
            await conn.exec_driver_sql("ALTER TABLE nodes ADD COLUMN owner_name VARCHAR")


def attach_lifecycle(app: FastAPI) -> None:
    @app.on_event("startup")
    async def _startup():
        await init_app_state(app)
