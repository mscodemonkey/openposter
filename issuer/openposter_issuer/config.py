import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Config:
    data_dir: Path
    base_url: str
    jwt_secret: str
    jwt_issuer: str
    jwt_exp_seconds: int


def load_config() -> Config:
    data_dir = Path(os.environ.get("OPENPOSTER_ISSUER_DATA_DIR", "/data")).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)

    base_url = os.environ.get("OPENPOSTER_ISSUER_BASE_URL", "").rstrip("/")
    jwt_secret = os.environ.get("OPENPOSTER_ISSUER_JWT_SECRET", "")
    jwt_issuer = os.environ.get("OPENPOSTER_ISSUER_JWT_ISSUER", "openposter-issuer")
    jwt_exp_seconds = int(os.environ.get("OPENPOSTER_ISSUER_JWT_EXP_SECONDS", "31536000"))

    if not jwt_secret:
        raise RuntimeError("OPENPOSTER_ISSUER_JWT_SECRET is required")

    return Config(
        data_dir=data_dir,
        base_url=base_url,
        jwt_secret=jwt_secret,
        jwt_issuer=jwt_issuer,
        jwt_exp_seconds=jwt_exp_seconds,
    )
