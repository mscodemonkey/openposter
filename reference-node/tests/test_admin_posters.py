from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import PNG_1X1


def upload_poster(
    client: TestClient,
    admin_headers: dict[str, str],
    *,
    tmdb_id: int = 675,
    media_type: str = "collection",
    kind: str = "poster",
    title: str = "Dr. No Collection",
    published: bool = True,
    creator_id: str = "mart",
    creator_display_name: str = "Mart",
    preview_bytes: bytes | None = None,
    full_bytes: bytes | None = None,
) -> dict:
    preview_payload = preview_bytes or PNG_1X1
    full_payload = full_bytes or PNG_1X1
    response = client.post(
        "/v1/admin/posters",
        headers=admin_headers,
        data={
            "tmdb_id": str(tmdb_id),
            "media_type": media_type,
            "kind": kind,
            "title": title,
            "creator_id": creator_id,
            "creator_display_name": creator_display_name,
            "published": str(published).lower(),
        },
        files={
            "preview": ("preview.png", preview_payload, "image/png"),
            "full": ("full.png", full_payload, "image/png"),
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def list_draft_inclusive_posters(client: TestClient, admin_headers: dict[str, str]) -> list[dict]:
    response = client.get(
        "/v1/posters",
        headers=admin_headers,
        params={"include_drafts": "true"},
    )
    assert response.status_code == 200, response.text
    return response.json()["results"]


def test_reupload_same_slot_preserves_stored_title_while_updating_published(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    first = upload_poster(
        client,
        admin_headers,
        title="Original Collection Name",
        published=True,
    )

    second = upload_poster(
        client,
        admin_headers,
        title="Replacement Zip Name",
        published=False,
    )

    assert second["poster_id"] == first["poster_id"]

    posters = list_draft_inclusive_posters(client, admin_headers)
    assert len(posters) == 1
    assert posters[0]["media"]["title"] == "Original Collection Name"
    assert posters[0]["published"] is False


def test_background_kind_uses_a_distinct_slot_from_poster(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    poster = upload_poster(
        client,
        admin_headers,
        tmdb_id=240,
        media_type="collection",
        kind="poster",
        title="Collection Poster",
    )
    background = upload_poster(
        client,
        admin_headers,
        tmdb_id=240,
        media_type="collection",
        kind="background",
        title="Collection Backdrop",
    )

    assert poster["poster_id"] != background["poster_id"]

    posters = list_draft_inclusive_posters(client, admin_headers)
    assert {row["kind"] for row in posters} == {"poster", "background"}
    assert {row["media"]["title"] for row in posters} == {
        "Collection Poster",
        "Collection Backdrop",
    }


def test_reupload_after_soft_delete_resurrects_same_poster_id(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    initial = upload_poster(
        client,
        admin_headers,
        tmdb_id=638,
        media_type="movie",
        kind="poster",
        title="Live and Let Die",
        full_bytes=PNG_1X1 + b"movie-artwork",
    )

    delete_response = client.delete(
        f"/v1/admin/posters/{initial['poster_id']}",
        headers=admin_headers,
    )
    assert delete_response.status_code == 200, delete_response.text

    resurrected = upload_poster(
        client,
        admin_headers,
        tmdb_id=638,
        media_type="movie",
        kind="poster",
        title="Live and Let Die Restored",
        full_bytes=PNG_1X1 + b"movie-artwork",
    )

    assert resurrected["poster_id"] == initial["poster_id"]

    posters = list_draft_inclusive_posters(client, admin_headers)
    assert len(posters) == 1
    assert posters[0]["poster_id"] == initial["poster_id"]
    assert posters[0]["media"]["title"] == "Live and Let Die Restored"
