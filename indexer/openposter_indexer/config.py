import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Config:
    data_dir: Path
    official_directory_url: str | None
    seed_nodes: list[str]
    poll_seconds: int


def load_config() -> Config:
    data_dir = Path(os.environ.get("OPENPOSTER_INDEXER_DATA_DIR", "/data")).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)

    official_directory_raw = os.environ.get("OPENPOSTER_OFFICIAL_DIRECTORY_URL", "").strip().rstrip("/")
    official_directory_url = official_directory_raw or None

    seeds_raw = os.environ.get("OPENPOSTER_INDEXER_SEEDS", "").strip()
    seed_nodes = [s.strip().rstrip("/") for s in seeds_raw.split(",") if s.strip()]
    if not seed_nodes and official_directory_url:
        seed_nodes = [official_directory_url]

    poll_seconds = int(os.environ.get("OPENPOSTER_INDEXER_POLL_SECONDS", "30"))

    return Config(
        data_dir=data_dir,
        official_directory_url=official_directory_url,
        seed_nodes=seed_nodes,
        poll_seconds=poll_seconds,
    )
