# OpenPoster Protocol (Draft) — v1

Status: **DRAFT**

This document defines a minimal, stable core protocol for a federated poster network.

**Design goals**
- **Federated by default:** many independent nodes.
- **Content-addressed blobs:** assets identified by hash.
- **Premium-ready from day one:** encrypted distribution + entitlement-based key delivery.
- **Hybrid auth/identity:** nodes can trust OpenPoster as an issuer *optionally*; creators may self-issue; clients support multiple issuers.
- **Keep it small:** optional extensions should not bloat the core.

---

## 0. Terms

This section defines the key words used throughout the protocol. You don’t need to memorise these — it’s just here so the rest of the document stays consistent.

- **Node**: an HTTP server that publishes posters and metadata.
- **Creator node**: node operated by a creator (canonical publisher of that creator’s metadata).
- **Client**: consumer software (Plex/Jellyfin plugin, CLI, web app).
- **Issuer**: identity/entitlement provider that issues bearer tokens (typically JWT).
- **Blob**: immutable bytes served by hash (preview or full-res; full-res may be encrypted).
- **Poster record**: metadata describing a poster and its blobs.

Normative keywords: **MUST**, **SHOULD**, **MAY** per RFC 2119.

---

## 1. Transport and versioning

This section explains the basic “shape” of the OpenPoster API: how clients talk to nodes, and how we avoid breaking older clients as the protocol evolves.

- All endpoints are served over **HTTPS** (HTTP MAY be allowed for LAN/self-signed dev, but clients SHOULD warn).
- API versioning is path-based: `/v1/...`.
- Nodes MUST expose a well-known node descriptor at: `/.well-known/openposter-node`.

---

## 2. Node descriptor (discovery + capabilities)

Every OpenPoster server is called a **node**.

A node publishes a small JSON document called its **node descriptor**. Think of it like a profile card for your poster library: it tells apps where your node lives, what it supports, and what public keys clients should use to verify your posters.

Why it matters:
- **Discovery:** clients (and other nodes) can quickly recognise “this is an OpenPoster node” and learn its base URL.
- **Compatibility:** clients can see which protocol version and features you support.
- **Trust:** clients can verify that poster entries really came from your node (via signing keys).
- **Premium support:** if you offer premium content, the descriptor tells clients which login/issuer systems your node will accept.

How it’s used:
1. A client learns your node URL (from a directory, a friend, or a link you share).
2. The client fetches `/.well-known/openposter-node`.
3. The client uses that information to search your library and verify poster metadata.

### 2.1 Endpoint

`GET /.well-known/openposter-node`

### 2.2 Response (JSON)

Nodes MUST return JSON with at least:

```json
{
  "protocol": "openposter",
  "api_versions": ["v1"],
  "node_id": "opn_3c1f...",
  "name": "Marty Posters",
  "base_url": "https://posters.example.com",
  "operator": {
    "display_name": "MartyDesigns",
    "contact": "mailto:hello@example.com"
  },
  "features": {
    "search": true,
    "nodes_gossip": true,
    "blobs": true,
    "premium": true,
    "signed_metadata": true
  },
  "signing_keys": [
    {
      "key_id": "key_ed25519_1",
      "alg": "ed25519",
      "public_key": "base64:..."
    }
  ],
  "trusted_issuers": [
    {
      "issuer": "https://openposter.art",
      "jwks_url": "https://openposter.art/.well-known/jwks.json",
      "audiences": ["openposter-node"],
      "token_format": "jwt"
    },
    {
      "issuer": "https://posters.example.com",
      "jwks_url": "https://posters.example.com/.well-known/jwks.json",
      "audiences": ["posters.example.com"],
      "token_format": "jwt"
    }
  ]
}
```

### 2.3 Semantics

- `node_id` MUST be stable over time (e.g., random ID stored in node config). It SHOULD NOT be a domain name.
- `signing_keys` lists public keys used to sign poster metadata (see §4.3.9). Nodes with `features.signed_metadata=true` MUST publish at least one signing key.
- `trusted_issuers` declares which issuers the node will accept bearer tokens from for premium operations.
- Nodes MAY include themselves as an issuer (self-issued model) by hosting a `jwks_url`.

---

## 3. Node list (gossip)

OpenPoster is a network of many nodes, so clients need a way to discover more than just the first node they were told about.

The **node list** endpoint is a simple way for nodes to share “other nodes I know about”. This is sometimes called *gossip discovery*.

Important: the node list is about **discovery**, not **trust**. Clients should still verify signed poster metadata and apply their own trust rules.

### 3.1 Endpoint

`GET /v1/nodes`

### 3.2 Response

```json
{
  "nodes": [
    {
      "url": "https://posters.example.com",
      "last_seen": "2026-03-07T03:21:00Z"
    },
    {
      "url": "https://retro-posters.example.net"
    }
  ]
}
```

### 3.3 Notes

- Gossip is a bootstrap/discovery mechanism. Clients SHOULD de-duplicate by normalized URL.
- Nodes SHOULD periodically validate that URLs respond with a valid `/.well-known/openposter-node`.

---

## 4. Search

Search is how apps (Plex/Jellyfin tools, websites, CLIs) find artwork on a node.

In v1, the most reliable way to search is by external IDs (especially TMDB). Text search (`q=...`) is allowed, but ID-based search is what makes this work consistently across a federation.

### 4.1 Endpoint

`GET /v1/search`

Query params (v1 core):
- `tmdb_id` (recommended primary key for movies/shows; see also `type` semantics below)
- `imdb_id` (optional)
- `q` (optional text query)
- `type` = `movie|show|season|episode|collection` (optional)
- `limit` (optional, default 50; nodes MAY cap, recommended max 200)
- `cursor` (optional, opaque pagination cursor from `next_cursor`)

Query params (v1 recommended filters):
- `kind` = `poster|background|banner|logo|clearlogo|thumb` (optional)
- `orientation` = `portrait|landscape|square` (optional)
- `text` = `text|textless|unknown` (optional)
- `season_number` (optional; meaningful when `type=season|episode`)
- `episode_number` (optional; meaningful when `type=episode`)

### 4.2 Response

Search responses MUST include `next_cursor` when pagination is possible. If there are no more results, `next_cursor` MUST be `null` or omitted.

```json
{
  "results": [
    {
      "poster_id": "pst_8fa2c",
      "media": {
        "type": "movie",
        "tmdb_id": 603,
        "title": "The Matrix",
        "year": 1999
      },
      "creator": {
        "creator_id": "cr_marty",
        "display_name": "MartyDesigns",
        "home_node": "https://posters.example.com"
      },
      "assets": {
        "preview": {
          "hash": "sha256:...",
          "url": "https://posters.example.com/v1/blobs/sha256:...",
          "bytes": 245123,
          "mime": "image/jpeg"
        },
        "full": {
          "access": "premium",
          "hash": "sha256:...",
          "url": "https://mirror1.example.org/v1/blobs/sha256:...",
          "bytes": 5123123,
          "mime": "image/jpeg",
          "encryption": {
            "alg": "aes-256-gcm",
            "key_id": "key_7d2b...",
            "nonce": "base64:..."
          }
        }
      },
      "attribution": {
        "source_url": "https://posters.example.com/p/pst_8fa2c",
        "license": "all-rights-reserved",
        "redistribution": "mirrors-approved"
      }
    }
  ],
  "next_cursor": "opaque-or-null"
}
```

Notes:
- Preview MUST be accessible without authentication.
- Full asset MAY be `public` or `premium`.

### 4.3 Poster entry schema (normative)

A `results[]` entry (and `/v1/posters/{poster_id}` response) is a **Poster Entry**.

#### 4.3.1 Required fields

Poster Entry MUST include:
- `poster_id` (string, **globally unique**)
- `media` (object; MUST include `type` and at least one canonical external id)

`poster_id` format (v1):
- MUST be globally unique across nodes.
- RECOMMENDED format: `op:v1:<node_id>:<local_id>` (e.g., `op:v1:opn_3c1f...:pst_8fa2c`).
- Clients SHOULD treat `poster_id` as an opaque identifier.
- `creator` (object; MUST include `creator_id` and `home_node`)
- `assets.preview` (object)
- `assets.full` (object)
- `attribution.license` and `attribution.redistribution`

#### 4.3.2 Media object

`media` MUST include:
- `type`: `movie|show|season|episode|collection`

Canonical IDs (v1):
- For `type=movie` and `type=show`, `media` MUST include:
  - `tmdb_id` (number)
- For `type=season` and `type=episode`, `media` MUST include:
  - `show_tmdb_id` (number) — the TMDB id of the parent show
  - `season_number` (number)
  - and for `type=episode` additionally: `episode_number` (number)

Optional IDs (v1):
- `tmdb_id` (number) MAY be included for `season` and `episode` if known (object-level TMDB id).
- `imdb_id` (string like `tt0133093`) OPTIONAL
- `tvdb_id` (number) OPTIONAL

Enrichment note (non-normative):
- Nodes MAY automatically populate object-level `tmdb_id` for `season`/`episode` entries by resolving `show_tmdb_id` + `season_number` (+ `episode_number`) via the TMDB API at ingest time.

`media` SHOULD include:
- `title` (string)
- `year` (number)

#### 4.3.3 Creator object

`creator` MUST include:
- `creator_id` (string; stable)
- `display_name` (string)
- `home_node` (URL string)

`creator` MAY include:
- `profile_url` (URL)
- `avatar` (asset reference)

#### 4.3.4 Asset object

Each asset (`assets.preview`, `assets.full`, and any variants) MUST include:
- `hash` (content hash of the served bytes)
- `url` (fetch URL; MAY point to mirrors)
- `bytes` (integer)
- `mime` (`image/jpeg|image/png`)

Assets MAY include:
- `sources` (array of approved sources; see §4.3.8.1)

Assets SHOULD include:
- `width` / `height` (integers)
- `kind`:
  - `poster` (default)
  - `background` (aka fanart)
  - `banner` (wide, typically for TV)
  - `logo`
  - `clearlogo`
  - `thumb`
- `orientation`: `portrait|landscape|square` (recommended; derived from width/height if present)
- `language` (BCP-47 tag like `en`, `en-AU`, `ja`) or `null` for language-neutral
- `text`: `text|textless|unknown` (whether the artwork contains titles/logos)

`assets.preview` MUST be a browse-friendly image (small-ish). Recommended:
- 400–800px on the short edge
- <= ~500KB if possible

#### 4.3.5 Full asset access and encryption

`assets.full` MUST include:
- `access`: `public|premium`

If `access = "premium"`, `assets.full.encryption` MUST be present:
- `alg`: `aes-256-gcm` (recommended for v1) or `xchacha20poly1305`
- `key_id`: string (used with `/v1/keys/{key_id}:unwrap`)
- `nonce`: base64 string (algorithm-specific)

#### 4.3.6 Variants (recommended)

Nodes SHOULD expose variants to reduce client work and bandwidth. Two patterns are allowed:

**Pattern A (recommended): named variants**
```json
{
  "assets": {
    "preview": {"kind":"poster","hash":"sha256:...","url":"...","bytes":123,"mime":"image/jpeg","width":600,"height":900},
    "full": {"access":"premium","kind":"poster","hash":"sha256:...","url":"...","bytes":5123123,"mime":"image/png","width":2000,"height":3000,
      "encryption": {"alg":"aes-256-gcm","key_id":"key_...","nonce":"base64:..."}
    },
    "variants": [
      {"name":"full-jpeg","hash":"sha256:...","url":"...","bytes":2100000,"mime":"image/jpeg","width":2000,"height":3000,
        "access":"premium","encryption": {"alg":"aes-256-gcm","key_id":"key_...","nonce":"base64:..."}
      },
      {"name":"full-png","hash":"sha256:...","url":"...","bytes":3400000,"mime":"image/png","width":2000,"height":3000,
        "access":"premium","encryption": {"alg":"aes-256-gcm","key_id":"key_...","nonce":"base64:..."}
      }
    ]
  }
}
```

**Pattern B: multiple posters per media** (e.g., separate records for poster/background). This is allowed but Pattern A is preferred.

#### 4.3.7 Descriptive fields (recommended)

Poster Entry SHOULD include:
- `title` (string; creator-provided name for the artwork, distinct from media title)
- `tags` (string[]) e.g., `minimal`, `retro`, `neon`, `alt-poster`, `imax`, `criterion`
- `text`: `text|textless|unknown` (poster-level hint; assets may also specify per-asset)
- `rating` / `score` (number) OPTIONAL (node-local)
- `created_at` / `updated_at` (RFC3339 timestamps)
- `checksum` fields are covered by `hash` (do not add extra hashes unless needed)

#### 4.3.8 Attribution / redistribution

`attribution` MUST include:
- `license`: `all-rights-reserved|cc-by|cc-by-sa|cc0|custom`
- `redistribution`: `public-cache-ok|mirrors-approved|none`

`attribution` SHOULD include:
- `source_url` (canonical page)
- `author` / `author_url` if different from node operator

Redistribution semantics:
- `public-cache-ok`: any node MAY mirror/cache the blob and nodes MAY advertise mirror URLs freely.
- `mirrors-approved`: only mirrors explicitly approved by the creator SHOULD be used/advertised.
- `none`: clients SHOULD fetch blobs only from URLs hosted by the creator node (or creator-controlled infrastructure).

#### 4.3.8.1 Approved mirrors (v1)

To make `redistribution=mirrors-approved` work without a separate central approval registry, v1 defines **approved mirrors by signed advertisement**:

- A Poster Entry MAY include `assets.*.sources[]` (in addition to the convenience `url` field).
- `sources[]` entries are considered **approved** if they appear inside a **validly signed** Poster Entry.
- Clients SHOULD prefer `sources[]` where `role="mirror"` only when `redistribution` permits it.

`sources[]` schema:
```json
{
  "sources": [
    {
      "url": "https://posters.example.com/v1/blobs/sha256:...",
      "role": "origin"
    },
    {
      "url": "https://mirror1.example.org/v1/blobs/sha256:...",
      "role": "mirror",
      "mirror_node": "https://mirror1.example.org"
    }
  ]
}
```

Rules:
- `assets.*.url` MUST be one of the URLs in `assets.*.sources[]` if `sources[]` is present.
- If `redistribution = "mirrors-approved"`, nodes MUST NOT advertise mirror sources unless they intend to approve them.
- Clients MUST NOT treat sources learned via unsigned/invalid metadata as approved mirrors.

Future extension (non-normative): creator-issued mirror grants (tokens) for automated mirror syncing.

#### 4.3.9 Signed metadata (REQUIRED for v1)

To prevent spoofing/impersonation, Poster Entry metadata MUST be signed by the creator node.

Poster Entry MUST include a `signature` object:
```json
{
  "signature": {
    "alg": "ed25519",
    "key_id": "key_ed25519_1",
    "jcs": true,
    "sig": "base64:..."
  }
}
```

Signing rules:
- `alg` MUST be `ed25519` for v1.
- `key_id` MUST reference one of the node’s `signing_keys` from `/.well-known/openposter-node`.
- `sig` MUST be computed over the **canonical JSON** (RFC 8785 / JCS) of the Poster Entry **with the `signature` field omitted**.
- Clients MUST verify signatures for any Poster Entry they display or apply.
- Clients MAY choose not to display entries with invalid signatures.

Rationale:
- Blobs are content-addressed, but metadata can be forged without signatures.
- This allows mirrors/indexers to relay metadata while preserving authenticity.

---

## 5. Poster record

Search results are meant to be lightweight. When a client wants the full details for a specific piece of artwork (including signed metadata and all available variants), it fetches the **poster record**.

### 5.1 Endpoint

`GET /v1/posters/{poster_id}`

### 5.2 Response

Same schema as a search result entry, but MAY include additional fields (tags, resolution, variants, signatures).

---

## 6. Blob serving (content-addressed)

A **blob** is the actual image bytes (JPEG/PNG) for a preview, poster, or background.

OpenPoster serves blobs by **SHA-256 hash**, not by “filename”. This makes blobs immutable and safe to cache/mirror, and lets clients verify integrity after download.

### 6.1 Endpoint

`GET /v1/blobs/{hash}`

- `hash` format: `sha256:{hex}` (e.g., `sha256:abcdef...`).
- Nodes MUST serve the exact bytes matching that hash.

### 6.2 Optional endpoint

`HEAD /v1/blobs/{hash}` for existence checks.

### 6.3 Caching

- Blobs are immutable; servers SHOULD set long cache headers (e.g., `Cache-Control: public, max-age=31536000, immutable`).

---

## 7. Premium access: key unwrap

Premium works by distributing **encrypted blobs** and separately granting the **content key** to entitled users.

This design is intentional: it allows mirrors and caches to host the encrypted bytes (good performance, lower creator bandwidth), while the creator keeps control over who can decrypt.

### 7.1 Endpoint

`POST /v1/keys/{key_id}:unwrap`

Headers:
- `Authorization: Bearer <token>`

Body:
```json
{
  "poster_id": "op:v1:opn_3c1f...:pst_8fa2c",
  "hash": "sha256:...",
  "wrap": {
    "alg": "hpke-x25519-hkdf-sha256-aes-128-gcm",
    "client_pubkey": "base64:..."
  }
}
```

Notes:
- `wrap` is OPTIONAL. If provided, the node SHOULD return a wrapped key instead of a raw content key.

### 7.2 Response

```json
{
  "key_id": "key_7d2b...",
  "content_alg": "aes-256-gcm",
  "expires_at": "2026-03-07T03:25:00Z",

  "wrapped_key": {
    "alg": "hpke-x25519-hkdf-sha256-aes-128-gcm",
    "enc": "base64:...",
    "ciphertext": "base64:..."
  }
}
```

Alternate (allowed, simpler):
```json
{
  "key_id": "key_7d2b...",
  "content_alg": "aes-256-gcm",
  "content_key": "base64:...",
  "expires_at": "2026-03-07T03:25:00Z"
}
```

Rules:
- If the request includes `wrap`, the node SHOULD return `wrapped_key` and SHOULD NOT return `content_key`.
- If the request omits `wrap`, the node MAY return `content_key`.
- Clients SHOULD implement `wrapped_key` for long-term safety (prevents accidental leakage of long-lived content keys).

### 7.3 Validation rules

The node MUST:
- Validate the bearer token against one of `trusted_issuers`:
  - verify signature via issuer JWKS
  - verify `exp` not expired
  - verify `aud` includes one accepted audience
  - verify relevant entitlement claims
- Enforce creator policy (subscription required, per-collection rules, etc.).

---

## 8. Token requirements (issuer → client)

Tokens are how a client proves “this user is allowed to access premium content”.

OpenPoster uses a **hybrid issuer model**: a creator node can choose which issuers it trusts (including itself, OpenPoster, or others). This keeps the network decentralised while still allowing good user experience.

v1 assumes bearer tokens in **JWT** format.

Required JWT claims:
- `iss` issuer URL
- `sub` stable user id
- `aud` intended audience (e.g., `openposter-node` or a creator node audience)
- `exp` expiry
- `iat` issued-at

Entitlement claims (recommended):
- `entitlements`: array of entitlement objects.

Creator-wide entitlement (v1 recommended):
```json
{
  "creator_id": "cr_marty",
  "tier": "premium"
}
```

Per-collection entitlement (v1 optional; reserved for later):
```json
{
  "creator_id": "cr_marty",
  "collection_id": "col_neon_pack",
  "tier": "premium"
}
```

Rules:
- If `collection_id` is absent, the entitlement applies to the whole creator.
- Nodes MUST treat unknown fields as ignorable (forward compatible).

Nodes MAY also support issuer introspection, but SHOULD work offline using token claims for scale.

---

## 9. Errors (v1)

Consistent errors make it much easier for clients (and humans) to understand what went wrong. v1 standardises an error format so tools can show friendly messages and developers can debug quickly.

All error responses from `/v1/*` endpoints MUST be JSON with `Content-Type: application/json` and the following shape:

```json
{
  "error": {
    "code": "string",
    "message": "human readable message",
    "request_id": "optional string",
    "details": {}
  }
}
```

Rules:
- `code` MUST be a stable, machine-readable string.
- `message` SHOULD be safe to display to users.
- `details` MAY be omitted.
- `request_id` SHOULD be included if the node has request tracing.

### 9.1 Standard error codes

Nodes SHOULD use these codes when applicable:
- `invalid_request` → 400
- `not_found` → 404
- `unsupported` → 400 or 422
- `rate_limited` → 429
- `unauthorized` → 401 (missing/invalid token)
- `forbidden` → 403 (token valid, but not entitled)
- `signature_invalid` → 400 or 422 (poster metadata signature failed verification)
- `blob_hash_mismatch` → 502 or 500 (node misconfigured; served bytes don’t match hash)
- `internal` → 500

### 9.2 Validation error details (recommended)

For field-level validation errors, `details` SHOULD follow:

```json
{
  "fields": [
    {"path": "/media/tmdb_id", "error": "required"},
    {"path": "/assets/full/encryption/nonce", "error": "invalid_base64"}
  ]
}
```

---

## 10. Security notes (v1)

This section summarises the “gotchas” that matter in a federated network: how to avoid spoofed metadata, prevent accidental leakage of premium keys, and keep nodes from being overwhelmed.

- **Previews must be public** to allow cross-node browsing without auth complexity.
- Premium full-res blobs SHOULD be encrypted at rest and in distribution.
- Nodes MUST rate-limit `/keys/*:unwrap` to reduce abuse.
- Clients MUST verify blob hashes after download.
- Clients SHOULD attribute creators and respect redistribution policy fields.

---

## 11. Open questions / extensions (non-normative)

Not everything needs to be in v1. This section captures ideas we expect to add later (or keep optional) without bloating the core protocol.

- Signed poster manifests (creator signature over metadata) to prevent metadata forgery.
- Mirror approval flows (creator-authorized mirrors).
- IPFS CIDs as optional alternate transports for blobs.
- Collections, packs, and versioning of poster sets.
- Abuse reporting and blocklist exchange.

---

## 12. Minimal conformance checklist

This checklist makes federation practical: it tells node operators and client authors which endpoints and behaviours are required for basic interoperability.

A conforming **node** MUST implement:
- `GET /.well-known/openposter-node`
- `GET /v1/search`
- `GET /v1/posters/{poster_id}`
- `GET /v1/blobs/{hash}`
- If it advertises `features.premium=true`: `POST /v1/keys/{key_id}:unwrap`

A conforming **client** MUST:
- Read node descriptor and respect `trusted_issuers`.
- Handle both public and premium posters.
- Verify blob hashes.
