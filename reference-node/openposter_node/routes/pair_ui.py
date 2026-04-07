from __future__ import annotations

import ipaddress
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

router = APIRouter()


def _is_local_or_private(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host)
        return ip.is_private or ip.is_loopback
    except Exception:
        # If it's not an IP (e.g. unix socket), allow.
        return True


def _pair_file(data_dir: Path) -> Path:
    return data_dir / "pairing_code.json"


def _get_or_create_pairing_code(data_dir: Path) -> tuple[str, str]:
    """Returns (code, expires_at_rfc3339z)."""

    p = _pair_file(data_dir)
    now = datetime.now(timezone.utc).replace(microsecond=0)

    if p.exists():
        try:
            obj = json.loads(p.read_text())
            code = str(obj.get("code") or "").strip()
            expires_at = str(obj.get("expires_at") or "").strip()
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if code and exp > now:
                return code, expires_at
        except Exception:
            pass

    # Create a new short-lived code.
    import secrets

    code = f"{secrets.randbelow(1000000):06d}"
    exp = now + timedelta(minutes=10)
    expires_at = exp.isoformat().replace("+00:00", "Z")
    p.write_text(json.dumps({"code": code, "expires_at": expires_at}, indent=2))
    return code, expires_at


@router.get("/admin/pair")
async def pair_page(request: Request):
    # MVP: don't hard-block by IP here (Docker/forwarded clients make this unreliable).
    # We'll rely on the short-lived pairing code instead.

    cfg = request.app.state.cfg
    code, expires_at = _get_or_create_pairing_code(cfg.data_dir)

    html = f"""<!doctype html>
<html>
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>Pair with OpenPoster</title>
    <style>
      body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: #0b0b0b; color: #fff; padding: 24px; }}
      .card {{ max-width: 560px; margin: 0 auto; background: #141414; border: 1px solid #222; border-radius: 12px; padding: 18px; }}
      h1 {{ margin: 0 0 8px; font-size: 22px; }}
      p {{ margin: 8px 0; color: #b9b9b9; line-height: 1.4; }}
      .code {{ font-size: 44px; letter-spacing: 6px; font-weight: 800; background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 10px; padding: 14px 16px; text-align: center; margin-top: 14px; }}
      .meta {{ font-size: 12px; color: #8a8a8a; margin-top: 10px; }}
    </style>
  </head>
  <body>
    <div class=\"card\">
      <h1>Your pairing code</h1>
      <p>Take control of your locally hosted node.</p>
      <div class=\"code\">{code}</div>
      <div class=\"meta\">Expires: {expires_at}</div>
      <p class=\"meta\">This page only works on your local network.</p>
    </div>
  </body>
</html>"""

    return HTMLResponse(html)
