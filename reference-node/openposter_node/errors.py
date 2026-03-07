from __future__ import annotations

from typing import Any

from fastapi import HTTPException


def http_error(
    status_code: int,
    code: str,
    message: str,
    *,
    details: dict[str, Any] | None = None,
    request_id: str | None = None,
) -> HTTPException:
    payload: dict[str, Any] = {"error": {"code": code, "message": message}}
    if request_id:
        payload["error"]["request_id"] = request_id
    if details is not None:
        payload["error"]["details"] = details
    return HTTPException(status_code=status_code, detail=payload)
