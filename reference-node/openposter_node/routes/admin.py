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


class ThemeCreate(BaseModel):
    name: str
    description: str | None = None


class ThemeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class PosterThemeUpdate(BaseModel):
    theme_id: str | None = None


class PosterMetaPatch(BaseModel):
    """Patch mutable metadata on an existing poster.  All fields optional — only supplied fields are updated."""
    tmdb_id: int | None = None
    collection_tmdb_id: int | None = None
    show_tmdb_id: int | None = None
    season_number: int | None = None
    episode_number: int | None = None
    title: str | None = None
    year: int | None = None
    # Pass explicit sentinel to clear a field (e.g. collection_tmdb_id=0 means "remove the link")
    clear_collection_tmdb_id: bool = False
    clear_show_tmdb_id: bool = False
    published: bool | None = None
    language: str | None = None
    clear_language: bool = False  # set language to null (Textless)


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


@router.put("/admin/claim-token")
async def admin_set_claim_token(request: Request):
    await _require_admin(request)
    body = await request.json()
    token = (body.get("token") or "").strip()
    if not token:
        raise http_error(400, "invalid_request", "token required")
    request.app.state.claim_token = token
    return {"ok": True}


@router.post("/admin/themes")
async def admin_create_theme(request: Request, body: ThemeCreate):
    await _require_admin(request)
    import secrets
    from ..db import CreatorTheme

    # Derive creator_id from whoami — for now require creator_id in request header
    # (same pattern as poster upload: creator passes their creator_id)
    creator_id = request.headers.get("x-creator-id", "").strip()
    if not creator_id:
        raise http_error(400, "invalid_request", "x-creator-id header required")

    name = (body.name or "").strip()
    if not name:
        raise http_error(400, "invalid_request", "name is required")

    theme_id = "thm_" + secrets.token_hex(8)
    now = _now_rfc3339()

    async with request.app.state.Session() as session:
        session.add(CreatorTheme(
            theme_id=theme_id,
            creator_id=creator_id,
            name=name,
            description=body.description,
            cover_hash=None,
            created_at=now,
            updated_at=now,
            deleted_at=None,
        ))
        await session.commit()

    return {"theme_id": theme_id, "creator_id": creator_id, "name": name, "description": body.description, "created_at": now, "updated_at": now}


@router.get("/admin/themes")
async def admin_list_themes(request: Request):
    await _require_admin(request)
    from sqlalchemy import select
    from ..db import CreatorTheme, Poster

    creator_id = request.headers.get("x-creator-id", "").strip()
    if not creator_id:
        raise http_error(400, "invalid_request", "x-creator-id header required")

    async with request.app.state.Session() as session:
        stmt = select(CreatorTheme).where(
            CreatorTheme.creator_id == creator_id,
            CreatorTheme.deleted_at.is_(None),
        ).order_by(CreatorTheme.created_at.asc())
        themes = list((await session.execute(stmt)).scalars().all())

        # Auto-provision a Default theme if creator has none
        if not themes:
            import secrets as _secrets
            theme_id = "thm_" + _secrets.token_hex(8)
            now = _now_rfc3339()
            default_theme = CreatorTheme(
                theme_id=theme_id,
                creator_id=creator_id,
                name="Default theme",
                description=None,
                cover_hash=None,
                created_at=now,
                updated_at=now,
                deleted_at=None,
            )
            session.add(default_theme)
            await session.commit()
            themes = [default_theme]

        # Count posters per theme
        from sqlalchemy import func
        count_stmt = select(Poster.theme_id, func.count(Poster.poster_id)).where(
            Poster.creator_id == creator_id,
            Poster.deleted_at.is_(None),
            Poster.theme_id.is_not(None),
        ).group_by(Poster.theme_id)
        counts = dict((await session.execute(count_stmt)).all())

    cfg = request.app.state.cfg

    def _cover_url(cover_hash: str | None) -> str | None:
        if not cover_hash:
            return None
        return (
            f"{cfg.base_url}/v1/blobs/{cover_hash}"
            if cfg.base_url
            else f"{request.base_url}v1/blobs/{cover_hash}"
        )

    return {"themes": [
        {
            "theme_id": t.theme_id,
            "creator_id": t.creator_id,
            "name": t.name,
            "description": t.description,
            "cover_hash": t.cover_hash,
            "cover_url": _cover_url(t.cover_hash),
            "poster_count": counts.get(t.theme_id, 0),
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }
        for t in themes
    ]}


@router.put("/admin/themes/{theme_id}")
async def admin_update_theme(request: Request, theme_id: str, body: ThemeUpdate):
    await _require_admin(request)
    from ..db import CreatorTheme

    creator_id = request.headers.get("x-creator-id", "").strip()

    now = _now_rfc3339()

    async with request.app.state.Session() as session:
        t = await session.get(CreatorTheme, theme_id)
        if t is None or t.deleted_at is not None:
            raise http_error(404, "not_found", "theme not found")
        if creator_id and t.creator_id != creator_id:
            raise http_error(403, "forbidden", "theme belongs to a different creator")
        if body.name is not None:
            name = body.name.strip()
            if not name:
                raise http_error(400, "invalid_request", "name cannot be empty")
            t.name = name
        if body.description is not None:
            t.description = body.description
        t.updated_at = now
        await session.commit()

    return {"ok": True, "theme_id": theme_id, "updated_at": now}


@router.delete("/admin/themes/{theme_id}")
async def admin_delete_theme(request: Request, theme_id: str):
    await _require_admin(request)
    from sqlalchemy import func, select, update
    from ..db import CreatorTheme, Poster

    creator_id = request.headers.get("x-creator-id", "").strip()
    now = _now_rfc3339()

    async with request.app.state.Session() as session:
        t = await session.get(CreatorTheme, theme_id)
        if t is None or t.deleted_at is not None:
            raise http_error(404, "not_found", "theme not found")
        if creator_id and t.creator_id != creator_id:
            raise http_error(403, "forbidden", "theme belongs to a different creator")

        # Prevent deleting the only remaining theme
        remaining = (await session.execute(
            select(func.count(CreatorTheme.theme_id)).where(
                CreatorTheme.creator_id == t.creator_id,
                CreatorTheme.deleted_at.is_(None),
            )
        )).scalar_one()
        if remaining <= 1:
            raise http_error(409, "conflict", "cannot delete the only theme")

        # Unset theme_id on all associated posters (do NOT delete them)
        await session.execute(
            update(Poster)
            .where(Poster.theme_id == theme_id)
            .values(theme_id=None, updated_at=now)
        )

        t.deleted_at = now
        t.updated_at = now
        await session.commit()

    return {"ok": True, "theme_id": theme_id, "deleted_at": now}


@router.put("/admin/posters/{poster_id}/theme")
async def admin_set_poster_theme(request: Request, poster_id: str, body: PosterThemeUpdate):
    """Reassign a poster to a different theme (or remove from theme with theme_id: null)."""
    await _require_admin(request)
    from ..db import CreatorTheme, Poster

    now = _now_rfc3339()

    async with request.app.state.Session() as session:
        p = await session.get(Poster, poster_id)
        if p is None or p.deleted_at is not None:
            raise http_error(404, "not_found", "poster not found")

        if body.theme_id is not None:
            t = await session.get(CreatorTheme, body.theme_id)
            if t is None or t.deleted_at is not None:
                raise http_error(400, "invalid_request", "theme not found")
            if t.creator_id != p.creator_id:
                raise http_error(400, "invalid_request", "theme belongs to a different creator")

        p.theme_id = body.theme_id
        p.updated_at = now
        await session.commit()

    return {"ok": True, "poster_id": poster_id, "theme_id": body.theme_id, "updated_at": now}


@router.post("/admin/themes/{theme_id}/cover")
async def admin_upload_theme_cover(request: Request, theme_id: str, cover: UploadFile):
    """Upload a cover image for a theme. Stored as a blob; sets cover_hash on the theme."""
    await _require_admin(request)
    from ..db import CreatorTheme

    creator_id = request.headers.get("x-creator-id", "").strip()
    cfg = request.app.state.cfg
    now = _now_rfc3339()

    cover_hash, _bytes, _mime = await _save_upload_to_blob(cfg.data_dir, cover)

    async with request.app.state.Session() as session:
        t = await session.get(CreatorTheme, theme_id)
        if t is None or t.deleted_at is not None:
            raise http_error(404, "not_found", "theme not found")
        if creator_id and t.creator_id != creator_id:
            raise http_error(403, "forbidden", "theme belongs to a different creator")
        t.cover_hash = cover_hash
        t.updated_at = now
        await session.commit()

    cover_url = f"{cfg.base_url}/v1/blobs/{cover_hash}" if cfg.base_url else f"{request.base_url}v1/blobs/{cover_hash}"
    return {"ok": True, "theme_id": theme_id, "cover_hash": cover_hash, "cover_url": cover_url}


@router.post("/admin/creator_profile/backdrop")
async def admin_upload_creator_backdrop(request: Request, backdrop: UploadFile):
    """Upload a backdrop image for the creator's public profile page."""
    await _require_admin(request)
    from ..db import CreatorProfile

    creator_id = request.headers.get("x-creator-id", "").strip()
    if not creator_id:
        raise http_error(400, "invalid_request", "x-creator-id header required")

    cfg = request.app.state.cfg
    now = _now_rfc3339()

    backdrop_hash, _bytes, _mime = await _save_upload_to_blob(cfg.data_dir, backdrop)

    async with request.app.state.Session() as session:
        existing = await session.get(CreatorProfile, creator_id)
        if existing:
            existing.backdrop_hash = backdrop_hash
            existing.updated_at = now
        else:
            session.add(CreatorProfile(creator_id=creator_id, backdrop_hash=backdrop_hash, updated_at=now))
        await session.commit()

    backdrop_url = f"{cfg.base_url}/v1/blobs/{backdrop_hash}" if cfg.base_url else f"{request.base_url}v1/blobs/{backdrop_hash}"
    return {"ok": True, "creator_id": creator_id, "backdrop_hash": backdrop_hash, "backdrop_url": backdrop_url}


@router.post("/admin/posters")
async def admin_upload_poster(
    request: Request,
    tmdb_id: int = Form(...),
    media_type: str = Form(...),
    show_tmdb_id: int | None = Form(None),
    season_number: int | None = Form(None),
    episode_number: int | None = Form(None),
    collection_tmdb_id: int | None = Form(None),
    title: str | None = Form(None),
    year: int | None = Form(None),
    creator_id: str = Form(...),
    creator_display_name: str = Form(...),
    links_json: str | None = Form(None),
    theme_id: str | None = Form(None),
    kind: str = Form("poster"),
    language: str | None = Form(None),
    attribution_license: str = Form("all-rights-reserved"),
    attribution_redistribution: str = Form("mirrors-approved"),
    published: bool = Form(True),
    force: str = Form(""),
    preview: UploadFile = File(...),
    full: UploadFile = File(...),
):
    """MVP ingest endpoint.

    This is intentionally simple for beta testing. It creates a single poster entry and writes blobs to the blob store.
    """

    await _require_admin(request)

    if media_type not in {"movie", "show", "season", "episode", "collection", "backdrop"}:
        raise http_error(400, "invalid_request", "invalid media_type")

    if kind not in {"poster", "background", "logo", "square", "banner", "thumb"}:
        raise http_error(400, "invalid_request", "invalid kind; must be one of: poster, background, logo, square, banner, thumb")

    if media_type in {"season", "episode"} and show_tmdb_id is None:
        raise http_error(400, "invalid_request", "show_tmdb_id is required for season/episode")

    # validate theme_id if provided
    if theme_id:
        from ..db import CreatorTheme
        async with request.app.state.Session() as _tsess:
            _t = await _tsess.get(CreatorTheme, theme_id)
            if _t is None or _t.deleted_at is not None:
                raise http_error(400, "invalid_request", "theme not found")
            if _t.creator_id != creator_id:
                raise http_error(400, "invalid_request", "theme belongs to a different creator")

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

    force_flag = force.strip().lower() in ("true", "1")

    cfg = request.app.state.cfg
    node_id = request.app.state.node_id

    preview_hash, preview_bytes, preview_mime = await _save_upload_to_blob(cfg.data_dir, preview)
    full_hash, full_bytes, full_mime = await _save_upload_to_blob(cfg.data_dir, full)

    # Local id derived from content + slot metadata.
    # Include slot-defining fields so that uploads in different kinds/themes/languages
    # do not collide, while a re-upload of the same deleted artwork for the same slot
    # can still resurrect the original row.
    # When force=True, add a random salt so a forced duplicate gets its own unique ID.
    id_components = ":".join([
        str(tmdb_id),
        creator_id,
        media_type,
        kind,
        str(show_tmdb_id) if show_tmdb_id is not None else "",
        str(season_number) if season_number is not None else "",
        str(episode_number) if episode_number is not None else "",
        str(collection_tmdb_id) if collection_tmdb_id is not None else "",
        theme_id or "",
        language or "",
        full_hash,
        os.urandom(4).hex() if force_flag else "",
    ])
    local_id = "pst_" + hashlib.sha256(id_components.encode("utf-8")).hexdigest()[:8]
    poster_id = f"op:v1:{node_id}:{local_id}"

    from ..db import Poster
    from sqlalchemy import select as _select

    now = _now_rfc3339()

    async with request.app.state.Session() as session:
        # Semantic duplicate check: same creator, same artwork slot, same file content.
        # Artwork slot includes kind/theme/language and the relevant media hierarchy fields,
        # so a poster upload is not incorrectly blocked by the same image being used for a
        # different slot.
        if not force_flag:
            dup_stmt = _select(Poster).where(
                Poster.creator_id == creator_id,
                Poster.media_type == media_type,
                Poster.kind == kind,
                Poster.tmdb_id == tmdb_id,
                Poster.show_tmdb_id == show_tmdb_id,
                Poster.collection_tmdb_id == collection_tmdb_id,
                Poster.theme_id == theme_id,
                Poster.language == language,
                Poster.full_hash == full_hash,
                Poster.deleted_at.is_(None),
            )
            dup_stmt = dup_stmt.where(Poster.season_number == season_number)
            dup_stmt = dup_stmt.where(Poster.episode_number == episode_number)
            existing = (await session.execute(dup_stmt)).scalars().first()
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

        # If a soft-deleted row already occupies this poster_id, resurrect it
        # rather than inserting a new row (which would hit the UNIQUE constraint).
        existing_deleted = await session.get(Poster, poster_id)
        if existing_deleted is not None:
            existing_deleted.updated_at = now
            existing_deleted.deleted_at = None
            existing_deleted.media_type = media_type
            existing_deleted.kind = kind
            existing_deleted.tmdb_id = tmdb_id
            existing_deleted.show_tmdb_id = show_tmdb_id
            existing_deleted.season_number = season_number
            existing_deleted.episode_number = episode_number
            existing_deleted.collection_tmdb_id = collection_tmdb_id
            existing_deleted.title = title
            existing_deleted.year = year
            existing_deleted.creator_id = creator_id
            existing_deleted.creator_display_name = creator_display_name
            existing_deleted.creator_home_node = cfg.base_url or str(request.base_url).rstrip("/")
            existing_deleted.attribution_license = attribution_license
            existing_deleted.attribution_redistribution = attribution_redistribution
            existing_deleted.attribution_source_url = None
            existing_deleted.links_json = None if not links_json else links_json
            existing_deleted.theme_id = theme_id
            existing_deleted.language = language
            existing_deleted.preview_hash = preview_hash
            existing_deleted.preview_bytes = preview_bytes
            existing_deleted.preview_mime = preview_mime
            existing_deleted.preview_width = None
            existing_deleted.preview_height = None
            existing_deleted.full_access = "public"
            existing_deleted.full_hash = full_hash
            existing_deleted.full_bytes = full_bytes
            existing_deleted.full_mime = full_mime
            existing_deleted.full_width = None
            existing_deleted.full_height = None
            existing_deleted.enc_alg = None
            existing_deleted.enc_key_id = None
            existing_deleted.enc_nonce = None
            existing_deleted.published = published
            await session.commit()
            return {"ok": True, "poster_id": poster_id}

        row = Poster(
            poster_id=poster_id,
            created_at=now,
            updated_at=now,
            deleted_at=None,
            media_type=media_type,
            kind=kind,
            tmdb_id=tmdb_id,
            show_tmdb_id=show_tmdb_id,
            season_number=season_number,
            episode_number=episode_number,
            collection_tmdb_id=collection_tmdb_id,
            title=title,
            year=year,
            creator_id=creator_id,
            creator_display_name=creator_display_name,
            creator_home_node=cfg.base_url or str(request.base_url).rstrip("/"),
            attribution_license=attribution_license,
            attribution_redistribution=attribution_redistribution,
            attribution_source_url=None,
            links_json=(None if not links_json else links_json),
            theme_id=theme_id,
            language=language,
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
            published=published,
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


@router.patch("/admin/posters/{poster_id}")
async def admin_patch_poster(request: Request, poster_id: str, body: PosterMetaPatch):
    """Update mutable metadata on an existing poster (collection_tmdb_id, show_tmdb_id, title, year, etc.)."""
    await _require_admin(request)
    from ..db import Poster

    now = _now_rfc3339()

    async with request.app.state.Session() as session:
        p = await session.get(Poster, poster_id)
        if p is None or p.deleted_at is not None:
            raise http_error(404, "not_found", "poster not found")

        if body.tmdb_id is not None:
            p.tmdb_id = body.tmdb_id

        if body.clear_collection_tmdb_id:
            p.collection_tmdb_id = None
        elif body.collection_tmdb_id is not None:
            p.collection_tmdb_id = body.collection_tmdb_id

        if body.clear_show_tmdb_id:
            p.show_tmdb_id = None
        elif body.show_tmdb_id is not None:
            p.show_tmdb_id = body.show_tmdb_id

        if body.season_number is not None:
            p.season_number = body.season_number
        if body.episode_number is not None:
            p.episode_number = body.episode_number
        if body.title is not None:
            p.title = body.title
        if body.year is not None:
            p.year = body.year
        if body.published is not None:
            p.published = body.published
        if body.clear_language:
            p.language = None
        elif body.language is not None:
            p.language = body.language

        p.updated_at = now
        await session.commit()

    return {"ok": True, "poster_id": poster_id, "updated_at": now}


@router.get("/admin/settings/{key}")
async def admin_get_setting(request: Request, key: str):
    await _require_admin(request)
    from ..db import CreatorSettings

    creator_id = request.headers.get("x-creator-id", "")
    async with request.app.state.Session() as session:
        row = await session.get(CreatorSettings, (creator_id, key))
        if row is None:
            return {"key": key, "value": None}
        return {"key": key, "value": row.value}


@router.put("/admin/settings/{key}")
async def admin_put_setting(request: Request, key: str):
    await _require_admin(request)
    from ..db import CreatorSettings

    creator_id = request.headers.get("x-creator-id", "")
    body = await request.json()
    value = body.get("value")
    if value is None:
        raise http_error(400, "bad_request", "missing value")

    now = _now_rfc3339()
    async with request.app.state.Session() as session:
        row = await session.get(CreatorSettings, (creator_id, key))
        if row is None:
            session.add(CreatorSettings(creator_id=creator_id, key=key, value=value, updated_at=now))
        else:
            row.value = value
            row.updated_at = now
        await session.commit()

    return {"ok": True, "key": key, "updated_at": now}


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
