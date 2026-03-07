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


def load_config() -> Config:
    data_dir = Path(os.environ.get("OPENPOSTER_DATA_DIR", "/data")).resolve()
    base_url = os.environ.get("OPENPOSTER_BASE_URL", "").rstrip("/")
    node_name = os.environ.get("OPENPOSTER_NODE_NAME", "OpenPoster Node")
    operator_name = os.environ.get("OPENPOSTER_OPERATOR_NAME", "Operator")
    operator_contact = os.environ.get("OPENPOSTER_OPERATOR_CONTACT")

    data_dir.mkdir(parents=True, exist_ok=True)

    return Config(
        data_dir=data_dir,
        base_url=base_url,
        node_name=node_name,
        operator_name=operator_name,
        operator_contact=operator_contact,
    )
