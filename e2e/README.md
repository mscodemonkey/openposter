# E2E tests

These tests use Playwright against the real local Docker stack.

Expected local services:

- `http://localhost:3000` web / Studio
- `http://localhost:3001` diagnostics
- `http://localhost:8081` node-a
- `http://localhost:8082` node-b
- `http://localhost:8085` issuer
- `http://localhost:8090` indexer

Run order:

1. `docker compose up -d --build`
2. `npm install`
3. `npx playwright install chromium`
4. `npm run e2e`

CI:

- GitHub Actions workflow: [`.github/workflows/e2e.yml`](/Users/martinjsteven/.openclaw/workspace-openposter/.github/workflows/e2e.yml)
- CI uses the repository secret `TMDB_READ_ACCESS_TOKEN` for full TMDB-backed coverage.
- If that secret is missing, the workflow now emits a clear notice and skips the TMDB-dependent Studio specs instead of failing noisily.
- CI also runs My Media coverage only when Plex bootstrap config is available, either via checked-in local fixture data or `OPENPOSTER_E2E_PLEX_*` environment variables.

Notes:

- Before the suite starts, it snapshots the local stateful data directories, initializes a clean test state, and restores your original data after the run finishes.
- If a prior run crashes before teardown, the next run restores that preserved state first before taking a fresh snapshot.
- The suite resets directory, node-a, node-b, indexer, and issuer before each test via the dev reset endpoints.
- Studio auth is bootstrapped through browser storage with the dev admin token.
- Issuer auth for My Media subscription flows is bootstrapped through browser localStorage with a fresh test user created via the issuer signup API.
- The suite now covers:
  - Studio draft and publish behavior
  - ZIP import for shows and collections
  - indexer publish propagation and multi-node discovery
  - reciprocal node-a / node-b discovery
  - My Media apply flows for posters, backdrops, squares, logos, and episode cards
  - creator subscription
  - auto-update enabled and disabled behavior
  - node-b-first consumer flow through `http://localhost:3002`
  - diagnostics app smoke load
