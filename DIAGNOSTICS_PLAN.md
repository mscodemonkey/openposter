# Plan: Diagnostics App + Two-UI Split

## Context

To develop and demonstrate OpenPoster end-to-end — creator uploading on Node A, indexer crawling, consumer on Node B applying to Plex — we need to simulate two different users simultaneously and see the full propagation chain. This requires:

1. **Standalone diagnostics app** (`diagnostics-app/`): real-time health + activity timeline across all services
2. **Two-app split** (separate card): current `web/` becomes `studio-app/` (creator, runs alongside Node A) and a new `consumer-app/` (My Media, runs alongside Node B)

This plan covers **only the diagnostics app**. The two-app split is a follow-on card.

---

## Diagnostics App: What it shows

### Service panels (one per service)

**Node A** (and optionally Node B — same panel component, configured twice)
URL + admin token from localStorage config.

| Datum | Source endpoint |
|---|---|
| Status badge UP / DOWN | `GET /v1/health` |
| node_id, name, operator, base_url | `GET /v1/node` |
| Admin token valid ✓ / ✗ | `GET /v1/admin/whoami` |
| Feature flags | `GET /.well-known/openposter-node` → `features` object |
| Known peer count | `GET /v1/nodes` → `nodes.length` |

**Indexer**
URL from config (default `http://localhost:8090`). No auth.

| Datum | Source |
|---|---|
| Status badge | `GET /v1/health` |
| Total posters | `GET /v1/stats` → `posters` |
| Nodes up / total | `GET /v1/stats` → `nodes.up / nodes.total` |
| Node crawl table: URL · status · last_crawled_at · consecutive_failures | `GET /v1/nodes` |

**Issuer / Directory**
URL from config (default `http://localhost:8085`). No auth for directory listing.

| Datum | Source |
|---|---|
| Status badge | `GET /v1/health` |
| Registered node count | `GET /v1/nodes` → `nodes.length` |
| Node registry: node_id · public_urls | `GET /v1/nodes` |

---

### Activity feed (live timeline)

Shows the artwork propagation chain as it happens:

```
🟢 [Node A]   12:04:01  Poster uploaded — "Oppenheimer" by mscodemonkey
🔵 [Indexer]  12:04:18  Indexed — "Oppenheimer" (17s after upload)
🟣 [Node B]   12:06:44  Applied to Plex — "Oppenheimer" (2m 43s after indexed)
```

**Event sources and polling strategy:**

| Event type | Source | Poll method |
|---|---|---|
| Upload (upsert / delete) | `GET /v1/changes?since={cursor}` on each node | Cursor-based — retain `next_since` between polls; only new events returned |
| Indexed | `GET /v1/recent?limit=20` on indexer | Compare `changed_at` timestamps against last seen; detect new items |
| Applied to Plex | `GET /v1/admin/artwork/tracked` on consumer node | Retain seen `media_item_id` set; new items = those not yet in set with fresh `applied_at` |

**Polling intervals:**
- Normal: 5s (short, to show near-real-time propagation during demos)
- Service down: 10s (back off slightly)
- Stop polling if page hidden (visibilitychange API)

**Feed state:** held in React state as a flat `DiagEvent[]` array, capped at 200 entries, sorted descending by timestamp. Older entries scroll out of view naturally.

```ts
type DiagEvent = {
  id: string;           // dedup key
  type: "upload" | "indexed" | "applied";
  service: string;      // "Node A", "Indexer", "Node B"
  posterId: string;
  title: string | null;
  detail: string | null; // e.g. "applied to Plex item 12345"
  at: string;           // ISO timestamp
};
```

---

## Architecture

### New directory: `diagnostics-app/` at repo root

```
diagnostics-app/
├── package.json          (Next.js 15 + React 19 + MUI v7 — same versions as web/)
├── next.config.ts
├── tsconfig.json
├── src/
│   ├── app/
│   │   ├── layout.tsx    (MUI ThemeProvider, dark theme)
│   │   ├── page.tsx      (main dashboard — service panels + feed)
│   │   └── globals.css
│   ├── components/
│   │   ├── NodePanel.tsx      (health + identity for one node)
│   │   ├── IndexerPanel.tsx   (stats + crawl table)
│   │   ├── IssuerPanel.tsx    (health + directory listing)
│   │   ├── ActivityFeed.tsx   (live timeline component)
│   │   ├── ConfigDrawer.tsx   (service URL/token config form, persisted to localStorage)
│   │   └── StatusChip.tsx     (reusable UP/DOWN/CHECKING chip)
│   └── lib/
│       ├── config.ts     (load/save service config from localStorage)
│       └── events.ts     (event aggregation helpers: cursor management, dedup)
```

### Config schema (localStorage key: `op-diag-config`)

```ts
type DiagConfig = {
  nodes: Array<{
    label: string;     // "Node A", "Node B"
    url: string;       // e.g. "http://localhost:8081"
    adminToken: string;
  }>;
  indexerUrl: string;  // default: "http://localhost:8090"
  issuerUrl: string;   // default: "http://localhost:8085"
};
```

### Page layout

```
┌─────────────────────────────────────────────┐
│  OpenPoster Diagnostics          [⚙ Config] │
├───────────────┬─────────────────────────────┤
│ Service Panels│ Activity Feed               │
│               │                             │
│ [Node A]  ✅  │ 🟢 Node A  upload  12:04:01 │
│ [Node B]  ✅  │ 🔵 Indexer indexed 12:04:18 │
│ [Indexer] ✅  │ 🟣 Node B  applied 12:06:44 │
│ [Issuer]  ✅  │ ...                         │
└───────────────┴─────────────────────────────┘
```

- Left column: service panels (scrollable, MUI Paper cards)
- Right column: activity feed (reverse-chronological, auto-scrolls to top on new event)
- Config drawer: slides in from right, form fields for all service URLs + tokens

---

## Two-app split (follow-on card)

**Why:** Simulate two distinct users — a creator on Node A and a consumer on Node B — as would happen in real-world federation.

**Planned split:**
- `studio-app/` = current `web/` minus My Media, minus Creators public directory → creator-facing, runs alongside Node A
- `consumer-app/` = new app with My Media, Creators browsing, Settings (consumer) → runs alongside Node B

Shared code (lib/, components/) will be extracted to a workspace package or copied. This is a significant refactor and should be a separate card once the diagnostics app is working.

---

## Verification

1. `cd diagnostics-app && npm run build` — clean compile
2. With Node A (8081), Indexer (8090), Issuer (8085) running:
   - Open diagnostics app — all service panels show UP
   - Upload a poster in Studio → within 5s see 🟢 upload event in feed
   - Wait for indexer crawl → see 🔵 indexed event appear
   - Apply artwork from consumer → see 🟣 applied event appear
3. Kill indexer → Indexer panel flips to DOWN within 10s, other panels unaffected
4. With no config entered → panels show "not configured" prompts, feed is empty
