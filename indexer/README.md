# OpenPoster Indexer (MVP)

This service crawls OpenPoster nodes and maintains a local SQLite index for browsing/search.

## What it does

- Discovers nodes from configured seed nodes and their `/v1/nodes` lists
- Crawls each node’s `/v1/changes?since=...`
- Fetches poster entries from `/v1/posters/{poster_id}`
- Verifies poster signatures using the node descriptor `/.well-known/openposter-node`
- Stores verified poster JSON in SQLite (`IndexedPoster`)

## Endpoints

All endpoints are under the `/v1` prefix.

### Health
- `GET /v1/health` → `{ ok: true }`

### Search + browse
- `GET /v1/recent?limit=&cursor=&media_type=&creator_id=`
  - Returns recently changed posters (cursor pagination)

- `GET /v1/search?limit=&cursor=&tmdb_id=&type=&q=&creator_id=`
  - Search indexed posters (cursor pagination)
  - `q` is a case-insensitive substring match on title (MVP)

### Creators
- `GET /v1/creators?limit=&q=`
  - Lists creators with counts + last_changed_at

- `GET /v1/by_creator?creator_id=&limit=&cursor=`
  - Lists posters for a creator (cursor pagination)

### Facets / aggregates
- `GET /v1/facets` → media type counts + top creators
- `GET /v1/stats` → `{ posters, nodes: { total, up } }`

### Poster fetch
- `GET /v1/posters/{poster_id}`
  - Fetches the stored JSON for a single indexed poster
  - Returns 404 if not found

### Node status
- `GET /v1/nodes`
  - Indexer’s view of node up/down health + last crawled timestamps

## Cursor format

Cursor values are opaque base64-encoded JSON payloads used for stable pagination.

## Notes

- The indexer normalizes `changed_at` to RFC3339 `...Z` for stable ordering.
- SQLite migrations are performed on startup (MVP/dev convenience).
