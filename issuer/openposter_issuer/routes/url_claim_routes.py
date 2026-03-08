from __future__ import annotations

import ipaddress
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

import dns.resolver
import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from ..auth import require_user_id
from ..db import NodeUrl, UrlClaim, new_uuid
from ..util import canonicalize_public_url

router = APIRouter()


def _bad(code: str, message: str, status: int = 400):
    raise HTTPException(status_code=status, detail={"error": {"code": code, "message": message}})


def _hostname_from_public_url(public_url: str) -> str:
    p = urlparse(public_url)
    return (p.hostname or "").lower()


def _is_localhost_or_private_host(host: str) -> bool:
    if host in {"localhost"}:
        return True
    try:
        ip = ipaddress.ip_address(host)
        return ip.is_private or ip.is_loopback
    except Exception:
        return False


def _dns_txt_name(hostname: str) -> str:
    return f"_openposter.{hostname}"


class StartReq(BaseModel):
    public_url: str


@router.post("/v1/url_claims/start")
async def start(req: StartReq, request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))

    url = canonicalize_public_url(req.public_url)
    if not url:
        _bad("invalid_url", "invalid public_url")

    hostname = _hostname_from_public_url(url)
    if not hostname:
        _bad("invalid_url", "invalid public_url")

    # If already owned by this user, no need to re-verify.
    session = request.app.state.Session
    async with session() as s:
        existing = (await s.execute(select(NodeUrl).where(NodeUrl.public_url == url))).scalar_one_or_none()
        if existing and existing.owner_user_id == user_id:
            return {
                "public_url": url,
                "already_owned": True,
                "challenge": None,
                "dns": None,
                "http": None,
            }

    # Create or refresh a claim.
    token = "openposter-claim=" + secrets.token_urlsafe(24)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

    async with session() as s:
        row = (
            await s.execute(
                select(UrlClaim).where(UrlClaim.public_url == url, UrlClaim.owner_user_id == user_id)
            )
        ).scalar_one_or_none()
        if row is None:
            row = UrlClaim(
                id=new_uuid(),
                public_url=url,
                owner_user_id=user_id,
                token=token,
                expires_at=expires_at,
                verified_at=None,
            )
            s.add(row)
        else:
            row.token = token
            row.expires_at = expires_at
            row.verified_at = None
        await s.commit()

    dns_name = _dns_txt_name(hostname)
    http_url = f"{url}/.well-known/openposter-claim.txt"

    return {
        "public_url": url,
        "already_owned": False,
        "expires_at": expires_at.isoformat(),
        "challenge": token,
        "dns": {
            "type": "TXT",
            "name": dns_name,
            "value": token,
        },
        "http": {
            "url": http_url,
            "body": token,
        },
        "note": "For IP addresses/private hosts, HTTP verification is recommended; DNS TXT may not apply.",
    }


class VerifyReq(BaseModel):
    public_url: str
    method: str  # dns|http


@router.post("/v1/url_claims/verify")
async def verify(req: VerifyReq, request: Request):
    cfg = request.app.state.cfg
    user_id = require_user_id(cfg, request.headers.get("authorization"))

    url = canonicalize_public_url(req.public_url)
    if not url:
        _bad("invalid_url", "invalid public_url")

    method = (req.method or "").strip().lower()
    if method not in {"dns", "http"}:
        _bad("invalid_request", "method must be dns or http")

    hostname = _hostname_from_public_url(url)
    if not hostname:
        _bad("invalid_url", "invalid public_url")

    # Already owned by this user -> verified by definition.
    session = request.app.state.Session
    async with session() as s:
        existing = (await s.execute(select(NodeUrl).where(NodeUrl.public_url == url))).scalar_one_or_none()
        if existing and existing.owner_user_id == user_id:
            return {"public_url": url, "verified": True, "already_owned": True}

        claim = (
            await s.execute(
                select(UrlClaim).where(UrlClaim.public_url == url, UrlClaim.owner_user_id == user_id)
            )
        ).scalar_one_or_none()
        if claim is None:
            _bad("no_claim", "no claim started for this URL")

        now = datetime.now(timezone.utc)
        if claim.expires_at.replace(tzinfo=timezone.utc) < now:
            _bad("claim_expired", "claim expired, start again", status=400)

        token = claim.token

    ok = False
    details: dict[str, Any] = {}

    if method == "dns":
        # For IP addresses, DNS doesn't apply.
        if _is_localhost_or_private_host(hostname) or hostname.replace(".", "").isdigit():
            _bad("dns_not_applicable", "DNS verification is not applicable for localhost/private/IP addresses")

        name = _dns_txt_name(hostname)
        try:
            answers = dns.resolver.resolve(name, "TXT")
            values = []
            for r in answers:
                # dnspython returns chunks; join them
                txt = "".join([b.decode("utf-8") if isinstance(b, (bytes, bytearray)) else str(b) for b in r.strings])
                values.append(txt)
            details["txt_values"] = values
            ok = token in values
        except Exception as e:
            details["error"] = str(e)
            ok = False

    if method == "http":
        well_known = f"{url}/.well-known/openposter-claim.txt"
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                r = await client.get(well_known)
            details["status"] = r.status_code
            details["url"] = well_known
            body = (r.text or "").strip()
            details["body"] = body
            ok = r.status_code == 200 and body == token
        except Exception as e:
            details["error"] = str(e)
            ok = False

    if not ok:
        return {"public_url": url, "verified": False, "details": details}

    # Mark verified.
    async with session() as s:
        claim = (
            await s.execute(
                select(UrlClaim).where(UrlClaim.public_url == url, UrlClaim.owner_user_id == user_id)
            )
        ).scalar_one_or_none()
        if claim is None:
            _bad("no_claim", "no claim started for this URL")
        claim.verified_at = datetime.now(timezone.utc)
        await s.commit()

    return {"public_url": url, "verified": True}
