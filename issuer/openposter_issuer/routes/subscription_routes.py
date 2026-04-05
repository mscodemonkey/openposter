from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from ..auth import require_user_id
from ..db import (
    ThemeSubscription,
    FavouriteCreator,
    CollectionSubscription,
    TvShowSubscription,
    UserPreference,
    new_uuid,
)

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


# ─── Theme subscriptions ──────────────────────────────────────────────────────

class SubscribeThemeReq(BaseModel):
    creator_id: str
    creator_display_name: str | None = None
    theme_id: str
    theme_name: str | None = None
    cover_url: str | None = None
    node_base: str


@router.get("/v1/me/subscriptions/themes")
async def list_theme_subscriptions(request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))
    session = request.app.state.Session
    async with session() as s:
        rows = (await s.execute(
            select(ThemeSubscription).where(ThemeSubscription.user_id == user_id)
        )).scalars().all()
    return {"subscriptions": [
        {
            "id": r.id,
            "user_id": r.user_id,
            "creator_id": r.creator_id,
            "creator_display_name": r.creator_display_name,
            "theme_id": r.theme_id,
            "theme_name": r.theme_name,
            "cover_url": r.cover_url,
            "node_base": r.node_base,
            "subscribed_at": r.subscribed_at,
            "language": r.language,
        }
        for r in rows
    ]}


@router.post("/v1/me/subscriptions/themes", status_code=201)
async def subscribe_theme(req: SubscribeThemeReq, request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))
    session = request.app.state.Session
    async with session() as s:
        existing = (await s.execute(
            select(ThemeSubscription).where(
                ThemeSubscription.user_id == user_id,
                ThemeSubscription.theme_id == req.theme_id,
            )
        )).scalar_one_or_none()
        if existing:
            existing.creator_display_name = req.creator_display_name
            existing.theme_name = req.theme_name
            existing.cover_url = req.cover_url
            s.add(existing)
            await s.commit()
            return {"subscription": {
                "id": existing.id,
                "user_id": existing.user_id,
                "creator_id": existing.creator_id,
                "creator_display_name": existing.creator_display_name,
                "theme_id": existing.theme_id,
                "theme_name": existing.theme_name,
                "cover_url": existing.cover_url,
                "node_base": existing.node_base,
                "subscribed_at": existing.subscribed_at,
                "language": existing.language,
            }}
        sub = ThemeSubscription(
            id=new_uuid(),
            user_id=user_id,
            creator_id=req.creator_id,
            creator_display_name=req.creator_display_name,
            theme_id=req.theme_id,
            theme_name=req.theme_name,
            cover_url=req.cover_url,
            node_base=req.node_base,
            subscribed_at=_now_iso(),
        )
        s.add(sub)
        await s.commit()
    return {"subscription": {
        "id": sub.id,
        "user_id": sub.user_id,
        "creator_id": sub.creator_id,
        "creator_display_name": sub.creator_display_name,
        "theme_id": sub.theme_id,
        "theme_name": sub.theme_name,
        "cover_url": sub.cover_url,
        "node_base": sub.node_base,
        "subscribed_at": sub.subscribed_at,
        "language": sub.language,
    }}


@router.delete("/v1/me/subscriptions/themes/{theme_id}", status_code=204)
async def unsubscribe_theme(theme_id: str, request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))
    session = request.app.state.Session
    async with session() as s:
        sub = (await s.execute(
            select(ThemeSubscription).where(
                ThemeSubscription.user_id == user_id,
                ThemeSubscription.theme_id == theme_id,
            )
        )).scalar_one_or_none()
        if sub:
            await s.delete(sub)
            await s.commit()


# ─── Favourite Creators ───────────────────────────────────────────────────────

class AddFavouriteCreatorReq(BaseModel):
    creator_id: str
    creator_display_name: Optional[str] = None
    node_base: str


@router.get("/v1/me/favourites/creators")
async def list_favourite_creators(request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))
    session = request.app.state.Session
    async with session() as s:
        rows = (await s.execute(
            select(FavouriteCreator).where(FavouriteCreator.user_id == user_id)
        )).scalars().all()
    return {"favourites": [
        {
            "id": r.id,
            "user_id": r.user_id,
            "creator_id": r.creator_id,
            "creator_display_name": r.creator_display_name,
            "node_base": r.node_base,
            "added_at": r.added_at,
        }
        for r in rows
    ]}


@router.post("/v1/me/favourites/creators", status_code=201)
async def add_favourite_creator(req: AddFavouriteCreatorReq, request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))
    session = request.app.state.Session
    async with session() as s:
        existing = (await s.execute(
            select(FavouriteCreator).where(
                FavouriteCreator.user_id == user_id,
                FavouriteCreator.creator_id == req.creator_id,
            )
        )).scalar_one_or_none()
        if existing:
            existing.creator_display_name = req.creator_display_name
            s.add(existing)
            await s.commit()
            return {"favourite": {
                "id": existing.id,
                "user_id": existing.user_id,
                "creator_id": existing.creator_id,
                "creator_display_name": existing.creator_display_name,
                "node_base": existing.node_base,
                "added_at": existing.added_at,
            }}
        fav = FavouriteCreator(
            id=new_uuid(),
            user_id=user_id,
            creator_id=req.creator_id,
            creator_display_name=req.creator_display_name,
            node_base=req.node_base,
            added_at=_now_iso(),
        )
        s.add(fav)
        await s.commit()
    return {"favourite": {
        "id": fav.id,
        "user_id": fav.user_id,
        "creator_id": fav.creator_id,
        "creator_display_name": fav.creator_display_name,
        "node_base": fav.node_base,
        "added_at": fav.added_at,
    }}


@router.delete("/v1/me/favourites/creators/{creator_id}", status_code=204)
async def remove_favourite_creator(creator_id: str, request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))
    session = request.app.state.Session
    async with session() as s:
        fav = (await s.execute(
            select(FavouriteCreator).where(
                FavouriteCreator.user_id == user_id,
                FavouriteCreator.creator_id == creator_id,
            )
        )).scalar_one_or_none()
        if fav:
            await s.delete(fav)
            await s.commit()


# ─── Collection Subscriptions ─────────────────────────────────────────────────

class SubscribeCollectionReq(BaseModel):
    collection_tmdb_id: str
    collection_name: Optional[str] = None
    theme_id: str
    theme_name: Optional[str] = None
    language: Optional[str] = None
    node_base: str


@router.get("/v1/me/subscriptions/collections")
async def list_collection_subscriptions(request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))
    session = request.app.state.Session
    async with session() as s:
        rows = (await s.execute(
            select(CollectionSubscription).where(CollectionSubscription.user_id == user_id)
        )).scalars().all()
    return {"subscriptions": [
        {
            "id": r.id,
            "user_id": r.user_id,
            "collection_tmdb_id": r.collection_tmdb_id,
            "collection_name": r.collection_name,
            "theme_id": r.theme_id,
            "theme_name": r.theme_name,
            "language": r.language,
            "node_base": r.node_base,
            "subscribed_at": r.subscribed_at,
        }
        for r in rows
    ]}


@router.post("/v1/me/subscriptions/collections", status_code=201)
async def subscribe_collection(req: SubscribeCollectionReq, request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))
    session = request.app.state.Session
    async with session() as s:
        existing = (await s.execute(
            select(CollectionSubscription).where(
                CollectionSubscription.user_id == user_id,
                CollectionSubscription.collection_tmdb_id == req.collection_tmdb_id,
                CollectionSubscription.theme_id == req.theme_id,
                CollectionSubscription.language == req.language,
            )
        )).scalar_one_or_none()
        if existing:
            existing.collection_name = req.collection_name
            existing.theme_name = req.theme_name
            s.add(existing)
            await s.commit()
            return {"subscription": {
                "id": existing.id,
                "user_id": existing.user_id,
                "collection_tmdb_id": existing.collection_tmdb_id,
                "collection_name": existing.collection_name,
                "theme_id": existing.theme_id,
                "theme_name": existing.theme_name,
                "language": existing.language,
                "node_base": existing.node_base,
                "subscribed_at": existing.subscribed_at,
            }}
        sub = CollectionSubscription(
            id=new_uuid(),
            user_id=user_id,
            collection_tmdb_id=req.collection_tmdb_id,
            collection_name=req.collection_name,
            theme_id=req.theme_id,
            theme_name=req.theme_name,
            language=req.language,
            node_base=req.node_base,
            subscribed_at=_now_iso(),
        )
        s.add(sub)
        await s.commit()
    return {"subscription": {
        "id": sub.id,
        "user_id": sub.user_id,
        "collection_tmdb_id": sub.collection_tmdb_id,
        "collection_name": sub.collection_name,
        "theme_id": sub.theme_id,
        "theme_name": sub.theme_name,
        "language": sub.language,
        "node_base": sub.node_base,
        "subscribed_at": sub.subscribed_at,
    }}


@router.delete("/v1/me/subscriptions/collections/{collection_tmdb_id}", status_code=204)
async def unsubscribe_collection(
    collection_tmdb_id: str,
    request: Request,
    theme_id: str = "",
    language: Optional[str] = None,
):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))
    session = request.app.state.Session
    async with session() as s:
        sub = (await s.execute(
            select(CollectionSubscription).where(
                CollectionSubscription.user_id == user_id,
                CollectionSubscription.collection_tmdb_id == collection_tmdb_id,
                CollectionSubscription.theme_id == theme_id,
                CollectionSubscription.language == language,
            )
        )).scalar_one_or_none()
        if sub:
            await s.delete(sub)
            await s.commit()


# ─── TV Show Subscriptions ────────────────────────────────────────────────────

class SubscribeTvShowReq(BaseModel):
    show_tmdb_id: str
    show_name: Optional[str] = None
    theme_id: str
    theme_name: Optional[str] = None
    language: Optional[str] = None
    node_base: str


@router.get("/v1/me/subscriptions/tv")
async def list_tv_show_subscriptions(request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))
    session = request.app.state.Session
    async with session() as s:
        rows = (await s.execute(
            select(TvShowSubscription).where(TvShowSubscription.user_id == user_id)
        )).scalars().all()
    return {"subscriptions": [
        {
            "id": r.id,
            "user_id": r.user_id,
            "show_tmdb_id": r.show_tmdb_id,
            "show_name": r.show_name,
            "theme_id": r.theme_id,
            "theme_name": r.theme_name,
            "language": r.language,
            "node_base": r.node_base,
            "subscribed_at": r.subscribed_at,
        }
        for r in rows
    ]}


@router.post("/v1/me/subscriptions/tv", status_code=201)
async def subscribe_tv_show(req: SubscribeTvShowReq, request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))
    session = request.app.state.Session
    async with session() as s:
        existing = (await s.execute(
            select(TvShowSubscription).where(
                TvShowSubscription.user_id == user_id,
                TvShowSubscription.show_tmdb_id == req.show_tmdb_id,
                TvShowSubscription.theme_id == req.theme_id,
                TvShowSubscription.language == req.language,
            )
        )).scalar_one_or_none()
        if existing:
            existing.show_name = req.show_name
            existing.theme_name = req.theme_name
            s.add(existing)
            await s.commit()
            return {"subscription": {
                "id": existing.id,
                "user_id": existing.user_id,
                "show_tmdb_id": existing.show_tmdb_id,
                "show_name": existing.show_name,
                "theme_id": existing.theme_id,
                "theme_name": existing.theme_name,
                "language": existing.language,
                "node_base": existing.node_base,
                "subscribed_at": existing.subscribed_at,
            }}
        sub = TvShowSubscription(
            id=new_uuid(),
            user_id=user_id,
            show_tmdb_id=req.show_tmdb_id,
            show_name=req.show_name,
            theme_id=req.theme_id,
            theme_name=req.theme_name,
            language=req.language,
            node_base=req.node_base,
            subscribed_at=_now_iso(),
        )
        s.add(sub)
        await s.commit()
    return {"subscription": {
        "id": sub.id,
        "user_id": sub.user_id,
        "show_tmdb_id": sub.show_tmdb_id,
        "show_name": sub.show_name,
        "theme_id": sub.theme_id,
        "theme_name": sub.theme_name,
        "language": sub.language,
        "node_base": sub.node_base,
        "subscribed_at": sub.subscribed_at,
    }}


@router.delete("/v1/me/subscriptions/tv/{show_tmdb_id}", status_code=204)
async def unsubscribe_tv_show(
    show_tmdb_id: str,
    request: Request,
    theme_id: str = "",
    language: Optional[str] = None,
):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))
    session = request.app.state.Session
    async with session() as s:
        sub = (await s.execute(
            select(TvShowSubscription).where(
                TvShowSubscription.user_id == user_id,
                TvShowSubscription.show_tmdb_id == show_tmdb_id,
                TvShowSubscription.theme_id == theme_id,
                TvShowSubscription.language == language,
            )
        )).scalar_one_or_none()
        if sub:
            await s.delete(sub)
            await s.commit()


# ─── User Preferences ─────────────────────────────────────────────────────────

class SetPreferenceReq(BaseModel):
    value: str


@router.get("/v1/me/preferences/{key}")
async def get_preference(key: str, request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))
    session = request.app.state.Session
    async with session() as s:
        pref = (await s.execute(
            select(UserPreference).where(
                UserPreference.user_id == user_id,
                UserPreference.key == key,
            )
        )).scalar_one_or_none()
    return {"key": key, "value": pref.value if pref else None}


@router.put("/v1/me/preferences/{key}", status_code=200)
async def set_preference(key: str, req: SetPreferenceReq, request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))
    session = request.app.state.Session
    async with session() as s:
        existing = (await s.execute(
            select(UserPreference).where(
                UserPreference.user_id == user_id,
                UserPreference.key == key,
            )
        )).scalar_one_or_none()
        if existing:
            existing.value = req.value
            s.add(existing)
            await s.commit()
            return {"key": key, "value": existing.value}
        pref = UserPreference(
            id=new_uuid(),
            user_id=user_id,
            key=key,
            value=req.value,
        )
        s.add(pref)
        await s.commit()
    return {"key": key, "value": pref.value}
