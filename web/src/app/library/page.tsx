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
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/GridLegacy";

import { INDEXER_BASE_URL } from "@/lib/config";
import { loadCreatorConnection } from "@/lib/storage";
import type { PosterEntry, SearchResponse } from "@/lib/types";

export default function LibraryPage() {
  const conn = loadCreatorConnection();
  const baseUrl = useMemo(() => conn?.nodeUrl?.replace(/\/+$/, "") || "", [conn]);

  const [autoCheck, setAutoCheck] = useState(false);
  const [items, setItems] = useState<PosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indexed, setIndexed] = useState<Record<string, "yes" | "no" | "checking">>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadFirstPage() {
    if (!conn) {
      setItems([]);
      setNextCursor(null);
      return;
    }
    setError(null);
    const r = await fetch(baseUrl + "/v1/posters?limit=50");
    if (!r.ok) throw new Error(`list failed: ${r.status}`);
    const json = (await r.json()) as SearchResponse;
    setItems(json.results);
    setNextCursor(json.next_cursor);
  }

  async function loadMore() {
    if (!conn) return;
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const r = await fetch(baseUrl + "/v1/posters?limit=50&cursor=" + encodeURIComponent(nextCursor));
      if (!r.ok) throw new Error(`list failed: ${r.status}`);
      const json = (await r.json()) as SearchResponse;
      setItems((prev) => [...(prev || []), ...json.results]);
      setNextCursor(json.next_cursor);

      if (autoCheck && json.results.length > 0) {
        void checkAllIndexed(json.results);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function checkIndexed(p: PosterEntry) {
    if (!p.media.tmdb_id) {
      setIndexed((m) => ({ ...m, [p.poster_id]: "no" }));
      return;
    }
    setIndexed((m) => ({ ...m, [p.poster_id]: "checking" }));

    const url = new URL(INDEXER_BASE_URL.replace(/\/+$/, "") + "/v1/search");
    url.searchParams.set("tmdb_id", String(p.media.tmdb_id));
    if (p.media.type) url.searchParams.set("type", p.media.type);

    const r = await fetch(url.toString());
    if (!r.ok) throw new Error(`indexer search failed: ${r.status}`);
    const json = (await r.json()) as SearchResponse;
    const found = json.results.some((x) => x.poster_id === p.poster_id);
    setIndexed((m) => ({ ...m, [p.poster_id]: found ? "yes" : "no" }));
  }

  async function checkAllIndexed(list: PosterEntry[]) {
    const concurrency = 4;
    const queue = list.filter((p) => !indexed[p.poster_id]);

    async function worker() {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const p = queue.shift();
        if (!p) return;
        try {
          // eslint-disable-next-line no-await-in-loop
          await checkIndexed(p);
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  }

  async function del(posterId: string) {
    if (!conn) return;
    setError(null);
    const r = await fetch(baseUrl + `/v1/admin/posters/${encodeURIComponent(posterId)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${conn.adminToken}` },
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) {
      setError(`delete failed: ${r.status} ${JSON.stringify(json)}`);
      return;
    }
    await loadFirstPage();
  }

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setAutoCheck(sp.get("check") === "1");
    } catch {
      setAutoCheck(false);
    }

    void loadFirstPage().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoCheck) return;
    if (!items || items.length === 0) return;
    void checkAllIndexed(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheck, items]);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            My library
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Lists posters from your connected node via <code>/v1/posters</code>.
          </Typography>
        </Box>

        {!conn ? (
          <Alert severity="warning">
            Not connected. Go to <Link href="/settings">Settings</Link> first.
          </Alert>
        ) : (
          <Alert severity="success">
            Connected node: <code>{baseUrl}</code>
          </Alert>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {items === null ? (
          <Typography color="text.secondary">Loading…</Typography>
        ) : items.length === 0 ? (
          <Typography color="text.secondary">No posters found.</Typography>
        ) : (
          <>
            <Paper sx={{ p: 2 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between" alignItems={{ sm: "center" }}>
                <Button
                  variant="outlined"
                  onClick={() => void checkAllIndexed(items).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}
                >
                  Check all indexed
                </Button>
                <Typography variant="body2" color="text.secondary">
                  Indexer: <code>{INDEXER_BASE_URL}</code>
                </Typography>
              </Stack>
            </Paper>

            <Grid container spacing={2}>
              {items.map((p) => (
                <Grid key={p.poster_id} item xs={12} sm={6} md={4} lg={3}>
                  <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <Link href={`/p/${encodeURIComponent(p.poster_id)}`} style={{ textDecoration: "none" }}>
                      <CardMedia
                        component="img"
                        height={360}
                        image={p.assets.preview.url}
                        alt={p.media.title || p.poster_id}
                        sx={{ objectFit: "cover" }}
                      />
                    </Link>
                    <CardContent sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 800 }} noWrap>
                        {p.media.title || "(untitled)"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {p.media.type} · TMDB {p.media.tmdb_id}
                      </Typography>
                    </CardContent>
                    <CardActions sx={{ display: "flex", justifyContent: "space-between" }}>
                      <Button size="small" variant="text" href={p.assets.full.url} target="_blank" rel="noreferrer">
                        Download
                      </Button>

                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => void checkIndexed(p).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}
                        disabled={indexed[p.poster_id] === "checking"}
                      >
                        {indexed[p.poster_id] === "checking"
                          ? "Checking…"
                          : indexed[p.poster_id]
                          ? `Indexed: ${indexed[p.poster_id]}`
                          : "Check indexed"}
                      </Button>

                      {conn && (
                        <Button color="error" size="small" variant="outlined" onClick={() => void del(p.poster_id)}>
                          Delete
                        </Button>
                      )}
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Box sx={{ pt: 1 }}>
              {nextCursor ? (
                <Button variant="outlined" onClick={() => void loadMore().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  End of list.
                </Typography>
              )}
            </Box>
          </>
        )}
      </Stack>
    </Container>
  );
}
