from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, Request, UploadFile
from pydantic import BaseModel

from ..errors import http_error
from ..storage.blobs import blob_path

router = APIRouter()


class LinksUpdate(BaseModel):
    links_json: str | None = None


def _now_rfc3339() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def _require_admin(request: Request) -> None:
    """Accept either:
    - legacy OPENPOSTER_ADMIN_TOKEN (dev)
    - a claimed admin session token (preferred)
    """

    auth = request.headers.get("authorization") or ""
    if not auth.startswith("Bearer "):
        raise http_error(401, "unauthorized", "missing bearer token")

    provided = auth.split(" ", 1)[1].strip()

    # Legacy: static admin token (kept for dev/backwards compat)
    legacy = os.environ.get("OPENPOSTER_ADMIN_TOKEN")
    if legacy and provided == legacy:
        return

    # New: session token stored as a hash in DB
    from ..db import AdminSession

    h = _token_hash(provided)
    async with request.app.state.Session() as session:
        row = await session.get(AdminSession, h)
        if row is None:
            raise http_error(403, "forbidden", "invalid admin token")

        # expiry check
        now = datetime.now(timezone.utc)
        try:
            # row.expires_at is RFC3339Z
            exp = datetime.fromisoformat(row.expires_at.replace("Z", "+00:00"))
        except Exception:
            exp = None
        if exp and now >= exp:
            # prune
            await session.delete(row)
            await session.commit()
            raise http_error(403, "forbidden", "admin session expired")


async def _save_upload_to_blob(data_dir: Path, upload: UploadFile) -> tuple[str, int, str]:
    # Stream to disk, hash as we go.
    h = hashlib.sha256()
    data = await upload.read()
    h.update(data)
    hexhash = h.hexdigest()
    sha = f"sha256:{hexhash}"

    dst = blob_path(data_dir, sha)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(data)

    mime = upload.content_type or "application/octet-stream"
    if mime not in {"image/jpeg", "image/png"}:
        raise http_error(400, "invalid_request", "only image/jpeg and image/png are supported in v1")

    return sha, len(data), mime


def _issue_admin_token() -> tuple[str, str]:
    import secrets

    token = secrets.token_urlsafe(32)
    # 1 year expiry for MVP
    from datetime import timedelta

    exp = (datetime.now(timezone.utc) + timedelta(days=365)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return token, exp


class ClaimReq(BaseModel):
    bootstrap_code: str


@router.post("/admin/claim")
async def admin_claim(request: Request, body: ClaimReq):
    """Legacy bootstrap claim (works from CLI/logs)."""

    expected = (request.app.state.bootstrap_code or "").strip()
    if not expected:
        raise http_error(500, "internal", "bootstrap not configured")

    if body.bootstrap_code.strip() != expected:
        raise http_error(403, "forbidden", "invalid bootstrap code")

    token, exp = _issue_admin_token()
    token_h = _token_hash(token)

    now = _now_rfc3339()

    from ..db import AdminSession

    async with request.app.state.Session() as session:
        session.add(AdminSession(token_hash=token_h, created_at=now, expires_at=exp))
        await session.commit()

    return {"admin": {"token": token, "expires_at": exp, "node_id": request.app.state.node_uuid}}


class PairReq(BaseModel):
    pair_code: str


@router.post("/admin/pair")
async def admin_pair(request: Request, body: PairReq):
    """Friendly pairing: user reads a short code from GET /admin/pair and enters it here.

    Intended for same-LAN onboarding.
    """

    cfg = request.app.state.cfg
    pair_file = cfg.data_dir / "pairing_code.json"
    if not pair_file.exists():
        raise http_error(400, "invalid_request", "pairing code not generated yet; open /admin/pair first")

    try:
        import json

        obj = json.loads(pair_file.read_text())
        expected = str(obj.get("code") or "").strip()
        expires_at = str(obj.get("expires_at") or "").strip()
        exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    except Exception:
        raise http_error(500, "internal", "invalid pairing code state")

    now = datetime.now(timezone.utc)
    if not expected or exp <= now:
        raise http_error(403, "forbidden", "pairing code expired; refresh /admin/pair")

    if str(body.pair_code or "").strip() != expected:
        raise http_error(403, "forbidden", "invalid pairing code")

    token, exp_rfc = _issue_admin_token()
    token_h = _token_hash(token)

    from ..db import AdminSession

    async with request.app.state.Session() as session:
        session.add(AdminSession(token_hash=token_h, created_at=_now_rfc3339(), expires_at=exp_rfc))
        await session.commit()

    return {"admin": {"token": token, "expires_at": exp_rfc, "node_id": request.app.state.node_uuid}}


@router.post("/admin/sessions/revoke_all")
async def admin_revoke_all(request: Request):
    await _require_admin(request)
    from sqlalchemy import delete
    from ..db import AdminSession

    async with request.app.state.Session() as session:
        await session.execute(delete(AdminSession))
        await session.commit()

    return {"ok": True}


@router.post("/admin/bootstrap/rotate")
async def admin_rotate_bootstrap(request: Request):
    await _require_admin(request)

    import secrets

    cfg = request.app.state.cfg
    bootstrap_path = cfg.data_dir / "bootstrap_code.txt"
    new_code = secrets.token_urlsafe(18)
    bootstrap_path.write_text(new_code)
    request.app.state.bootstrap_code = new_code

    return {"ok": True}


@router.get("/admin/whoami")
async def admin_whoami(request: Request):
    await _require_admin(request)
    return {"admin": {"node_id": request.app.state.node_uuid}}


@router.post("/admin/posters")
async def admin_upload_poster(
    request: Request,
    tmdb_id: int = Form(...),
    media_type: str = Form(...),
    show_tmdb_id: int | None = Form(None),
    season_number: int | None = Form(None),
    episode_number: int | None = Form(None),
    title: str | None = Form(None),
    year: int | None = Form(None),
    creator_id: str = Form(...),
    creator_display_name: str = Form(...),
    links_json: str | None = Form(None),
    attribution_license: str = Form("all-rights-reserved"),
    attribution_redistribution: str = Form("mirrors-approved"),
    preview: UploadFile = File(...),
    full: UploadFile = File(...),
):
    """MVP ingest endpoint.

    This is intentionally simple for beta testing. It creates a single poster entry and writes blobs to the blob store.
    """

    await _require_admin(request)

    if media_type not in {"movie", "show", "season", "episode", "collection", "backdrop"}:
        raise http_error(400, "invalid_request", "invalid media_type")

    if media_type in {"season", "episode"} and show_tmdb_id is None:
        raise http_error(400, "invalid_request", "show_tmdb_id is required for season/episode")

    # validate links_json if provided
    links_value = None
    if links_json:
        try:
            import json as _json

            links_value = _json.loads(links_json)
            if not isinstance(links_value, list):
                raise ValueError("links_json must be a JSON array")

            # Enforce: links may only point to other content by the same creator.
            # MVP enforcement: only allow links to other poster detail pages on THIS node:
            #   {"href": "/p/<poster_id>", ...}
            # and require that the target poster exists and has the same creator_id.
            for item in links_value:
                if not isinstance(item, dict):
                    raise ValueError("each link must be an object")
                href = item.get("href")
                if not isinstance(href, str) or not href.startswith("/p/"):
                    raise ValueError("links must use href like /p/<poster_id>")
        except Exception as e:
            raise http_error(400, "invalid_request", f"invalid links_json: {e}")

    cfg = request.app.state.cfg
    node_id = request.app.state.node_id

    preview_hash, preview_bytes, preview_mime = await _save_upload_to_blob(cfg.data_dir, preview)
    full_hash, full_bytes, full_mime = await _save_upload_to_blob(cfg.data_dir, full)

    # Local id derived from content; stable-ish
    local_id = "pst_" + hashlib.sha256((str(tmdb_id) + creator_id + full_hash).encode("utf-8")).hexdigest()[:8]
    poster_id = f"op:v1:{node_id}:{local_id}"

    from ..db import Poster

    now = _now_rfc3339()

    async with request.app.state.Session() as session:
        existing = await session.get(Poster, poster_id)
        if existing is not None:
            raise http_error(409, "invalid_request", "poster_id conflict")

        # Enforce links point to other posters by same creator.
        if links_value:
            for item in links_value:
                href = item.get("href")
                target_id = href[len("/p/") :]
                # Decode percent-encoding if any
                try:
                    from urllib.parse import unquote

                    target_id = unquote(target_id)
                except Exception:
                    pass

                target = await session.get(Poster, target_id)
                if target is None or target.deleted_at is not None:
                    raise http_error(400, "invalid_request", f"linked poster not found: {target_id}")
                if target.creator_id != creator_id:
                    raise http_error(400, "invalid_request", "links may only reference posters by the same creator")

        row = Poster(
            poster_id=poster_id,
            created_at=now,
            updated_at=now,
            deleted_at=None,
            media_type=media_type,
            tmdb_id=tmdb_id,
            show_tmdb_id=show_tmdb_id,
            season_number=season_number,
            episode_number=episode_number,
            title=title,
            year=year,
            creator_id=creator_id,
            creator_display_name=creator_display_name,
            creator_home_node=cfg.base_url or str(request.base_url).rstrip("/"),
            attribution_license=attribution_license,
            attribution_redistribution=attribution_redistribution,
            attribution_source_url=None,
            links_json=(None if not links_json else links_json),
            preview_hash=preview_hash,
            preview_bytes=preview_bytes,
            preview_mime=preview_mime,
            preview_width=None,
            preview_height=None,
            full_access="public",
            full_hash=full_hash,
            full_bytes=full_bytes,
            full_mime=full_mime,
            full_width=None,
            full_height=None,
            enc_alg=None,
            enc_key_id=None,
            enc_nonce=None,
        )
        session.add(row)
        await session.commit()

    return {"ok": True, "poster_id": poster_id}


@router.put("/admin/posters/{poster_id}/links")
async def admin_update_links(request: Request, poster_id: str, body: LinksUpdate):
    """Admin-only update for creator-authored related links.

    MVP to enable reciprocal linking after upload.
    """

    await _require_admin(request)
    from ..db import Poster

    links_value = None
    if body.links_json:
        try:
            import json as _json

            links_value = _json.loads(body.links_json)
            if not isinstance(links_value, list):
                raise ValueError("links_json must be a JSON array")
            for item in links_value:
                if not isinstance(item, dict):
                    raise ValueError("each link must be an object")
                href = item.get("href")
                if not isinstance(href, str) or not href.startswith("/p/"):
                    raise ValueError("links must use href like /p/<poster_id>")
        except Exception as e:
            raise http_error(400, "invalid_request", f"invalid links_json: {e}")

    now = _now_rfc3339()

    async with request.app.state.Session() as session:
        p = await session.get(Poster, poster_id)
        if p is None or p.deleted_at is not None:
            raise http_error(404, "not_found", "poster not found")

        # Enforce links point to other posters by same creator.
        if links_value:
            for item in links_value:
                href = item.get("href")
                target_id = href[len("/p/") :]
                try:
                    from urllib.parse import unquote

                    target_id = unquote(target_id)
                except Exception:
                    pass

                target = await session.get(Poster, target_id)
                if target is None or target.deleted_at is not None:
                    raise http_error(400, "invalid_request", f"linked poster not found: {target_id}")
                if target.creator_id != p.creator_id:
                    raise http_error(400, "invalid_request", "links may only reference posters by the same creator")

        p.links_json = body.links_json
        p.updated_at = now
        await session.commit()

    return {"ok": True, "poster_id": poster_id, "updated_at": now}


@router.delete("/admin/posters/{poster_id}")
async def admin_delete_poster(request: Request, poster_id: str):
    await _require_admin(request)
    from ..db import Poster

    now = _now_rfc3339()

    async with request.app.state.Session() as session:
        p = await session.get(Poster, poster_id)
        if p is None:
            raise http_error(404, "not_found", "poster not found")

        p.deleted_at = now
        p.updated_at = now
        await session.commit()

    return {"ok": True, "poster_id": poster_id, "deleted_at": now}
