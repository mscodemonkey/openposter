from __future__ import annotations

from pathlib import Path

from sqlalchemy import String, Text
from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(AsyncAttrs, DeclarativeBase):
    pass


class IndexedPoster(Base):
    __tablename__ = "indexed_posters"

    poster_id: Mapped[str] = mapped_column(String, primary_key=True)
    source_node: Mapped[str] = mapped_column(String, index=True)

    media_type: Mapped[str] = mapped_column(String, index=True)
    tmdb_id: Mapped[str] = mapped_column(String, index=True)

    changed_at: Mapped[str] = mapped_column(String)

    poster_json: Mapped[str] = mapped_column(Text)


class NodeCursor(Base):
    __tablename__ = "node_cursors"

    node_url: Mapped[str] = mapped_column(String, primary_key=True)
    since: Mapped[str | None] = mapped_column(String, nullable=True)


def make_engine(data_dir: Path):
    db_path = data_dir / "indexer.sqlite"
    return create_async_engine(f"sqlite+aiosqlite:///{db_path}", future=True)


def make_sessionmaker(engine):
    return async_sessionmaker(engine, expire_on_commit=False)
