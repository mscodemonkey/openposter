# OpenPoster — CLAUDE.md

## What this is
OpenPoster is a **federated poster network** for self-hosters. Posters (artwork for Plex/Jellyfin/Emby) are published on independently-run nodes; clients discover and search across them. The repo is Apache-2.0, domain is **openposter.art**.

## Repo layout

| Path | What it is |
|---|---|
| `reference-node/` | Python/FastAPI poster node (the "server" that stores/serves posters) |
| `indexer/` | Python crawler/search index across multiple nodes |
| `issuer/` | Python/FastAPI identity + node registry service |
| `web/` | Next.js 16 web UI |
| `openposter-spec-v1.md` | Protocol spec (DRAFT) |

## Running locally (Docker)

Full multi-service stack (recommended):
```bash
cd reference-node
docker compose -f compose.multi.yml up --build
```

Services once running:
- Web UI: http://localhost:3000
- Issuer: http://localhost:8085
- Node A: http://localhost:8081
- Node B: http://localhost:8082
- Mirror (for A): http://localhost:8083
- Directory: http://localhost:8084
- Indexer: http://localhost:8090

Persistent data is in `reference-node/data-*/` directories (SQLite + blob files).

## Web UI stack

- **Next.js 16**, React 19, TypeScript
- **MUI Material v7** (`@mui/material`) — this is the component library in use. NOT MUI Joy.
- Emotion for styling
- `web/src/app/` — Next.js App Router pages
- `web/src/components/` — shared components (PosterCard, CreatorPicker, RelatedArtworkSection)
- `web/src/lib/` — config, types, utilities
- `NEXT_PUBLIC_INDEXER_BASE_URL` and `NEXT_PUBLIC_ISSUER_BASE_URL` are the two key env vars

Key pages:
- `/browse` — main poster grid with filters
- `/movie/[collectionTmdbId]/boxset` — movie box set view
- `/tv/[showTmdbId]/boxset` — TV show box set view
- `/onboarding` — first-run setup flow
- `/p/[posterId]` — individual poster page
- `/creators` — creator listing

Key shared components:
- `PosterCard` — standard poster card (image + title + creator + actions); props: `poster`, `primaryActionLabel`, `primaryActionHref`, `showPosterLink`

## Reference node (Python)

- Located at `reference-node/openposter_node/`
- Python with `uv` for dependency management (`pyproject.toml`)
- Data stored in `/data/` (SQLite at `db.sqlite`, blobs at `blobs/sha256/<hex>`, signing keys at `keys/`)
- Key env vars: `OPENPOSTER_BASE_URL`, `OPENPOSTER_NODE_NAME`, `OPENPOSTER_OPERATOR_NAME`, `OPENPOSTER_ADMIN_TOKEN`, `OPENPOSTER_CORS_ORIGINS`
- Admin: legacy `OPENPOSTER_ADMIN_TOKEN` works; bootstrap-claim flow is the intended approach
- Node has stable UUID identity (`node_uuid`) stored in `/data/node_uuid.txt`

## Indexer (Python)

- Located at `indexer/openposter_indexer/`
- Crawls nodes via `/v1/changes`, stores in SQLite
- API: `/v1/search`, `/v1/recent`, `/v1/creators`, `/v1/by_creator`, `/v1/stats`, `/v1/facets`, `/v1/posters/{poster_id}`, `/v1/tv_boxset/{show_tmdb_id}`
- Seeds from `OPENPOSTER_INDEXER_SEEDS` (comma-separated node URLs)

## Issuer (Python/FastAPI)

- Located at `issuer/openposter_issuer/`
- Identity + node registry for the network
- Auth: `/v1/auth/signup`, `/v1/auth/login`, `/v1/me`
- Creator handles: `/v1/creator/availability`, `/v1/creator/claim_handle`
- Nodes: `/v1/nodes/claim`, `/v1/nodes/attach_url`, `/v1/nodes`, `/v1/nodes/by_url`
- Public URL verification required for non-localhost nodes (DNS TXT or HTTP well-known)

## Protocol summary (v1)

Core node endpoints:
- `GET /.well-known/openposter-node` — node descriptor (id, keys, features, trusted_issuers)
- `GET /v1/search` — search by tmdb_id, imdb_id, q, type, kind, orientation, text
- `GET /v1/posters/{poster_id}` — full poster record with signature
- `GET /v1/blobs/{hash}` — immutable blob by SHA-256 (`sha256:<hex>`)
- `GET /v1/changes` — incremental change feed for indexers
- `GET /v1/nodes` — node gossip/discovery list
- `POST /v1/keys/{key_id}:unwrap` — premium key delivery (JWT auth required)

Blobs are content-addressed (SHA-256). Metadata is signed (Ed25519 / JCS). Premium blobs are encrypted (AES-256-GCM), keys delivered via issuer JWT.

## Development conventions

- Web components use **MUI Material** imports from `@mui/material/*` (named imports per component)
- Pages are "use client" when they need state/effects
- The `PosterCard` component is the standard unit for poster display — reuse it rather than duplicating card markup
- Box set / grouped views use MUI `Grid` + `Accordion` for season groupings
- Keep protocol surface area minimal; the spec is DRAFT but changes need justification

## Git

- Always commit as the configured git user (mscodemonkey) — do NOT add `Co-Authored-By: Claude` lines

## Notes

- Project is early-stage / beta; protocol marked DRAFT
- This is a local dev environment — no production deployment yet
- The `MEMORY.md` file has running notes on build status
