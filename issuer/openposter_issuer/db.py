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


class CreatorHandle(Base):
    __tablename__ = "creator_handles"

    handle: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.user_id"), index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Node(Base):
    __tablename__ = "nodes"

    node_id: Mapped[str] = mapped_column(String, primary_key=True)  # UUID
    owner_user_id: Mapped[str] = mapped_column(String, ForeignKey("users.user_id"), index=True)

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


def new_uuid() -> str:
    return str(uuid.uuid4())


def make_engine(data_dir: Path) -> AsyncEngine:
    db_path = data_dir / "issuer.sqlite"
    return create_async_engine(f"sqlite+aiosqlite:///{db_path}", future=True)


def make_sessionmaker(engine: AsyncEngine) -> async_sessionmaker:
    return async_sessionmaker(engine, expire_on_commit=False)
