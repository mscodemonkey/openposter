# OpenPoster Reference Node (Docker-first)

This is a minimal FastAPI reference implementation of the OpenPoster v1 protocol.

## Run (Docker)

```bash
docker compose up --build
```

Then visit:
- `http://localhost:8080/.well-known/openposter-node`

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

- This reference node currently supports read-only protocol endpoints.
- Upload/admin endpoints will be added separately.
