from __future__ import annotations

from pathlib import Path

from sqlalchemy import PrimaryKeyConstraint, String, Text
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

    # denormalized fields to support simple browsing/search
    title: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    year: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    creator_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    creator_display_name: Mapped[str | None] = mapped_column(String, index=True, nullable=True)

    # TV grouping
    show_tmdb_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    season_number: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    episode_number: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    # Collection grouping
    collection_tmdb_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)

    # Artwork kind: "poster" | "background" | "logo" | "banner" | "thumb"
    kind: Mapped[str | None] = mapped_column(String, index=True, nullable=True)

    # BCP-47 language tag (e.g. "en", "ja") or NULL for language-neutral
    language: Mapped[str | None] = mapped_column(String, index=True, nullable=True)

    changed_at: Mapped[str] = mapped_column(String, index=True)

    poster_json: Mapped[str] = mapped_column(Text)


class NodeCursor(Base):
    __tablename__ = "node_cursors"

    node_url: Mapped[str] = mapped_column(String, primary_key=True)
    since: Mapped[str | None] = mapped_column(String, nullable=True)


class NodeHealth(Base):
    __tablename__ = "node_health"

    node_url: Mapped[str] = mapped_column(String, primary_key=True)

    status: Mapped[str] = mapped_column(String)  # up|down|unknown
    last_crawled_at: Mapped[str | None] = mapped_column(String, nullable=True)
    last_seen_up: Mapped[str | None] = mapped_column(String, nullable=True)
    down_since: Mapped[str | None] = mapped_column(String, nullable=True)
    consecutive_failures: Mapped[str] = mapped_column(String)  # store as string int for sqlite simplicity


class BlobMirror(Base):
    """Maps blob hashes to the mirror URLs that host them.

    Built as a byproduct of crawling sources[] in signed poster records.
    Query via GET /v1/blobs/{hash}/sources on the indexer.
    """

    __tablename__ = "blob_mirrors"
    __table_args__ = (PrimaryKeyConstraint("blob_hash", "mirror_url"),)

    blob_hash: Mapped[str] = mapped_column(String)   # sha256:<hex>
    mirror_url: Mapped[str] = mapped_column(String)  # full URL to the blob on the mirror


def make_engine(data_dir: Path):
    db_path = data_dir / "indexer.sqlite"
    return create_async_engine(f"sqlite+aiosqlite:///{db_path}", future=True)


def make_sessionmaker(engine):
    return async_sessionmaker(engine, expire_on_commit=False)
