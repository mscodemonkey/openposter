from __future__ import annotations

from pathlib import Path

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(AsyncAttrs, DeclarativeBase):
    pass


class CreatorTheme(Base):
    __tablename__ = "creator_theme"

    theme_id: Mapped[str] = mapped_column(String, primary_key=True)
    creator_id: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_hash: Mapped[str | None] = mapped_column(String, nullable=True)  # optional blob hash for cover image
    created_at: Mapped[str] = mapped_column(String)  # RFC3339
    updated_at: Mapped[str] = mapped_column(String)  # RFC3339
    deleted_at: Mapped[str | None] = mapped_column(String, nullable=True)  # RFC3339 or null


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
    # Collection grouping (for movie/backdrop posters that belong to a collection)
    collection_tmdb_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    title: Mapped[str | None] = mapped_column(String, nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    creator_id: Mapped[str] = mapped_column(String)
    creator_display_name: Mapped[str] = mapped_column(String)
    creator_home_node: Mapped[str] = mapped_column(String)

    attribution_license: Mapped[str] = mapped_column(String)
    attribution_redistribution: Mapped[str] = mapped_column(String)
    attribution_source_url: Mapped[str | None] = mapped_column(String, nullable=True)

    # Artwork kind: "poster" | "background" | "logo" | "square" | "banner" | "thumb"
    # NULL in existing rows is treated as "poster" by the API.
    kind: Mapped[str | None] = mapped_column(String, nullable=True)

    # Optional creator-authored links (JSON array)
    links_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Theme this poster belongs to (FK into creator_theme)
    theme_id: Mapped[str | None] = mapped_column(String, nullable=True)

    # Draft / published — False = draft (not visible to indexers), True = published
    published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # BCP-47 language tag (e.g. "en", "ja", "fr") or NULL for language-neutral artwork
    language: Mapped[str | None] = mapped_column(String, nullable=True)

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


class CreatorSettings(Base):
    """Arbitrary JSON settings keyed by (creator_id, key). Used for Studio preferences."""

    __tablename__ = "creator_settings"

    creator_id: Mapped[str] = mapped_column(String, primary_key=True)
    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(Text)  # JSON-encoded
    updated_at: Mapped[str] = mapped_column(String)  # RFC3339


class CreatorProfile(Base):
    """Per-creator profile metadata (backdrop image, etc.)."""

    __tablename__ = "creator_profile"

    creator_id: Mapped[str] = mapped_column(String, primary_key=True)
    backdrop_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[str] = mapped_column(String)  # RFC3339


class AppliedArtwork(Base):
    """Tracks OpenPoster artwork applied to media server items."""

    __tablename__ = "applied_artwork"

    media_item_id: Mapped[str] = mapped_column(String, primary_key=True)  # Plex ratingKey
    tmdb_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    media_type: Mapped[str] = mapped_column(String)          # movie/show/season/episode
    poster_id: Mapped[str] = mapped_column(String)           # OpenPoster poster_id
    asset_hash: Mapped[str] = mapped_column(String)          # full.hash at apply time
    creator_id: Mapped[str | None] = mapped_column(String, nullable=True)
    theme_id: Mapped[str | None] = mapped_column(String, nullable=True)
    node_base: Mapped[str | None] = mapped_column(String, nullable=True)  # creator's home node URL
    applied_at: Mapped[str] = mapped_column(String)          # RFC3339
    auto_update: Mapped[bool] = mapped_column(Boolean, default=False)
    plex_label: Mapped[str | None] = mapped_column(String, nullable=True)  # label we added (for removal)
    creator_display_name: Mapped[str | None] = mapped_column(String, nullable=True)


class PlexLibraryItem(Base):
    """Local mirror of a Plex library item (movie/show/collection/season/episode)."""

    __tablename__ = "plex_library_items"

    id: Mapped[str] = mapped_column(String, primary_key=True)        # Plex ratingKey
    server_id: Mapped[str] = mapped_column(String, index=True, default="default")  # media server config id
    title: Mapped[str] = mapped_column(String)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    type: Mapped[str] = mapped_column(String, index=True)             # movie|show|collection|season|episode
    item_index: Mapped[int | None] = mapped_column(Integer, nullable=True)  # season/episode number
    tmdb_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    leaf_count: Mapped[int | None] = mapped_column(Integer, nullable=True)   # episode count
    child_count: Mapped[int | None] = mapped_column(Integer, nullable=True)  # season count
    parent_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)  # parent ratingKey
    collection_ids: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list of collection ratingKeys
    library_title: Mapped[str | None] = mapped_column(String, nullable=True, index=True)  # Plex section title
    synced_at: Mapped[str] = mapped_column(String)                    # RFC3339


class PlexSyncState(Base):
    """One row per media server tracking the state of the most recent sync."""

    __tablename__ = "plex_sync_state"

    server_id: Mapped[str] = mapped_column(String, primary_key=True, default="default")
    last_synced_at: Mapped[str | None] = mapped_column(String, nullable=True)
    is_syncing: Mapped[bool] = mapped_column(Boolean, default=False)
    current_phase: Mapped[str | None] = mapped_column(String, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class Peer(Base):
    """Known network peers. Trust score is internal bookkeeping, never exposed via API."""

    __tablename__ = "peers"

    url: Mapped[str] = mapped_column(String, primary_key=True)
    node_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    # active | unreachable
    status: Mapped[str] = mapped_column(String)
    # internal only: number of distinct validated peers that vouch for this node
    trust_score: Mapped[int] = mapped_column(Integer)
    first_seen: Mapped[str] = mapped_column(String)   # RFC3339
    last_seen: Mapped[str] = mapped_column(String)    # RFC3339
    last_validated: Mapped[str | None] = mapped_column(String, nullable=True)  # RFC3339
    consecutive_failures: Mapped[int] = mapped_column(Integer)


def make_engine(data_dir: Path):
    db_path = data_dir / "db.sqlite"
    return create_async_engine(f"sqlite+aiosqlite:///{db_path}", future=True)


def make_sessionmaker(engine):
    return async_sessionmaker(engine, expire_on_commit=False)
