from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException
from passlib.context import CryptContext

from .config import Config

# NOTE: We intentionally avoid bcrypt for MVP because passlib+bcrypt backend
# compatibility has been brittle across versions (and bcrypt has a 72-byte
# password limit). PBKDF2 is slower but reliable and portable.
_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def validate_email(email: str) -> None:
    # Simple validation for MVP.
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=400, detail={"error": {"code": "invalid_email", "message": "invalid email"}})


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _pwd.verify(password, password_hash)


def make_jwt(cfg: Config, *, user_id: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(seconds=cfg.jwt_exp_seconds)
    return jwt.encode(
        {
            "iss": cfg.jwt_issuer,
            "sub": user_id,
            "iat": int(now.timestamp()),
            "exp": int(exp.timestamp()),
        },
        cfg.jwt_secret,
        algorithm="HS256",
    )


def require_user_id(cfg: Config, authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail={"error": {"code": "unauthorized", "message": "missing token"}})
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, cfg.jwt_secret, algorithms=["HS256"], issuer=cfg.jwt_issuer)
    except Exception:
        raise HTTPException(status_code=401, detail={"error": {"code": "unauthorized", "message": "invalid token"}})
    user_id = payload.get("sub")
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(status_code=401, detail={"error": {"code": "unauthorized", "message": "invalid token"}})
    return user_id
