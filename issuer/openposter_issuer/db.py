from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    password_hash: Mapped[str] = mapped_column(String)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class EmailChallenge(Base):
    __tablename__ = "email_challenges"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, index=True)
    code_hash: Mapped[str] = mapped_column(String)
    purpose: Mapped[str] = mapped_column(String)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    attempt_count: Mapped[str] = mapped_column(String, default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PasskeyCredential(Base):
    __tablename__ = "passkey_credentials"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.user_id"), index=True)
    credential_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    credential_data: Mapped[str] = mapped_column(String)
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class WebauthnChallenge(Base):
    __tablename__ = "webauthn_challenges"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    user_id: Mapped[str | None] = mapped_column(String, ForeignKey("users.user_id"), nullable=True, index=True)
    purpose: Mapped[str] = mapped_column(String)
    state_json: Mapped[str] = mapped_column(String)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CreatorHandle(Base):
    __tablename__ = "creator_handles"

    handle: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.user_id"), index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Node(Base):
    __tablename__ = "nodes"

    node_id: Mapped[str] = mapped_column(String, primary_key=True)  # UUID
    owner_user_id: Mapped[str] = mapped_column(String, ForeignKey("users.user_id"), index=True)
    owner_name: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class NodeAdmin(Base):
    __tablename__ = "node_admins"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.user_id"), index=True)
    node_id: Mapped[str] = mapped_column(String, ForeignKey("nodes.node_id"), index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "node_id", name="uniq_node_admin"),)


class NodeUrl(Base):
    __tablename__ = "node_urls"

    public_url: Mapped[str] = mapped_column(String, primary_key=True)  # canonicalized
    node_id: Mapped[str] = mapped_column(String, ForeignKey("nodes.node_id"), index=True)
    owner_user_id: Mapped[str] = mapped_column(String, ForeignKey("users.user_id"), index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class UrlClaim(Base):
    __tablename__ = "url_claims"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    public_url: Mapped[str] = mapped_column(String, index=True)
    owner_user_id: Mapped[str] = mapped_column(String, ForeignKey("users.user_id"), index=True)

    token: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("public_url", "owner_user_id", name="uniq_url_claim"),)


class ThemeSubscription(Base):
    __tablename__ = "theme_subscriptions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.user_id"), index=True)
    creator_id: Mapped[str] = mapped_column(String)
    creator_display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    theme_id: Mapped[str] = mapped_column(String)
    theme_name: Mapped[str | None] = mapped_column(String, nullable=True)
    cover_url: Mapped[str | None] = mapped_column(String, nullable=True)
    node_base: Mapped[str] = mapped_column(String)
    subscribed_at: Mapped[str] = mapped_column(String)  # ISO8601
    language: Mapped[str | None] = mapped_column(String, nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "theme_id", name="uniq_theme_subscription"),)


class FavouriteCreator(Base):
    __tablename__ = "favourite_creators"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.user_id"), index=True)
    creator_id: Mapped[str] = mapped_column(String)
    creator_display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    node_base: Mapped[str] = mapped_column(String)
    added_at: Mapped[str] = mapped_column(String)  # ISO8601

    __table_args__ = (UniqueConstraint("user_id", "creator_id", name="uniq_favourite_creator"),)


class CollectionSubscription(Base):
    __tablename__ = "collection_subscriptions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.user_id"), index=True)
    collection_tmdb_id: Mapped[str] = mapped_column(String)
    collection_name: Mapped[str | None] = mapped_column(String, nullable=True)
    theme_id: Mapped[str] = mapped_column(String)
    theme_name: Mapped[str | None] = mapped_column(String, nullable=True)
    language: Mapped[str | None] = mapped_column(String, nullable=True)
    node_base: Mapped[str] = mapped_column(String)
    subscribed_at: Mapped[str] = mapped_column(String)  # ISO8601

    __table_args__ = (UniqueConstraint("user_id", "collection_tmdb_id", "theme_id", "language", name="uniq_collection_sub"),)


class TvShowSubscription(Base):
    __tablename__ = "tv_show_subscriptions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.user_id"), index=True)
    show_tmdb_id: Mapped[str] = mapped_column(String)
    show_name: Mapped[str | None] = mapped_column(String, nullable=True)
    theme_id: Mapped[str] = mapped_column(String)
    theme_name: Mapped[str | None] = mapped_column(String, nullable=True)
    language: Mapped[str | None] = mapped_column(String, nullable=True)
    node_base: Mapped[str] = mapped_column(String)
    subscribed_at: Mapped[str] = mapped_column(String)  # ISO8601

    __table_args__ = (UniqueConstraint("user_id", "show_tmdb_id", "theme_id", "language", name="uniq_tv_sub"),)


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.user_id"), index=True)
    key: Mapped[str] = mapped_column(String)
    value: Mapped[str] = mapped_column(String)  # JSON text

    __table_args__ = (UniqueConstraint("user_id", "key", name="uniq_user_pref"),)


def new_uuid() -> str:
    return str(uuid.uuid4())


def make_engine(data_dir: Path) -> AsyncEngine:
    db_path = data_dir / "issuer.sqlite"
    return create_async_engine(f"sqlite+aiosqlite:///{db_path}", future=True)


def make_sessionmaker(engine: AsyncEngine) -> async_sessionmaker:
    return async_sessionmaker(engine, expire_on_commit=False)
