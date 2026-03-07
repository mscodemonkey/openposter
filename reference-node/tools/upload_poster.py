#!/usr/bin/env python3
"""Upload a poster to an OpenPoster node via the admin API.

This is a beta helper so creators/testers don't have to hand-craft curl commands.

Example:
  python tools/upload_poster.py \
    --base-url http://localhost:8081 \
    --admin-token dev-admin \
    --tmdb-id 2316 --media-type show \
    --title "The Office" --year 2005 \
    --creator-id cr_creator_a --creator-name "Creator A" \
    --preview ./preview.jpg --full ./full.png
"""

from __future__ import annotations

import argparse
from pathlib import Path

import httpx


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", required=True, help="Node base URL, e.g. https://posters.example.com")
    ap.add_argument("--admin-token", required=True, help="OPENPOSTER_ADMIN_TOKEN")

    ap.add_argument("--tmdb-id", type=int, required=True)
    ap.add_argument("--media-type", choices=["movie", "show", "season", "episode", "collection"], required=True)
    ap.add_argument("--title")
    ap.add_argument("--year", type=int)

    ap.add_argument("--creator-id", required=True)
    ap.add_argument("--creator-name", required=True)

    ap.add_argument("--license", default="all-rights-reserved")
    ap.add_argument("--redistribution", default="mirrors-approved", choices=["public-cache-ok", "mirrors-approved", "none"])

    ap.add_argument("--preview", type=Path, required=True)
    ap.add_argument("--full", type=Path, required=True)

    args = ap.parse_args()

    base = args.base_url.rstrip("/")

    files = {
        "preview": (args.preview.name, args.preview.read_bytes(), "image/jpeg" if args.preview.suffix.lower() in {".jpg", ".jpeg"} else "image/png"),
        "full": (args.full.name, args.full.read_bytes(), "image/jpeg" if args.full.suffix.lower() in {".jpg", ".jpeg"} else "image/png"),
    }

    data = {
        "tmdb_id": str(args.tmdb_id),
        "media_type": args.media_type,
        "title": args.title or "",
        "year": str(args.year) if args.year else "",
        "creator_id": args.creator_id,
        "creator_display_name": args.creator_name,
        "attribution_license": args.license,
        "attribution_redistribution": args.redistribution,
    }

    headers = {"authorization": f"Bearer {args.admin_token}"}

    with httpx.Client(timeout=30.0) as client:
        r = client.post(base + "/v1/admin/posters", data=data, files=files, headers=headers)
        r.raise_for_status()
        print(r.json())


if __name__ == "__main__":
    main()
