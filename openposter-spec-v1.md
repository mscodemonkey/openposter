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

- **Node**: an HTTP server that publishes posters and metadata.
- **Creator node**: node operated by a creator (canonical publisher of that creator’s metadata).
- **Client**: consumer software (Plex/Jellyfin plugin, CLI, web app).
- **Issuer**: identity/entitlement provider that issues bearer tokens (typically JWT).
- **Blob**: immutable bytes served by hash (preview or full-res; full-res may be encrypted).
- **Poster record**: metadata describing a poster and its blobs.

Normative keywords: **MUST**, **SHOULD**, **MAY** per RFC 2119.

---

## 1. Transport and versioning

- All endpoints are served over **HTTPS** (HTTP MAY be allowed for LAN/self-signed dev, but clients SHOULD warn).
- API versioning is path-based: `/v1/...`.
- Nodes MUST expose a well-known node descriptor at: `/.well-known/openposter-node`.

---

## 2. Node descriptor (discovery + capabilities)

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
    "premium": true
  },
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
- `trusted_issuers` declares which issuers the node will accept bearer tokens from for premium operations.
- Nodes MAY include themselves as an issuer (self-issued model) by hosting a `jwks_url`.

---

## 3. Node list (gossip)

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

### 4.1 Endpoint

`GET /v1/search`

Query params (v1 core):
- `tmdb_id` (recommended primary key for movies/shows)
- `imdb_id` (optional)
- `q` (optional text query)
- `type` = `movie|show|season|episode|collection` (optional)
- `limit` (optional, default 50)

### 4.2 Response

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
            "alg": "xchacha20poly1305",
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
  ]
}
```

Notes:
- Preview MUST be accessible without authentication.
- Full asset MAY be `public` or `premium`.

---

## 5. Poster record

### 5.1 Endpoint

`GET /v1/posters/{poster_id}`

### 5.2 Response

Same schema as a search result entry, but MAY include additional fields (tags, resolution, variants, signatures).

---

## 6. Blob serving (content-addressed)

### 6.1 Endpoint

`GET /v1/blobs/{hash}`

- `hash` format: `{algo}:{hex}` (e.g., `sha256:abcdef...`).
- Nodes MUST serve the exact bytes matching that hash.

### 6.2 Optional endpoint

`HEAD /v1/blobs/{hash}` for existence checks.

### 6.3 Caching

- Blobs are immutable; servers SHOULD set long cache headers (e.g., `Cache-Control: public, max-age=31536000, immutable`).

---

## 7. Premium access: key unwrap

Premium works by distributing **encrypted blobs** and separately granting the **content key** to entitled users.

### 7.1 Endpoint

`POST /v1/keys/{key_id}:unwrap`

Headers:
- `Authorization: Bearer <token>`

Body:
```json
{
  "poster_id": "pst_8fa2c",
  "hash": "sha256:..." 
}
```

### 7.2 Response

```json
{
  "key_id": "key_7d2b...",
  "alg": "xchacha20poly1305",
  "content_key": "base64:...",
  "expires_at": "2026-03-07T03:25:00Z"
}
```

Notes:
- Returning `content_key` directly is the simplest model.
- More advanced models MAY return a wrapped key bound to the client device, but v1 does not require it.

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

v1 assumes bearer tokens in **JWT** format.

Required JWT claims:
- `iss` issuer URL
- `sub` stable user id
- `aud` intended audience (e.g., `openposter-node` or a creator node audience)
- `exp` expiry
- `iat` issued-at

Entitlement claims (recommended):
- `entitlements`: array of creator ids and/or collection ids
  - e.g. `{ "creator": "cr_marty", "tier": "premium" }`

Nodes MAY also support issuer introspection, but SHOULD work offline using token claims for scale.

---

## 9. Security notes (v1)

- **Previews must be public** to allow cross-node browsing without auth complexity.
- Premium full-res blobs SHOULD be encrypted at rest and in distribution.
- Nodes MUST rate-limit `/keys/*:unwrap` to reduce abuse.
- Clients MUST verify blob hashes after download.
- Clients SHOULD attribute creators and respect redistribution policy fields.

---

## 10. Open questions / extensions (non-normative)

- Signed poster manifests (creator signature over metadata) to prevent metadata forgery.
- Mirror approval flows (creator-authorized mirrors).
- IPFS CIDs as optional alternate transports for blobs.
- Collections, packs, and versioning of poster sets.
- Abuse reporting and blocklist exchange.

---

## 11. Minimal conformance checklist

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
