from __future__ import annotations

import hashlib
from pathlib import Path

from fastapi.responses import FileResponse

from ..errors import http_error


def blob_path(data_dir: Path, sha256_hash: str) -> Path:
    # sha256_hash format: sha256:<hex>
    if not sha256_hash.startswith("sha256:"):
        raise http_error(400, "invalid_request", "hash must be sha256:<hex>")

    hex_part = sha256_hash.split(":", 1)[1]
    if len(hex_part) != 64 or any(c not in "0123456789abcdef" for c in hex_part.lower()):
        raise http_error(400, "invalid_request", "invalid sha256 hex")

    return data_dir / "blobs" / "sha256" / hex_part


def serve_blob(data_dir: Path, sha256_hash: str) -> FileResponse:
    path = blob_path(data_dir, sha256_hash)
    if not path.exists():
        raise http_error(404, "not_found", "blob not found")
    return FileResponse(path)


def verify_file_sha256(path: Path, sha256_hash: str) -> None:
    hex_part = sha256_hash.split(":", 1)[1]
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    if h.hexdigest() != hex_part:
        raise http_error(500, "blob_hash_mismatch", "stored blob does not match sha256")
