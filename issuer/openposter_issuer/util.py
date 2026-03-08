from __future__ import annotations

from urllib.parse import urlparse


def canonicalize_public_url(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return ""
    p = urlparse(u)
    scheme = (p.scheme or "").lower()
    host = (p.hostname or "").lower()
    port = p.port

    if scheme not in ("http", "https"):
        return ""
    if not host:
        return ""

    # Normalize default ports.
    if (scheme == "https" and (port is None or port == 443)) or (scheme == "http" and (port is None or port == 80)):
        netloc = host
    else:
        netloc = f"{host}:{port}"

    return f"{scheme}://{netloc}"
