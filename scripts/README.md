# Scripts

- `./scripts/factory-reset-nodes.sh`
  Completely factory-resets `directory`, `node-a`, `node-b`, and `indexer` by stopping the services, deleting their data directories, recreating them, and starting the containers again.

- `./scripts/e2e-isolated.sh`
  Starts a disposable local E2E stack on alternate ports with isolated Docker volumes, runs Playwright against it, and tears the stack down afterwards.
