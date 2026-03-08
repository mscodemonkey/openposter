"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import CardMedia from "@mui/material/CardMedia";
import Collapse from "@mui/material/Collapse";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/GridLegacy";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { PosterEntry } from "@/lib/types";

import CreatorPicker from "@/components/CreatorPicker";

type PagedResponse = {
  results: PosterEntry[];
  next_cursor?: string | null;
};

type FacetsResponse = {
  media_types: Array<{ type: string; count: number }>;
  creators: Array<{ creator_id: string; display_name: string | null; count: number }>;
};

export default function BrowsePage() {
  const [creatorId, setCreatorId] = useState<string>("");
  const [creatorQ, setCreatorQ] = useState<string>("");
  const [mediaType, setMediaType] = useState<string>("");
  const [tmdbId, setTmdbId] = useState<string>("");
  const [q, setQ] = useState<string>("");

  const [copied, setCopied] = useState(false);
  const [shareAnchor, setShareAnchor] = useState<null | HTMLElement>(null);

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [items, setItems] = useState<PosterEntry[] | null>(null);
  const [brokenPosterIds, setBrokenPosterIds] = useState<Record<string, true>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [facets, setFacets] = useState<FacetsResponse | null>(null);

  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);

  function syncUrl(next: {
    creatorId: string;
    creatorQ: string;
    mediaType: string;
    tmdbId: string;
    q: string;
  }) {
    const sp = new URLSearchParams();
    if (next.creatorId) sp.set("creator_id", next.creatorId);
    if (next.creatorQ) sp.set("creator_q", next.creatorQ);
    if (next.mediaType) sp.set("media_type", next.mediaType);
    if (next.tmdbId) sp.set("tmdb_id", next.tmdbId);
    if (next.q) sp.set("q", next.q);
    const qs = sp.toString();
    const newUrl = qs ? `/browse?${qs}` : "/browse";
    window.history.replaceState(null, "", newUrl);
  }

  useEffect(() => {
    // parse query string on client
    try {
      const sp = new URLSearchParams(window.location.search);
      const nextCreatorId = sp.get("creator_id") || "";
      const nextCreatorQ = sp.get("creator_q") || "";
      const nextMediaType = sp.get("media_type") || "";
      const nextTmdbId = sp.get("tmdb_id") || "";
      const nextQ = sp.get("q") || "";

      setCreatorId(nextCreatorId);
      setCreatorQ(nextCreatorQ);
      setMediaType(nextMediaType);
      setTmdbId(nextTmdbId);
      setQ(nextQ);

      // Keep advanced search tucked away unless a filter is active.
      const hasAnyFilter =
        !!nextCreatorId || !!nextCreatorQ || !!nextMediaType || !!nextTmdbId || !!nextQ;
      setAdvancedOpen(hasAnyFilter);
    } catch {
      setCreatorId("");
      setCreatorQ("");
      setMediaType("");
      setTmdbId("");
      setQ("");
      setAdvancedOpen(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const fc = await fetch(`${base}/v1/facets`);
        if (!fc.ok) throw new Error(`facets failed: ${fc.status}`);
        setFacets((await fc.json()) as FacetsResponse);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [base]);

  function shouldUseSearchEndpoint() {
    return tmdbId.trim() !== "" || q.trim() !== "";
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  function buildUrl(cursor?: string | null) {
    if (shouldUseSearchEndpoint()) {
      const u = new URL(`${base}/v1/search`);
      u.searchParams.set("limit", "40");
      if (tmdbId) u.searchParams.set("tmdb_id", tmdbId);
      if (q) u.searchParams.set("q", q);
      if (mediaType) u.searchParams.set("type", mediaType);
      if (creatorId) u.searchParams.set("creator_id", creatorId);
      if (cursor) u.searchParams.set("cursor", cursor);
      return u.toString();
    }

    const u = new URL(`${base}/v1/recent`);
    u.searchParams.set("limit", "40");
    if (mediaType) u.searchParams.set("media_type", mediaType);
    if (creatorId) u.searchParams.set("creator_id", creatorId);
    if (cursor) u.searchParams.set("cursor", cursor);
    return u.toString();
  }

  function hasArtwork(r: PosterEntry): boolean {
    const preview = r?.assets?.preview?.url;
    const full = r?.assets?.full?.url;
    return (
      typeof preview === "string" &&
      preview.length > 0 &&
      typeof full === "string" &&
      full.length > 0
    );
  }

  async function loadFirst() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(buildUrl(null));
      if (!r.ok) throw new Error(`browse failed: ${r.status}`);
      const json = (await r.json()) as PagedResponse;

      // Only show posters with real artwork URLs.
      setItems(json.results.filter(hasArtwork));
      setBrokenPosterIds({});
      setNextCursor(json.next_cursor || null);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const r = await fetch(buildUrl(nextCursor));
      if (!r.ok) throw new Error(`browse failed: ${r.status}`);
      const json = (await r.json()) as PagedResponse;
      setItems((prev) => [
        ...(prev || []),
        ...json.results.filter(hasArtwork),
      ]);
      setNextCursor(json.next_cursor || null);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    try {
      syncUrl({
        creatorId,
        creatorQ: creatorQ.trim(),
        mediaType,
        tmdbId: tmdbId.trim(),
        q: q.trim(),
      });
    } catch {
      // ignore
    }

    void loadFirst().catch((e: unknown) =>
      setError(e instanceof Error ? e.message : String(e))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId, creatorQ, mediaType, tmdbId, q]);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Posters
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Indexer: <code>{INDEXER_BASE_URL}</code>
          </Typography>
        </Box>

        <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Results
              </Typography>
              <Button
                size="small"
                variant="text"
                onClick={() => setAdvancedOpen((v) => !v)}
              >
                {advancedOpen ? "Hide advanced search" : "Advanced search"}
              </Button>
            </Stack>

            <Button
              size="small"
              variant="outlined"
              onClick={(e) => setShareAnchor(e.currentTarget)}
            >
              Share
            </Button>
          </Stack>

          <Menu
            open={Boolean(shareAnchor)}
            anchorEl={shareAnchor}
            onClose={() => setShareAnchor(null)}
          >
            <MenuItem
              onClick={() => {
                void copyShareLink();
                setShareAnchor(null);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </MenuItem>
          </Menu>

          <Collapse in={advancedOpen}>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <Box sx={{ flex: 1 }}>
                  <CreatorPicker
                    indexerBaseUrl={INDEXER_BASE_URL}
                    value={creatorId}
                    onChange={(v) => setCreatorId(v)}
                    query={creatorQ}
                    onQueryChange={(v) => setCreatorQ(v)}
                    initialOptions={facets?.creators || []}
                    label="Creator"
                  />
                </Box>

                <TextField
                  select
                  label="Media type"
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value)}
                  SelectProps={{ native: true }}
                  sx={{ minWidth: 220 }}
                >
                  <option value="">Any</option>
                  {(facets?.media_types || []).map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.type} ({t.count})
                    </option>
                  ))}
                </TextField>
              </Stack>

              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  label="Title contains"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  fullWidth
                />
                <TextField
                  label="TMDB id"
                  value={tmdbId}
                  onChange={(e) => setTmdbId(e.target.value)}
                  sx={{ minWidth: 220 }}
                />
              </Stack>

              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setCreatorId("");
                    setCreatorQ("");
                    setMediaType("");
                    setTmdbId("");
                    setQ("");
                  }}
                >
                  Clear
                </Button>
              </Stack>
            </Stack>
          </Collapse>
        </Paper>

        {error && (
          <Paper sx={{ p: 2, borderColor: "error.main" }}>
            <Typography color="error">{error}</Typography>
          </Paper>
        )}

        {loading || items === null ? (
          <Typography color="text.secondary">Loading…</Typography>
        ) : items.filter((r) => !brokenPosterIds[r.poster_id]).length === 0 ? (
          <Typography color="text.secondary">No posters.</Typography>
        ) : (
          <Grid container spacing={2}>
            {items
              .filter((r) => !brokenPosterIds[r.poster_id])
              .map((r) => (
                <Grid key={r.poster_id} item xs={6} sm={4} md={3} lg={2}>
                  <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <CardActionArea component={Link} href={`/p/${encodeURIComponent(r.poster_id)}`}>
                      <Box sx={{ width: "100%", aspectRatio: "2 / 3" }}>
                        <CardMedia
                          component="img"
                          image={r.assets.preview.url}
                          alt={r.media.title || r.poster_id}
                          onError={() => setBrokenPosterIds((prev) => ({ ...prev, [r.poster_id]: true }))}
                          sx={{ width: "100%", height: "100%", objectFit: "contain" }}
                        />
                      </Box>
                    </CardActionArea>

                    <CardContent sx={{ pb: 0.5 }}>
                      <Typography sx={{ fontWeight: 800 }} noWrap>
                        {r.media.title || "(untitled)"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        <Link
                          href={`/creator/${encodeURIComponent(r.creator.creator_id)}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                        >
                          {r.creator.display_name}
                        </Link>
                      </Typography>
                    </CardContent>

                    <CardActions sx={{ mt: "auto" }}>
                      <Button variant="text" size="small" href={r.assets.full.url} target="_blank" rel="noreferrer">
                        View
                      </Button>
                      <Button variant="text" size="small" href={r.creator.home_node} target="_blank" rel="noreferrer">
                        Node
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
          </Grid>
        )}

        {items && nextCursor && (
          <Box sx={{ display: "flex", justifyContent: "center", pt: 1 }}>
            <Button
              variant="outlined"
              disabled={loadingMore}
              onClick={() => void loadMore().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </Box>
        )}
      </Stack>
    </Container>
  );
}
