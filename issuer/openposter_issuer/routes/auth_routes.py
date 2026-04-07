from __future__ import annotations

import json
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fido2.server import Fido2Server
from fido2.utils import websafe_decode, websafe_encode
from fido2.webauthn import AttestedCredentialData, PublicKeyCredentialRpEntity
from pydantic import BaseModel
from sqlalchemy import select

from ..auth import (
    hash_password,
    issuer_rp_id,
    make_email_proof_jwt,
    make_jwt,
    new_email_code,
    normalize_email,
    require_email_proof,
    require_user_id,
    validate_email,
    hash_code,
)
from ..db import CreatorHandle, EmailChallenge, PasskeyCredential, User, WebauthnChallenge, new_uuid

router = APIRouter()


def _bad(code: str, message: str, status: int = 400):
    raise HTTPException(status_code=status, detail={"error": {"code": code, "message": message}})


def _server(request: Request) -> Fido2Server:
    cfg = request.app.state.cfg
    rp = PublicKeyCredentialRpEntity(id=issuer_rp_id(cfg), name="OpenPoster Issuer")
    return Fido2Server(rp)


def _encode_options(value):
    return jsonable_encoder(
        value,
        custom_encoder={
            bytes: _websafe_str,
        },
    )


def _now() -> datetime:
    # SQLite stores naive UTC timestamps in this service, so auth comparisons
    # need to stay in that same representation.
    return datetime.utcnow()


def _websafe_str(value: bytes | bytearray) -> str:
    encoded = websafe_encode(bytes(value))
    return encoded if isinstance(encoded, str) else encoded.decode("ascii")


class EmailStartReq(BaseModel):
    email: str


class EmailVerifyReq(BaseModel):
    email: str
    code: str


class PasskeyRegisterBeginReq(BaseModel):
    proof_token: str
    display_name: str | None = None


class PasskeyRegisterCompleteReq(BaseModel):
    proof_token: str
    challenge_id: str
    credential: dict
    display_name: str | None = None


class PasskeyLoginBeginReq(BaseModel):
    pass


class PasskeyLoginCompleteReq(BaseModel):
    challenge_id: str
    credential: dict


class SignupReq(BaseModel):
    email: str
    password: str
    display_name: str | None = None


@router.post("/v1/auth/email/start")
async def start_email(req: EmailStartReq, request: Request):
    email = normalize_email(req.email)
    validate_email(email)

    session = request.app.state.Session
    async with session() as s:
        existing = (await s.execute(select(User).where(User.email == email))).scalar_one_or_none()
        code = new_email_code()
        challenge = EmailChallenge(
            id=new_uuid(),
            email=email,
            code_hash=hash_code(code),
            purpose="auth",
            expires_at=_now() + timedelta(minutes=10),
        )
        s.add(challenge)
        await s.commit()

    # MVP/dev: return the code so the local issuer UI can complete the flow without SMTP.
    return {
        "ok": True,
        "email": email,
        "account_exists": existing is not None,
        "dev_code": code,
        "expires_in_seconds": 600,
    }


@router.post("/v1/auth/email/verify")
async def verify_email(req: EmailVerifyReq, request: Request):
    cfg = request.app.state.cfg
    email = normalize_email(req.email)
    validate_email(email)

    session = request.app.state.Session
    async with session() as s:
        row = (
            await s.execute(
                select(EmailChallenge)
                .where(EmailChallenge.email == email, EmailChallenge.purpose == "auth")
                .order_by(EmailChallenge.created_at.desc())
            )
        ).scalars().first()
        if row is None or row.consumed_at is not None or row.expires_at <= _now():
            _bad("invalid_code", "verification code expired or invalid")
        if row.code_hash != hash_code((req.code or "").strip()):
            row.attempt_count = str(int(row.attempt_count or "0") + 1)
            await s.commit()
            _bad("invalid_code", "verification code expired or invalid")

        row.consumed_at = _now()
        existing = (await s.execute(select(User).where(User.email == email))).scalar_one_or_none()
        await s.commit()

    return {
        "ok": True,
        "proof_token": make_email_proof_jwt(cfg, email=email, account_exists=existing is not None),
        "account_exists": existing is not None,
    }


@router.post("/v1/auth/passkeys/register/begin")
async def passkey_register_begin(req: PasskeyRegisterBeginReq, request: Request):
    cfg = request.app.state.cfg
    email, account_exists = require_email_proof(cfg, req.proof_token)
    session = request.app.state.Session
    async with session() as s:
        user = (await s.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if account_exists and user is None:
            _bad("not_found", "user not found", 404)

        display_name = (req.display_name or "").strip() or email
        user_id = user.user_id if user else f"pending:{email}"
        options, state = _server(request).register_begin(
            {
                "id": user_id.encode("utf-8"),
                "name": email,
                "displayName": display_name,
            },
            user_verification="preferred",
            resident_key_requirement="preferred",
        )
        challenge = WebauthnChallenge(
            id=new_uuid(),
            email=email,
            user_id=user.user_id if user else None,
            purpose="register",
            state_json=json.dumps(state),
            expires_at=_now() + timedelta(minutes=10),
        )
        s.add(challenge)
        await s.commit()

    return {"challenge_id": challenge.id, "options": _encode_options(options)}


@router.post("/v1/auth/passkeys/register/complete")
async def passkey_register_complete(req: PasskeyRegisterCompleteReq, request: Request):
    cfg = request.app.state.cfg
    email, account_exists = require_email_proof(cfg, req.proof_token)
    session = request.app.state.Session
    async with session() as s:
        challenge = await s.get(WebauthnChallenge, req.challenge_id)
        if challenge is None or challenge.purpose != "register" or challenge.consumed_at is not None or challenge.expires_at <= _now():
            _bad("invalid_request", "registration challenge expired or invalid")
        if challenge.email != email:
            _bad("invalid_request", "challenge does not match verified email")

        user = (await s.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if not account_exists and user is not None:
            account_exists = True
        if not account_exists:
            display_name = (req.display_name or "").strip() or email
            user = User(user_id=new_uuid(), email=email, display_name=display_name, password_hash="")
            s.add(user)
            await s.flush()

        state = json.loads(challenge.state_json)
        auth_data = _server(request).register_complete(state, req.credential)
        credential_data = auth_data.credential_data
        if credential_data is None:
            _bad("invalid_request", "passkey registration did not return credential data")
        cred = PasskeyCredential(
            id=new_uuid(),
            user_id=user.user_id,
            credential_id=_websafe_str(credential_data.credential_id),
            credential_data=_websafe_str(bytes(credential_data)),
            label="Passkey",
        )
        s.add(cred)
        challenge.consumed_at = _now()
        await s.commit()

        ch = (await s.execute(select(CreatorHandle).where(CreatorHandle.user_id == user.user_id))).scalar_one_or_none()
        token = make_jwt(cfg, user_id=user.user_id)
        return {"user": {"user_id": user.user_id, "email": user.email, "display_name": user.display_name, "handle": ch.handle if ch else None}, "token": token}


@router.post("/v1/auth/passkeys/login/begin")
async def passkey_login_begin(req: PasskeyLoginBeginReq, request: Request):
    session = request.app.state.Session
    async with session() as s:
        creds = (await s.execute(select(PasskeyCredential))).scalars().all()
        if not creds:
            _bad("not_found", "no passkeys registered yet; use register / recover first", 404)

        options, state = _server(request).authenticate_begin(
            [AttestedCredentialData(websafe_decode(c.credential_data)) for c in creds],
            user_verification="preferred",
        )
        challenge = WebauthnChallenge(
            id=new_uuid(),
            email=None,
            user_id=None,
            purpose="login",
            state_json=json.dumps(state),
            expires_at=_now() + timedelta(minutes=10),
        )
        s.add(challenge)
        await s.commit()

    return {"challenge_id": challenge.id, "options": _encode_options(options)}


@router.post("/v1/auth/passkeys/login/complete")
async def passkey_login_complete(req: PasskeyLoginCompleteReq, request: Request):
    cfg = request.app.state.cfg
    session = request.app.state.Session
    async with session() as s:
        challenge = await s.get(WebauthnChallenge, req.challenge_id)
        if challenge is None or challenge.purpose != "login" or challenge.consumed_at is not None or challenge.expires_at <= _now():
            _bad("invalid_request", "login challenge expired or invalid")

        creds = (await s.execute(select(PasskeyCredential))).scalars().all()
        if not creds:
            _bad("not_found", "no passkeys registered", 404)

        state = json.loads(challenge.state_json)
        credential_data = [AttestedCredentialData(websafe_decode(c.credential_data)) for c in creds]
        auth_data = _server(request).authenticate_complete(state, credential_data, req.credential)
        credential_id = _websafe_str(auth_data.credential_id)
        cred = (await s.execute(select(PasskeyCredential).where(PasskeyCredential.credential_id == credential_id))).scalar_one_or_none()
        if cred is None:
            _bad("unauthorized", "unknown credential", 401)
        cred.last_used_at = _now()
        challenge.consumed_at = _now()
        user = await s.get(User, cred.user_id)
        if user is None:
            _bad("not_found", "user not found", 404)
        ch = (await s.execute(select(CreatorHandle).where(CreatorHandle.user_id == user.user_id))).scalar_one_or_none()
        await s.commit()
        token = make_jwt(cfg, user_id=user.user_id)
        return {"user": {"user_id": user.user_id, "email": user.email, "display_name": user.display_name, "handle": ch.handle if ch else None}, "token": token}


# Legacy password endpoints remain available for compatibility while passkey-first auth rolls out.


@router.post("/v1/auth/signup")
async def signup_legacy(req: SignupReq, request: Request):
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

class LoginReq(BaseModel):
    email: str
    password: str


@router.post("/v1/auth/login")
async def login_legacy(req: LoginReq, request: Request):
    from ..auth import verify_password

    cfg = request.app.state.cfg
    email = normalize_email(req.email)
    validate_email(email)

    session = request.app.state.Session
    async with session() as s:
        u = (await s.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if not u or not u.password_hash or not verify_password(req.password, u.password_hash):
            raise HTTPException(status_code=401, detail={"error": {"code": "invalid_login", "message": "invalid email or password"}})

    token = make_jwt(cfg, user_id=u.user_id)
    ch = None
    async with session() as s:
        ch = (await s.execute(select(CreatorHandle).where(CreatorHandle.user_id == u.user_id))).scalar_one_or_none()
    return {"user": {"user_id": u.user_id, "email": u.email, "display_name": u.display_name, "handle": ch.handle if ch else None}, "token": token}


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
