# OpenPoster

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

The reference node is intentionally minimal: it’s a working starting point and a compatibility target.

### Requirements
- Docker + Docker Compose

### Run

```bash
cd reference-node
docker compose up --build
```

Then open:
- `http://localhost:8080/.well-known/openposter-node`

### Persistent data
The container stores data under `reference-node/data/` (mounted to `/data` in the container):
- `db.sqlite` – metadata
- `blobs/sha256/<hashhex>` – blob files
- `keys/` – signing keys (Ed25519)

> Note: the reference node currently supports **read-only** protocol endpoints. Upload/admin tooling will be added separately.

---

## How nodes participate in the network (high level)

A node exposes:
- a **node descriptor** (`/.well-known/openposter-node`)
- search + poster metadata endpoints (`/v1/search`, `/v1/posters/{id}`)
- blob endpoints (`/v1/blobs/{hash}`)

Clients discover nodes via bootstrapping + gossip (details evolving), then:
- query multiple nodes
- merge results
- verify signatures
- fetch blobs from origin or mirrors depending on redistribution policy

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
