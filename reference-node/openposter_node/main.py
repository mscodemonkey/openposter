import os

import uvicorn

from .app import app


def run() -> None:
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
