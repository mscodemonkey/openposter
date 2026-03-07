#!/usr/bin/env python3
"""Create a seed.json row + place blobs for the OpenPoster reference node.

This is an MVP helper so you can stand up nodes with real data without DB spelunking.

Usage:
  python tools/make_seed.py \
    --data-dir ./data \
    --node-id opn_123 \
    --creator-id cr_marty \
    --creator-name "MartyDesigns" \
    --creator-home-node "http://localhost:8081" \
    --tmdb-id 603 \
    --media-type movie \
    --title "The Matrix" \
    --year 1999 \
    --preview ./examples/matrix_preview.jpg \
    --full ./examples/matrix_full.jpg \
    --redistribution mirrors-approved \
    --license all-rights-reserved

Notes:
- This writes blobs to: <data-dir>/blobs/sha256/<hashhex>
- It appends a poster row to: <data-dir>/seed.json
- For now it assumes full_access=public (premium wiring comes later).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def sniff_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(str(path))
    if mime not in {"image/jpeg", "image/png"}:
        raise SystemExit(f"Unsupported image type for v1: {mime} (file {path})")
    return mime


def copy_into_blobstore(data_dir: Path, src: Path) -> tuple[str, int, str]:
    hexhash = sha256_file(src)
    sha = f"sha256:{hexhash}"
    dst = data_dir / "blobs" / "sha256" / hexhash
    dst.parent.mkdir(parents=True, exist_ok=True)
    data = src.read_bytes()
    dst.write_bytes(data)
    return sha, len(data), sniff_mime(src)


def load_seed(seed_path: Path) -> list[dict]:
    if not seed_path.exists():
        return []
    return json.loads(seed_path.read_text())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--node-id", required=True)

    ap.add_argument("--creator-id", required=True)
    ap.add_argument("--creator-name", required=True)
    ap.add_argument("--creator-home-node", required=True)

    ap.add_argument("--tmdb-id", type=int, required=True)
    ap.add_argument("--media-type", choices=["movie", "show", "season", "episode", "collection"], required=True)
    ap.add_argument("--title")
    ap.add_argument("--year", type=int)

    ap.add_argument("--preview", type=Path, required=True)
    ap.add_argument("--full", type=Path, required=True)

    ap.add_argument("--license", default="all-rights-reserved")
    ap.add_argument("--redistribution", choices=["public-cache-ok", "mirrors-approved", "none"], default="mirrors-approved")

    args = ap.parse_args()

    data_dir = Path(args.data_dir).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)

    preview_hash, preview_bytes, preview_mime = copy_into_blobstore(data_dir, args.preview)
    full_hash, full_bytes, full_mime = copy_into_blobstore(data_dir, args.full)

    local_id = f"pst_{hashlib.sha256((str(args.tmdb_id) + args.creator_id + full_hash).encode()).hexdigest()[:8]}"
    poster_id = f"op:v1:{args.node_id}:{local_id}"

    row = {
        "poster_id": poster_id,
        "media_type": args.media_type,
        "tmdb_id": args.tmdb_id,
        "title": args.title,
        "year": args.year,
        "creator_id": args.creator_id,
        "creator_display_name": args.creator_name,
        "creator_home_node": args.creator_home_node,
        "attribution_license": args.license,
        "attribution_redistribution": args.redistribution,
        "attribution_source_url": None,
        "preview_hash": preview_hash,
        "preview_bytes": preview_bytes,
        "preview_mime": preview_mime,
        "preview_width": None,
        "preview_height": None,
        "full_access": "public",
        "full_hash": full_hash,
        "full_bytes": full_bytes,
        "full_mime": full_mime,
        "full_width": None,
        "full_height": None,
        "enc_alg": None,
        "enc_key_id": None,
        "enc_nonce": None,
    }

    seed_path = data_dir / "seed.json"
    seed = load_seed(seed_path)
    seed.append(row)
    seed_path.write_text(json.dumps(seed, indent=2) + "\n")

    print("Wrote blobs:")
    print(f"  preview: {preview_hash}")
    print(f"  full:    {full_hash}")
    print("Appended seed row:")
    print(f"  {seed_path}")
    print("Poster ID:")
    print(f"  {poster_id}")


if __name__ == "__main__":
    main()
