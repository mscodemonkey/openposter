# OpenPoster Web (beta)

This folder is the **beta Next.js UI** for OpenPoster.

## Run locally

```bash
npm install
npm run dev
```

Open: http://localhost:3000

## Config

Set the indexer URL (defaults to `http://localhost:8090`):

```bash
export NEXT_PUBLIC_INDEXER_BASE_URL=http://localhost:8090
```

Set the issuer URL (defaults to `http://localhost:8085`):

```bash
export NEXT_PUBLIC_ISSUER_BASE_URL=http://localhost:8085
```

## Dev stack (docker-compose)

When running the local dev stack, the default ports are:

- Reference node A: `http://localhost:8081`
- Reference node B: `http://localhost:8082`
- Mirror: `http://localhost:8083`
- Directory: `http://localhost:8084`
- Indexer: `http://localhost:8090`

Typical flow:

1) Start the stack (from repo root):
   - `docker compose -f reference-node/compose.multi.yml up -d --build`
2) Open the web UI:
   - http://localhost:3000
3) In the UI:
   - `/onboarding` → create/log in, claim creator handle, connect your node (bootstrap claim), attach/verify public URL
   - `/upload` → upload a poster

## Current pages

- `/` home (via indexer)
- `/browse` posters (with advanced search)
- `/onboarding` guided setup for creators (issuer + node claim + URL verification)
- `/settings` account + node admin session
- `/upload` upload poster to connected node
- `/library` list posters on connected node (+ delete, check indexer status)

Notes:
- `/connect` and `/register` now redirect to `/settings`.
- `/search` redirects to `/browse`.
