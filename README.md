# OpenPoster

[![E2E](https://github.com/mscodemonkey/openposter/actions/workflows/e2e.yml/badge.svg)](https://github.com/mscodemonkey/openposter/actions/workflows/e2e.yml)
[![Last Commit](https://img.shields.io/github/last-commit/mscodemonkey/openposter/main)](https://github.com/mscodemonkey/openposter/commits/main)
[![Repo Size](https://img.shields.io/github/repo-size/mscodemonkey/openposter)](https://github.com/mscodemonkey/openposter)

OpenPoster is a **federated poster network** for self-hosters.

If you’ve ever relied on a single central poster site (thePosterDB-style) you’ve seen the pattern:
- one operator pays the hosting and bandwidth bills
- one API becomes a bottleneck
- creators depend on a single service staying online forever

OpenPoster flips that model.

Instead of one big website, OpenPoster is a **protocol + ecosystem** where:
- **creators self-host** their own poster libraries (nodes)
- **clients** (Plex/Jellyfin/Emby tools) can search across many nodes
- premium content can exist **without central hosting** via **encrypted distribution**

The long-term goal is boring in the best way: posters become **infrastructure**, not a single site.

---

## What this repo contains

- **Protocol draft:** [`openposter-spec-v1.md`](./openposter-spec-v1.md)
- **Reference implementation (Docker-first):** [`reference-node/`](./reference-node)

---

## Design principles

### 1) Federation by default
Anyone can run a node. No single node has to be “the database”.

### 2) Content-addressed blobs
Poster images are served as immutable blobs addressed by **SHA-256** (`sha256:<hex>`). This enables:
- caching and mirroring
- integrity checking
- deduplication

### 3) Authentic metadata (signed)
Poster metadata is **signed** (Ed25519 over canonical JSON) so that:
- mirrors/indexers can relay results
- clients can verify “this poster entry really came from that creator node”

### 4) Premium-ready without central hosting
Premium/full-res artwork is designed to support **encrypted distribution**:
- anyone can mirror/cache the *encrypted* bytes
- entitled users obtain decryption keys via an issuer the creator node trusts

### 5) Hybrid identity/issuers
OpenPoster may run a convenient issuer, but it is **not required**.
Creator nodes can trust multiple issuers (including self-issued).

---

## Quick start: run a node (reference implementation)

For beta testing, you can run the reference node and (optionally) an indexer using Docker Compose.

### First-run checklist (friendly)

1) Run the stack (node + web + issuer)
- The easiest way to try OpenPoster is the multi-compose stack below.

2) Open the Web UI
- Go to: **http://localhost:3000**
- Click **Onboarding** in the top menu.

3) Create/log into your OpenPoster account (Issuer)
- The Issuer is the network registry for:
  - unique user emails
  - unique creator handles
  - node ownership + public URL attachment

4) Claim your node (local URL)
- You’ll open your node’s local pairing page (`/admin/pair`) and copy a 6-digit pairing code.
- This creates a long-lived node-admin session token (can be revoked/rotated).

5) Attach your public URL (with verification)
- For real public URLs, you must prove you control the domain using either:
  - DNS TXT record: `_openposter.<your-hostname>`
  - or an HTTP file at `/.well-known/openposter-claim.txt`

> Note: `OPENPOSTER_ADMIN_TOKEN` still exists for dev/backwards compatibility, but the intended flow is bootstrap-claim + admin sessions.

### Requirements
- Docker + Docker Compose

### Run

```bash
cd reference-node
docker compose up --build
```

### Multi-node + indexer + issuer + web (recommended for testing)

```bash
cd reference-node
docker compose -f compose.multi.yml up --build
```

Services:
- Web UI: http://localhost:3000
- Issuer: http://localhost:8085
- Node A: http://localhost:8081
- Node B: http://localhost:8082
- Mirror for A: http://localhost:8083
- Directory (bootstrap node list): http://localhost:8084
- Indexer: http://localhost:8090

Factory reset for a clean `directory` + `node-a` + `node-b` + `indexer` slate:

```bash
./scripts/factory-reset-nodes.sh
```

Then open:
- `http://localhost:8080/.well-known/openposter-node`

### Persistent data
The container stores data under `reference-node/data/` (mounted to `/data` in the container):
- `db.sqlite` – metadata
- `blobs/sha256/<hashhex>` – blob files
- `keys/` – signing keys (Ed25519)

> Note: the reference node includes a minimal admin/upload API for beta testing, plus a new bootstrap-claim admin session flow.

---

## How nodes participate in the network (high level)

A node exposes:
- a **node descriptor** (`/.well-known/openposter-node`)
- search + poster metadata endpoints (`/v1/search`, `/v1/posters/{id}`)
- blob endpoints (`/v1/blobs/{hash}`)

Clients discover nodes via bootstrapping + gossip, then:
- query multiple nodes
- merge results
- verify signatures
- fetch blobs from origin or mirrors depending on redistribution policy

### Discovery model

OpenPoster uses a hybrid discovery model:

- **Directory** = the well-known starting point. New nodes can register there, and new clients or indexers can ask it for an initial list of nodes. For most first-time users, this is the normal default.
- **Seeds** = node URLs to try first when bootstrapping. The directory is usually the default seed. Additional seeds are optional and mainly useful for advanced or self-hosted setups.
- **Gossip** = what happens after bootstrapping. Nodes share the other nodes they know about via `/v1/nodes`, so discovery can continue without depending on a single service forever.

The intended startup flow is:

1. Start with one or more bootstrap seeds.
2. If no seeds are configured, use the official directory as the default seed.
3. Ask those seeds for `/v1/nodes` to build an initial peer list.
4. Announce this node to the directory so future newcomers can find it.
5. Continue discovering peers through gossip.

Important:

- The directory is a **bootstrap convenience**, not the global source of truth for the whole network.
- A seed is just "a good first node to ask", not a special protocol role.
- A brand-new node still needs at least one known address to get started. In normal setups, that address is the official directory.
- Gossip is for **discovery**, not trust. Clients and indexers must still verify signed metadata and apply their own trust rules.

---

## Mirror / redistribution policy

Every poster entry declares `attribution.redistribution`:
- `public-cache-ok` – mirrors/caches are fine
- `mirrors-approved` – only creator-approved mirror URLs should be used
- `none` – fetch only from creator-controlled URLs

Approved mirrors are represented by including source URLs in **signed metadata**.

---

## Status

This project is early-stage and the protocol is marked **DRAFT**. Expect changes.

If you want to help, the most valuable contributions early are:
- protocol review (making v1 smaller/clearer)
- reference node hardening
- conformance tests
- client prototypes (Plex/Jellyfin)

---

## Contributing

- Open an issue with proposed changes (especially protocol changes).
- Small PRs are best.
- Please keep the v1 protocol surface area minimal.

---

## License

Apache-2.0. See [`LICENSE`](./LICENSE).
