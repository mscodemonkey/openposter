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
2) Start the web UI:
   - `cd web && npm install && npm run dev`
3) In the UI:
   - `/connect` → set Node URL `http://localhost:8081` and admin token `dev-admin`
   - `/upload` → upload a poster
   - `/register` → directory `http://localhost:8084`

## Current pages

- `/` browse/search (via indexer)
- `/connect` store node URL + admin token (localStorage)
- `/upload` upload poster to connected node
- `/library` list posters on connected node (+ delete, check indexer status)
- `/register` register connected node with a directory
