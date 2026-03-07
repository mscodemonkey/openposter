from __future__ import annotations

import base64
from typing import Any

import nacl.signing
import rfc8785


def _b64decode_prefixed(s: str) -> bytes:
    if s.startswith("base64:"):
        s = s.split(":", 1)[1]
    return base64.b64decode(s)


def verify_poster_signature(poster: dict[str, Any], *, public_key_b64: str) -> bool:
    sig_obj = poster.get("signature")
    if not isinstance(sig_obj, dict):
        return False

    if sig_obj.get("alg") != "ed25519" or not sig_obj.get("jcs"):
        return False

    sig_b64 = sig_obj.get("sig")
    if not isinstance(sig_b64, str):
        return False

    unsigned = dict(poster)
    unsigned.pop("signature", None)

    payload = rfc8785.dumps(unsigned)

    vk = nacl.signing.VerifyKey(_b64decode_prefixed(public_key_b64))
    try:
        vk.verify(payload, _b64decode_prefixed(sig_b64))
        return True
    except Exception:
        return False
