from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from ..auth import (
    hash_password,
    make_jwt,
    normalize_email,
    require_user_id,
    validate_email,
    verify_password,
)
from ..db import CreatorHandle, User, new_uuid

router = APIRouter()


class SignupReq(BaseModel):
    email: str
    password: str
    display_name: str | None = None


class LoginReq(BaseModel):
    email: str
    password: str


@router.post("/v1/auth/signup")
async def signup(req: SignupReq, request: Request):
    cfg = request.app.state.cfg
    email = normalize_email(req.email)
    validate_email(email)
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail={"error": {"code": "weak_password", "message": "password too short"}})

    session = request.app.state.Session
    async with session() as s:
        existing = (await s.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=409, detail={"error": {"code": "email_taken", "message": "email already registered"}})
        u = User(
            user_id=new_uuid(),
            email=email,
            display_name=req.display_name,
            password_hash=hash_password(req.password),
        )
        s.add(u)
        await s.commit()

    token = make_jwt(cfg, user_id=u.user_id)
    return {"user": {"user_id": u.user_id, "email": u.email, "display_name": u.display_name}, "token": token}


@router.post("/v1/auth/login")
async def login(req: LoginReq, request: Request):
    cfg = request.app.state.cfg
    email = normalize_email(req.email)
    validate_email(email)

    session = request.app.state.Session
    async with session() as s:
        u = (await s.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if not u or not verify_password(req.password, u.password_hash):
            raise HTTPException(status_code=401, detail={"error": {"code": "invalid_login", "message": "invalid email or password"}})

    token = make_jwt(cfg, user_id=u.user_id)
    return {"user": {"user_id": u.user_id, "email": u.email, "display_name": u.display_name}, "token": token}


@router.get("/v1/me")
async def me(request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))

    session = request.app.state.Session
    async with session() as s:
        u = (await s.execute(select(User).where(User.user_id == user_id))).scalar_one_or_none()
        if not u:
            raise HTTPException(status_code=404, detail={"error": {"code": "not_found", "message": "user not found"}})
        ch = (await s.execute(select(CreatorHandle).where(CreatorHandle.user_id == user_id))).scalar_one_or_none()
        return {"user": {"user_id": u.user_id, "email": u.email, "display_name": u.display_name, "handle": ch.handle if ch else None}}
