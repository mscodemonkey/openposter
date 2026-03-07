from __future__ import annotations

import base64
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import nacl.signing
import rfc8785


@dataclass(frozen=True)
class SigningKeyInfo:
    key_id: str
    alg: str
    public_key_b64: str


def ensure_ed25519_keypair(keys_dir: Path) -> tuple[nacl.signing.SigningKey, SigningKeyInfo]:
    keys_dir.mkdir(parents=True, exist_ok=True)

    priv_path = keys_dir / "ed25519.key"
    pub_path = keys_dir / "ed25519.pub"

    if priv_path.exists():
        sk = nacl.signing.SigningKey(priv_path.read_bytes())
    else:
        sk = nacl.signing.SigningKey.generate()
        priv_path.write_bytes(bytes(sk))

    vk = sk.verify_key
    pub_bytes = bytes(vk)
    pub_path.write_bytes(pub_bytes)

    info = SigningKeyInfo(
        key_id="key_ed25519_1",
        alg="ed25519",
        public_key_b64="base64:" + base64.b64encode(pub_bytes).decode("ascii"),
    )
    return sk, info


def jcs_canonical_bytes(obj: Any) -> bytes:
    # RFC 8785 canonical JSON bytes
    return rfc8785.dumps(obj)


def sign_poster_entry(signing_key: nacl.signing.SigningKey, entry: dict[str, Any], *, key_id: str) -> dict[str, Any]:
    unsigned = dict(entry)
    unsigned.pop("signature", None)

    payload = jcs_canonical_bytes(unsigned)
    sig = signing_key.sign(payload).signature

    signed = dict(unsigned)
    signed["signature"] = {
        "alg": "ed25519",
        "key_id": key_id,
        "jcs": True,
        "sig": "base64:" + base64.b64encode(sig).decode("ascii"),
    }
    return signed
