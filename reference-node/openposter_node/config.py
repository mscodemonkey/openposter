import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Config:
    data_dir: Path
    base_url: str
    node_name: str
    operator_name: str
    operator_contact: str | None
    mirrors: list[str]
    announce_to: str | None   # directory base URL to POST registration to
    announce_url: str | None  # URL to register as (defaults to base_url)


def load_config() -> Config:
    data_dir = Path(os.environ.get("OPENPOSTER_DATA_DIR", "/data")).resolve()
    base_url = os.environ.get("OPENPOSTER_BASE_URL", "").rstrip("/")
    node_name = os.environ.get("OPENPOSTER_NODE_NAME", "OpenPoster Node")
    operator_name = os.environ.get("OPENPOSTER_OPERATOR_NAME", "Operator")
    operator_contact = os.environ.get("OPENPOSTER_OPERATOR_CONTACT")

    mirrors_raw = os.environ.get("OPENPOSTER_MIRRORS", "").strip()
    mirrors = [m.strip().rstrip("/") for m in mirrors_raw.split(",") if m.strip()]

    announce_to_raw = os.environ.get("OPENPOSTER_ANNOUNCE_TO", "").strip().rstrip("/")
    announce_to = announce_to_raw or None
    announce_url_raw = os.environ.get("OPENPOSTER_ANNOUNCE_URL", "").strip().rstrip("/")
    announce_url = announce_url_raw or None

    data_dir.mkdir(parents=True, exist_ok=True)

    return Config(
        data_dir=data_dir,
        base_url=base_url,
        node_name=node_name,
        operator_name=operator_name,
        operator_contact=operator_contact,
        mirrors=mirrors,
        announce_to=announce_to,
        announce_url=announce_url,
    )
