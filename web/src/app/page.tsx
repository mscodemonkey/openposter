"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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

import PosterCard from "@/components/PosterCard";
import { INDEXER_BASE_URL } from "@/lib/config";
import { POSTER_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";
import type { IndexerNodesResponse, PosterEntry, SearchResponse } from "@/lib/types";

type RecentResponse = { results: PosterEntry[]; next_cursor?: string | null };

type StatsResponse = {
  posters: number;
  nodes: { total: number; up: number };
};

const MEDIA_TYPES = ["", "movie", "show", "season", "episode", "collection"];

function PosterGrid({ items }: { items: PosterEntry[] }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP, mt: 0.5 }}>
      {items.map((r) => (
        <PosterCard
          key={r.poster_id}
          poster={r}
          onClick={() => { window.location.href = `/p/${encodeURIComponent(r.poster_id)}`; }}
        />
      ))}
    </Box>
  );
}

export default function Home() {
  const t = useTranslations("home");
  const tc = useTranslations("common");

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
            {t("title")}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {t("tagline")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {tc("indexerLabel", { url: INDEXER_BASE_URL })}
          </Typography>
        </Box>

        {/* Summary/stats block */}
        {stats && (
          <Paper sx={{ p: 2.5 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between">
              <Box>
                <Typography variant="overline" color="text.secondary">
                  {t("totalPosters")}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  {stats.posters}
                </Typography>
              </Box>
              <Box>
                <Typography variant="overline" color="text.secondary">
                  {t("nodesOnline")}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  {stats.nodes.up}/{stats.nodes.total}
                </Typography>
              </Box>
              <Box>
                <Typography variant="overline" color="text.secondary">
                  {t("quickLinks")}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <Link href="/onboarding">{t("creatorOnboarding")}</Link>
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
                {t("searchPosters")}
              </Typography>
            </Stack>

            <Typography variant="body2" color="text.secondary">
              {t("searchHint")}
            </Typography>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField label={t("titleContains")} value={q} onChange={(e) => setQ(e.target.value)} fullWidth />
              <TextField
                select
                label={t("mediaType")}
                value={type}
                onChange={(e) => setType(e.target.value)}
                SelectProps={{ native: true }}
                sx={{ minWidth: 220 }}
              >
                {MEDIA_TYPES.map((mt) => (
                  <option key={mt} value={mt}>
                    {mt === "" ? t("any") : mt}
                  </option>
                ))}
              </TextField>
              <TextField label={t("tmdbId")} value={tmdbId} onChange={(e) => setTmdbId(e.target.value)} sx={{ minWidth: 180 }} />
              <Button onClick={() => void runSearch().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}>
                {tc("search")}
              </Button>
            </Stack>

            {search && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {t("resultCount", { count: search.results.length })}
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
                {t("recentUploads")}
              </Typography>
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
                        {loadingMoreRecent ? tc("loadingMore") : tc("loadMore")}
                      </Button>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {tc("endOfList")}
                      </Typography>
                    )}
                  </Box>
                </>
              ) : (
                <Typography color="text.secondary">{t("noRecentPosters")}</Typography>
              )
            ) : (
              <Typography color="text.secondary">{tc("loading")}</Typography>
            )}
          </Stack>
        </Paper>

        <Paper sx={{ p: 2.5 }}>
          <Stack spacing={1.5}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {t("indexerNodeStatus")}
            </Typography>

            {nodes ? (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t("url")}</TableCell>
                    <TableCell>{t("status")}</TableCell>
                    <TableCell>{t("lastCrawled")}</TableCell>
                    <TableCell>{t("downSince")}</TableCell>
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
              <Typography color="text.secondary">{tc("loading")}</Typography>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
