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

## Current pages

- `/` browse/search (via indexer)
- `/connect` store node URL + admin token (localStorage)
- `/upload` upload poster to connected node
- `/library` list posters on connected node (+ delete, check indexer status)
- `/register` register connected node with a directory
