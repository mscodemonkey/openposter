# OpenPoster Reference Node (Docker-first)

This is a minimal FastAPI reference implementation of the OpenPoster v1 protocol.

## Run (Docker)

```bash
docker compose up --build
```

Then visit:
- `http://localhost:8080/.well-known/openposter-node`

## Run multiple local nodes (for federation/distribution testing)

```bash
docker compose -f compose.multi.yml up --build
```

This starts:
- Node A: http://localhost:8081
- Node B: http://localhost:8082
- Mirror (for Node A blobs): http://localhost:8083

The mirror currently shares Node A's blob directory to simulate distributed delivery.
A proper "mirror sync" flow will be added later.

## Seeding test data

The reference node can import `seed.json` on first run.

## Uploading posters (beta helper)

### Recommended: bootstrap admin sessions

The node now supports a "bootstrap claim" flow for admin access:
- Your node generates a bootstrap code on first run and stores it at: `/data/bootstrap_code.txt`
- You exchange that bootstrap code for a long-lived admin session token:
  - `POST /v1/admin/claim`
- You can revoke all admin sessions and rotate the bootstrap code:
  - `POST /v1/admin/sessions/revoke_all`
  - `POST /v1/admin/bootstrap/rotate`

The Web UI uses this during **Onboarding**.

### Legacy (dev/backwards compat): OPENPOSTER_ADMIN_TOKEN

If you set `OPENPOSTER_ADMIN_TOKEN`, you can still upload posters using the admin API.

A small helper script is included:

```bash
python tools/upload_poster.py \
  --base-url http://localhost:8081 \
  --admin-token dev-admin \
  --tmdb-id 2316 --media-type show \
  --title "The Office" --year 2005 \
  --creator-id cr_creator_a --creator-name "Creator A" \
  --preview ./path/to/preview.jpg \
  --full ./path/to/full.png
```

1) Place data under `reference-node/data-a/` (or `data/` for single-node).
2) Use the helper script to append seed rows and copy blobs into the blob store:

```bash
python tools/make_seed.py \
  --data-dir ./data-a \
  --node-id opn_local_a \
  --creator-id cr_creator_a \
  --creator-name "Creator A" \
  --creator-home-node "http://localhost:8081" \
  --tmdb-id 603 \
  --media-type movie \
  --title "The Matrix" \
  --year 1999 \
  --preview ./examples/matrix_preview.jpg \
  --full ./examples/matrix_full.jpg
```

Then start the node and query:
- `GET http://localhost:8081/v1/search?tmdb_id=603`

## Data

The container uses `/data` for persistence:
- `/data/db.sqlite`
- `/data/blobs/sha256/<hashhex>`
- `/data/keys/ed25519.key` (private) and `/data/keys/ed25519.pub` (public)

## Environment

- `OPENPOSTER_BASE_URL` (recommended): externally-reachable base URL of this node
- `OPENPOSTER_NODE_NAME` (optional)
- `OPENPOSTER_OPERATOR_NAME` (optional)
- `OPENPOSTER_OPERATOR_CONTACT` (optional, e.g. `mailto:`)

## Notes

- The reference node includes minimal admin/upload endpoints for beta testing.
- Stable node identity: `GET /v1/node` exposes a UUID `node_id` (persisted to `/data/node_uuid.txt`).
