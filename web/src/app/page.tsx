"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import CardMedia from "@mui/material/CardMedia";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/GridLegacy";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { IndexerNodesResponse, PosterEntry, SearchResponse } from "@/lib/types";

type RecentResponse = { results: PosterEntry[]; next_cursor?: string | null };

type StatsResponse = {
  posters: number;
  nodes: { total: number; up: number };
};

const MEDIA_TYPES = ["", "movie", "show", "season", "episode", "collection"];

function PosterGrid({ items }: { items: PosterEntry[] }) {
  return (
    <Grid container spacing={2} sx={{ mt: 0.5 }}>
      {items.map((r) => (
        <Grid key={r.poster_id} item xs={12} sm={6} md={4} lg={3}>
          <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <Link href={`/p/${encodeURIComponent(r.poster_id)}`} style={{ textDecoration: "none" }}>
              <CardMedia
                component="img"
                height={320}
                image={r.assets.preview.url}
                alt={r.media.title || r.poster_id}
                sx={{ objectFit: "cover" }}
              />
            </Link>
            <CardContent sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 800 }} noWrap>
                {r.media.title || "(untitled)"}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {r.creator.display_name}
              </Typography>
            </CardContent>
            <CardActions>
              <Button size="small" variant="text" href={r.assets.full.url} target="_blank" rel="noreferrer">
                Download
              </Button>
              <Button size="small" variant="text" component={Link} href={`/creator/${encodeURIComponent(r.creator.creator_id)}`}>
                Creator
              </Button>
            </CardActions>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

export default function Home() {
  const [tmdbId, setTmdbId] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [search, setSearch] = useState<SearchResponse | null>(null);

  const [recent, setRecent] = useState<RecentResponse | null>(null);
  const [recentCursor, setRecentCursor] = useState<string | null>(null);
  const [loadingMoreRecent, setLoadingMoreRecent] = useState(false);

  const [nodes, setNodes] = useState<IndexerNodesResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);

  const [error, setError] = useState<string | null>(null);

  const searchUrl = useMemo(() => {
    const base = INDEXER_BASE_URL.replace(/\/+$/, "");
    const u = new URL(base + "/v1/search");
    if (tmdbId.trim() !== "") u.searchParams.set("tmdb_id", tmdbId.trim());
    if (q.trim() !== "") u.searchParams.set("q", q.trim());
    if (type.trim() !== "") u.searchParams.set("type", type.trim());
    u.searchParams.set("limit", "40");
    return u.toString();
  }, [tmdbId, q, type]);

  async function runSearch() {
    setError(null);
    const res = await fetch(searchUrl);
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    setSearch((await res.json()) as SearchResponse);
  }

  async function loadNodes() {
    const base = INDEXER_BASE_URL.replace(/\/+$/, "");
    const res = await fetch(base + "/v1/nodes");
    if (!res.ok) throw new Error(`nodes failed: ${res.status}`);
    setNodes((await res.json()) as IndexerNodesResponse);
  }

  async function loadStats() {
    const base = INDEXER_BASE_URL.replace(/\/+$/, "");
    const res = await fetch(base + "/v1/stats");
    if (!res.ok) throw new Error(`stats failed: ${res.status}`);
    setStats((await res.json()) as StatsResponse);
  }

  async function loadRecent() {
    const base = INDEXER_BASE_URL.replace(/\/+$/, "");
    const res = await fetch(base + "/v1/recent?limit=40");
    if (!res.ok) throw new Error(`recent failed: ${res.status}`);
    const json = (await res.json()) as RecentResponse;
    setRecent(json);
    setRecentCursor(json.next_cursor || null);
  }

  async function loadMoreRecent() {
    if (!recentCursor) return;
    setLoadingMoreRecent(true);
    setError(null);
    try {
      const base = INDEXER_BASE_URL.replace(/\/+$/, "");
      const res = await fetch(base + "/v1/recent?limit=40&cursor=" + encodeURIComponent(recentCursor));
      if (!res.ok) throw new Error(`recent failed: ${res.status}`);
      const json = (await res.json()) as RecentResponse;
      setRecent((prev) => ({
        results: [...(prev?.results || []), ...(json.results || [])],
        next_cursor: json.next_cursor || null,
      }));
      setRecentCursor(json.next_cursor || null);
    } finally {
      setLoadingMoreRecent(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadNodes(), loadRecent(), loadStats()]);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: -0.5 }}>
            OpenPoster
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Community-run poster artwork — published from creator-owned nodes.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Indexer: <code>{INDEXER_BASE_URL}</code>
          </Typography>
        </Box>

        {/* Summary/stats block (TODO from mediux-style section) */}
        {stats && (
          <Paper sx={{ p: 2.5 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between">
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Total posters
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  {stats.posters}
                </Typography>
              </Box>
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Nodes online
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  {stats.nodes.up}/{stats.nodes.total}
                </Typography>
              </Box>
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Quick links
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <Link href="/browse">Browse posters</Link>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <Link href="/onboarding">Creator onboarding</Link>
                </Typography>
              </Box>
            </Stack>
          </Paper>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        <Paper sx={{ p: 2.5 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="baseline" justifyContent="space-between">
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Search posters
              </Typography>
              <Button component={Link} href="/browse" variant="outlined" size="small">
                Browse
              </Button>
            </Stack>

            <Typography variant="body2" color="text.secondary">
              Search by TMDB id or title keyword (MVP substring match on indexed titles).
            </Typography>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField label="Title contains" value={q} onChange={(e) => setQ(e.target.value)} fullWidth />
              <TextField
                select
                label="Media type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                SelectProps={{ native: true }}
                sx={{ minWidth: 220 }}
              >
                {MEDIA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === "" ? "Any" : t}
                  </option>
                ))}
              </TextField>
              <TextField label="TMDB id" value={tmdbId} onChange={(e) => setTmdbId(e.target.value)} sx={{ minWidth: 180 }} />
              <Button onClick={() => void runSearch().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}>
                Search
              </Button>
            </Stack>

            {search && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {search.results.length} result(s)
                </Typography>
                <PosterGrid items={search.results} />
              </Box>
            )}
          </Stack>
        </Paper>

        <Paper sx={{ p: 2.5 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="baseline" justifyContent="space-between">
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Recent uploads
              </Typography>
              <Button component={Link} href="/browse" variant="outlined" size="small">
                Browse all
              </Button>
            </Stack>

            {recent ? (
              recent.results.length > 0 ? (
                <>
                  <PosterGrid items={recent.results} />
                  <Box sx={{ pt: 1 }}>
                    {recentCursor ? (
                      <Button
                        variant="outlined"
                        onClick={() => void loadMoreRecent().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}
                        disabled={loadingMoreRecent}
                      >
                        {loadingMoreRecent ? "Loading…" : "Load more"}
                      </Button>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        End of list.
                      </Typography>
                    )}
                  </Box>
                </>
              ) : (
                <Typography color="text.secondary">No recent posters.</Typography>
              )
            ) : (
              <Typography color="text.secondary">Loading…</Typography>
            )}
          </Stack>
        </Paper>

        <Paper sx={{ p: 2.5 }}>
          <Stack spacing={1.5}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Indexer node status
            </Typography>

            {nodes ? (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>URL</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Last crawled</TableCell>
                    <TableCell>Down since</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {nodes.nodes.map((n) => (
                    <TableRow key={n.url}>
                      <TableCell sx={{ wordBreak: "break-word" }}>{n.url}</TableCell>
                      <TableCell>{n.status}</TableCell>
                      <TableCell>{n.last_crawled_at || "-"}</TableCell>
                      <TableCell>{n.down_since || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Typography color="text.secondary">Loading…</Typography>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
