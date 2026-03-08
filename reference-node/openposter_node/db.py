from __future__ import annotations

from pathlib import Path

from sqlalchemy import Integer, String, Text, DateTime
from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(AsyncAttrs, DeclarativeBase):
    pass


class AdminSession(Base):
    __tablename__ = "admin_sessions"

    token_hash: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[str] = mapped_column(String)  # RFC3339
    expires_at: Mapped[str] = mapped_column(String)  # RFC3339


class Poster(Base):
    __tablename__ = "posters"

    poster_id: Mapped[str] = mapped_column(String, primary_key=True)

    created_at: Mapped[str] = mapped_column(String)  # RFC3339
    updated_at: Mapped[str] = mapped_column(String)  # RFC3339
    deleted_at: Mapped[str | None] = mapped_column(String, nullable=True)  # RFC3339 or null

    media_type: Mapped[str] = mapped_column(String)
    tmdb_id: Mapped[int] = mapped_column(Integer, index=True)
    # TV grouping
    show_tmdb_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    season_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    episode_number: Mapped[int | None] = mapped_column(Integer, nullable=True)

    title: Mapped[str | None] = mapped_column(String, nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    creator_id: Mapped[str] = mapped_column(String)
    creator_display_name: Mapped[str] = mapped_column(String)
    creator_home_node: Mapped[str] = mapped_column(String)

    attribution_license: Mapped[str] = mapped_column(String)
    attribution_redistribution: Mapped[str] = mapped_column(String)
    attribution_source_url: Mapped[str | None] = mapped_column(String, nullable=True)

    # Optional creator-authored links (JSON array)
    links_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    preview_hash: Mapped[str] = mapped_column(String)
    preview_bytes: Mapped[int] = mapped_column(Integer)
    preview_mime: Mapped[str] = mapped_column(String)
    preview_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preview_height: Mapped[int | None] = mapped_column(Integer, nullable=True)

    full_access: Mapped[str] = mapped_column(String)  # public|premium
    full_hash: Mapped[str] = mapped_column(String)
    full_bytes: Mapped[int] = mapped_column(Integer)
    full_mime: Mapped[str] = mapped_column(String)
    full_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    full_height: Mapped[int | None] = mapped_column(Integer, nullable=True)

    enc_alg: Mapped[str | None] = mapped_column(String, nullable=True)
    enc_key_id: Mapped[str | None] = mapped_column(String, nullable=True)
    enc_nonce: Mapped[str | None] = mapped_column(String, nullable=True)


def make_engine(data_dir: Path):
    db_path = data_dir / "db.sqlite"
    return create_async_engine(f"sqlite+aiosqlite:///{db_path}", future=True)


def make_sessionmaker(engine):
    return async_sessionmaker(engine, expire_on_commit=False)
