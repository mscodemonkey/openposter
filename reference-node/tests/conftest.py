from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from openposter_node.app import app


ADMIN_TOKEN = "test-admin-token"
PNG_1X1 = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    b"\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDATx\x9cc`\xf8\xcf\xc0\xf0\x1f\x00\x05\x00\x01\xff"
    b"\x89\x99=\x1d"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("OPENPOSTER_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("OPENPOSTER_ADMIN_TOKEN", ADMIN_TOKEN)
    monkeypatch.setenv("OPENPOSTER_BASE_URL", "http://testserver")
    monkeypatch.delenv("OPENPOSTER_ANNOUNCE_TO", raising=False)
    monkeypatch.delenv("OPENPOSTER_ANNOUNCE_URL", raising=False)
    monkeypatch.delenv("OPENPOSTER_OFFICIAL_DIRECTORY_URL", raising=False)
    monkeypatch.delenv("OPENPOSTER_BOOTSTRAP_SEEDS", raising=False)

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def admin_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {ADMIN_TOKEN}",
    }
