from __future__ import annotations

from typing import Any


def with_sources(asset: dict[str, Any], *, origin_url: str, mirrors: list[str]) -> dict[str, Any]:
    """Attach an approved sources[] list for an asset.

    In v1, mirror approval is represented by signed advertisement of mirror URLs.
    """

    sources = [{"url": origin_url, "role": "origin"}]
    for m in mirrors:
        sources.append({"url": m, "role": "mirror", "mirror_node": m.split("/v1/")[0] if "/v1/" in m else None})

    out = dict(asset)
    out["sources"] = [s for s in sources if s.get("url")]
    return out
