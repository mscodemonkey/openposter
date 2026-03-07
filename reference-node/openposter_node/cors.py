from __future__ import annotations

import os

from fastapi.middleware.cors import CORSMiddleware


def attach_cors(app) -> None:
    """Attach CORS middleware if OPENPOSTER_CORS_ORIGINS is set.

    This is intended for the beta web UI running in a browser.
    """

    raw = os.environ.get("OPENPOSTER_CORS_ORIGINS", "").strip()
    if not raw:
        return

    origins = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        max_age=600,
    )
