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

## Resetting for testing

Two reset endpoints wipe all data. Both require `OPENPOSTER_DEV_RESET_TOKEN=dev-reset` (already set in `compose.multi.yml`).

```
# Wipe node A (posters, themes, settings, blobs, seed.json)
curl http://localhost:8081/dev/reset?token=dev-reset

# Wipe issuer (users, handles, nodes, url claims)
curl http://localhost:8085/dev/reset?token=dev-reset
```

After both resets, restart so node starts clean:
```bash
cd reference-node
docker compose -f compose.multi.yml restart node_a issuer
```

Then go to `/onboarding` to re-register. Clear the browser localStorage first (or use the Log Out button on the onboarding page). Note: the `data-a/seed.json` file auto-populates sample data on startup if present — the reset deletes it.

## Web UI stack

- **Next.js 16**, React 19, TypeScript
- **MUI Material v7** (`@mui/material`) — NOT MUI Joy
- Emotion for styling, next-intl for i18n (single "en" locale at `web/messages/en.json`)
- `web/src/app/` — Next.js App Router pages
- `web/src/components/` — shared components
- `web/src/lib/` — config, types, utilities
- `NEXT_PUBLIC_INDEXER_BASE_URL` and `NEXT_PUBLIC_ISSUER_BASE_URL` are the two key env vars

Key pages:
- `/browse` — main poster grid with filters
- `/movie/[collectionTmdbId]/boxset` — movie box set view
- `/tv/[showTmdbId]/boxset` — TV show box set view
- `/onboarding` — first-run setup flow (see Onboarding section)
- `/p/[posterId]` — individual poster page
- `/creators` — creator listing
- `/creator/[creatorId]` — public creator page (backdrop hero, themes section, poster grid)
- `/creator/[creatorId]/themes/[themeId]` — public theme detail page
- `/library` — user library (subscribed themes "Following" section)
- `/my-media` — media server integration; browse Plex/Jellyfin library with A–Z rail and missing-thumb detection
- `/studio` — creator Studio workspace
- `/studio/upload` — multi-step poster upload form (legacy; UploadDrawer is preferred in Studio)
- `/settings` — node connection, media servers, artwork settings

Key shared components:
- `PosterCard` — standard poster card (image + type chip + title strip); key props: `poster`, `actions`, `aspectRatio` (default "2/3", use "16/9" for episodes), `chip` (override/suppress type chip), `onClick`, `imageFailed`, `onImageError`
- `CollectionCard` — mosaic/single-image card for movie collections; from `SectionedPosterView`
- `TVShowCard` — mosaic/single-image card for TV shows; from `SectionedPosterView`

## Creator identity & connection

**Creator ID** is the claimed handle (e.g. `mscodemonkey`), established during onboarding and stored in `CreatorConnection.creatorId` in localStorage. It is **never** derived from the first poster — it comes from the issuer.

`CreatorConnection` (in `web/src/lib/storage.ts`):
```ts
{ nodeUrl: string; adminToken: string; creatorId: string }
```
- `nodeUrl` → localStorage
- `adminToken` → sessionStorage (higher security)
- `creatorId` → localStorage

Use `loadCreatorConnection()` / `saveCreatorConnection()` / `clearCreatorConnection()`.

## Onboarding flow (`/onboarding`)

Steps: welcome → account → creator → claim → public_url → done

1. **Account** — login or signup via issuer (`/v1/auth/login`, `/v1/auth/signup`)
2. **Creator** — claim handle via `/v1/creator/claim_handle` (idempotent — safe to retry). Re-fetches `/v1/me` to persist handle in session
3. **Claim** — pair with local node using pairing code (`POST /admin/pair`), then register node with issuer (`POST /v1/nodes/claim`). Saves `CreatorConnection` with `creatorId` from issuer handle
4. **Public URL** — domain verification. Calls `issuerStartUrlClaim` → gets challenge token → pushes token to node (`PUT /v1/admin/claim-token`) so node serves `/.well-known/openposter-claim.txt` → calls `issuerVerifyUrlClaim`

Hydration note: all localStorage reads happen in a `useEffect` (not `useState` initializers) to avoid SSR/client mismatch.

## Reference node (Python)

- Located at `reference-node/openposter_node/`
- Python with `uv` for dependency management
- Data: SQLite at `/data/db.sqlite`, blobs at `/data/blobs/sha256/<hex>`, keys at `/data/keys/`
- Key env vars: `OPENPOSTER_BASE_URL`, `OPENPOSTER_NODE_NAME`, `OPENPOSTER_ADMIN_TOKEN`, `OPENPOSTER_CORS_ORIGINS`, `OPENPOSTER_DEV_RESET_TOKEN`
- Admin auth: `Authorization: Bearer <token>` header; `x-creator-id` header for creator-scoped endpoints
- Node has stable UUID identity stored in `/data/node_uuid.txt`

Special endpoints:
- `GET /dev/reset?token=<token>` — wipes DB + blobs + seed.json (dev only, requires env var)
- `GET /.well-known/openposter-claim.txt` — serves challenge token for domain verification (set via `PUT /v1/admin/claim-token`)
- `PUT /v1/admin/claim-token` — stores domain verification challenge in memory

Poster upload (`POST /v1/admin/posters`) is multipart form with **all text fields before file fields** — python-multipart silently drops text fields that appear after file parts.

Seed data: on startup, if `/data/seed.json` exists and the posters table is empty, the node auto-populates sample data. The dev reset deletes this file.

## Indexer (Python)

- Located at `indexer/openposter_indexer/`
- Crawls nodes via `/v1/changes`, stores in SQLite
- API: `/v1/search`, `/v1/recent`, `/v1/creators`, `/v1/by_creator`, `/v1/stats`, `/v1/facets`, `/v1/posters/{poster_id}`, `/v1/tv_boxset/{show_tmdb_id}`
- Seeds from `OPENPOSTER_INDEXER_SEEDS` (comma-separated node URLs)

## Issuer (Python/FastAPI)

- Located at `issuer/openposter_issuer/`
- Identity + node registry for the network
- `GET /v1/me` — returns `{ user_id, email, display_name, handle: string|null }` (handle included after claiming)
- `POST /v1/creator/claim_handle` — idempotent: if you already own the handle, succeeds silently
- `POST /v1/url_claims/start` — generates DNS/HTTP challenge for domain verification
- `POST /v1/url_claims/verify` — checks DNS TXT or `/.well-known/openposter-claim.txt`
- `GET /dev/reset?token=<token>` — wipes all issuer DB tables (dev only)

## Protocol summary (v1)

Core node endpoints:
- `GET /.well-known/openposter-node` — node descriptor (id, keys, features, trusted_issuers)
- `GET /v1/search` — search by tmdb_id, imdb_id, q, type, kind, orientation, text
- `GET /v1/posters/{poster_id}` — full poster record with signature
- `GET /v1/blobs/{hash}` — immutable blob by SHA-256 (`sha256:<hex>`)
- `GET /v1/changes` — incremental change feed for indexers
- `GET /v1/nodes` — node gossip/discovery list

Blobs are content-addressed (SHA-256). Metadata is signed (Ed25519 / JCS). Premium blobs are encrypted (AES-256-GCM), keys delivered via issuer JWT.

## Development conventions

- Web components use **MUI Material** imports from `@mui/material/*` (named imports per component)
- Pages are "use client" when they need state/effects
- **Never read localStorage in `useState` initializers** — use `useEffect` to hydrate after mount, otherwise SSR/client hydration mismatches occur
- The `PosterCard` component is the standard unit for poster display — reuse it rather than duplicating card markup
- `CollectionCard` and `TVShowCard` (from `SectionedPosterView`) are the canonical cards for collections/shows everywhere — never recreate markup
- Box set / grouped views use MUI `Grid` + `Accordion` for season groupings
- TMDB lookups go through local proxy routes under `web/src/app/api/tmdb/` (never call TMDB directly from client)
- Sub-components that hold local state (image error, menu open, etc.) must be defined **outside** parent components — otherwise every parent re-render causes remount, resetting that state
- Keep protocol surface area minimal; the spec is DRAFT but changes need justification

## Studio

The Studio (`/studio`) is a creator workspace built in `web/src/app/studio/StudioWorkspace.tsx`.

**Navigation state**: `{ view: "root" }` | `{ view: "theme"; themeId }` | `{ view: "list"; listType: "collections"|"movies"|"tv"; themeId }` | `{ view: "media"; mediaKey }`

**Sidebar**: Three pinned lists — Collections, Movies, TV Shows — persisted to node via `saveSetting` with keys `studio_pinned_collections`, `studio_pinned_movies`, `studio_pinned_tv_shows`. Items also auto-migrated from existing poster data on load. Creator ID comes from `conn.creatorId` (never derived from posters).

**List views** (upgraded to rich tables):
- Collections table: status icon | Collection | Movies count | Movie Posters | Collection ✓ | Backdrop ✓ | Square ✓ | Logo ✓
- Movies table: status icon | Movie | Poster ✓ | Backdrop ✓ | Square ✓ | Logo ✓
- TV Shows table: status | Show | Seasons (TMDB) | Season Posters | Episode Cards | Show Poster ✓ | Backdrop ✓ | Square ✓ | Logo ✓

**Detail views**:
- `CollectionDetailView` — poster grid for a collection; `PlaceholderCard` for missing artwork
- `TvShowDetailView` — season accordion with episode cards; same `PlaceholderCard` pattern
- `MovieDetailView` — poster slot and backdrop slot; `PlaceholderCard` when no uploads yet

**PlaceholderCard pattern**: `border: "1px dashed"`, grayscale TMDB image at 0.3 opacity, red MISSING chip top-left, small upload `IconButton` top-right, title strip below. Always reuse this pattern.

**ZIP import** (`ZipImportDialog`): Parses ZIP natively (no npm dep) using browser `DecompressionStream`. Matches filenames to context (collection/show). All text form fields are appended **before** file fields in `uploadItem` — critical for python-multipart compatibility.

**Upload Drawer** (`UploadDrawer`): Side panel for individual poster uploads; pre-fills from context. Uses `conn.creatorId` directly.

## My Media

`/my-media` (`web/src/app/my-media/MyMediaContent.tsx`) shows the user's media server library (Plex/Jellyfin).

**Navigation**: Sidebar with Collections / Movies / TV Shows. Drill-down: collection → movies; show → seasons; season → episodes (16:9 aspect). A–Z rail on right edge.

**Missing thumbnails**: If a media server thumbnail 404s, `onImageError` sets the item ID in `failedThumbs: Set<string>`. Cards then show: grey placeholder, MISSING chip, and a `⋮` "Retry download" menu.

**Critical pattern**: `LetterGroup`, `BackButton`, and `CardRetryMenu` are defined **outside** `MyMediaContent`. If inside, every `setFailedThumbs` call creates a new component type → React unmounts/remounts → endless flash loop.

**Mosaic cards**: `CollectionCard` receives `coverUrls: []` and `TVShowCard` receives `coverPreviews: []` when `failedThumbs.has(id)` — prevents `MosaicBox` rendering any `<img>` elements.

## Git

- Always commit as the configured git user (mscodemonkey) — do NOT add `Co-Authored-By: Claude` lines

## Notes

- Project is early-stage / beta; protocol marked DRAFT
- Local dev environment only — no production deployment yet

---

## Production Readiness Checklist

### 🔐 Security
- [ ] Remove hardcoded dev secrets from `compose.multi.yml` (`dev-jwt-secret-change-me`, `dev-admin`) — replace with env file or secrets service
- [ ] Move admin token out of browser localStorage → secure HTTP-only cookie / server-side session
- [ ] Add rate limiting to admin endpoints, search, and key unwrap (FastAPI middleware + in-memory or Redis)
- [ ] Enforce HTTPS in production — redirect HTTP, reject non-HTTPS node registrations outside localhost
- [ ] Rotate bootstrap code on first claim; don't persist plaintext in `/data/bootstrap_code.txt` after use
- [ ] Strengthen JWT: add `aud` + `iss` claim validation; consider RS256 with public JWKS endpoint
- [ ] Add CSRF protection to onboarding and upload forms
- [ ] Increase minimum password to 12 chars or enforce passphrase rules

### 🪵 Logging & Observability
- [ ] Add structured logging (Python `logging` module, JSON output) to reference-node, issuer, and indexer
- [ ] Log auth events: failed logins, admin token use, pairing attempts
- [ ] Add request IDs / correlation IDs across services
- [ ] Add Prometheus metrics endpoint (`/metrics`) to each service
- [ ] Add a `/v1/health` that checks DB connectivity, not just returns `{"ok": true}`

### 🧪 Testing
- [ ] Write integration tests for federation protocol (node → indexer crawl cycle)
- [ ] Write auth flow tests (signup → claim handle → claim node → attach URL → upload poster)
- [ ] Write signature verification tests (valid / tampered / expired)
- [ ] Add CI pipeline (GitHub Actions) to run tests on every push
- [ ] Add web UI smoke tests (Playwright or similar)

### 🗃️ Database & Migrations
- [ ] Replace pragma-based column-addition migration with Alembic (reference-node and issuer)
- [ ] Add DB backup guidance / tooling for self-hosters
- [ ] Add indexer deletion tracking — honour `deleted_at` from node changes feed

### 🚀 Deployment
- [ ] Create a `compose.prod.yml` (no source mounts, production env vars, restart policies, no dev ports exposed)
- [ ] Write deployment docs: DNS setup, reverse proxy (Caddy/nginx), TLS, env var reference
- [ ] Add healthcheck dependencies in compose so services wait for each other properly
- [ ] Publish Docker images to a registry (ghcr.io/openposter/*)

### 🌐 Web UI
- [ ] TMDB ID lookup / autocomplete on the upload form (search by title → fill tmdb_id)
- [ ] Image preview and basic validation before upload (dimensions, file size, MIME type)
- [ ] Upload progress indicator
- [ ] Creator dashboard / library page (list, edit, delete own posters)
- [ ] Bulk upload support
- [ ] Proper error messages from backend surfaced cleanly in the upload UI

### 📡 Protocol
- [ ] Implement `POST /v1/keys/{key_id}:unwrap` on reference-node (premium blob key delivery)
- [ ] Implement creator-signed mirror grants (automated mirror approval flow)
- [ ] Finalise and version the spec (remove DRAFT status once core flows are stable)
- [ ] Add `imdb_id` search support end-to-end (spec lists it; verify indexer + node both support it)

### 🔍 Search & Discovery
- [ ] Add full-text search index to indexer (SQLite FTS5 on title / creator)
- [ ] Genre / tag faceting (indexer `/v1/facets` returns genres once nodes publish them)
- [ ] Homepage "recent" and "stats" sections wired up
- [ ] Creator profile pages show bio / links if node publishes them
