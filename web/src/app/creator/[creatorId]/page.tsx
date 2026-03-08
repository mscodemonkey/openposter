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
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/GridLegacy";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { PosterEntry } from "@/lib/types";

type PagedResponse = {
  results: PosterEntry[];
  next_cursor?: string | null;
};

type CreatorsResponse = {
  results: Array<{ creator_id: string; display_name: string | null; count: number }>;
};

export default function CreatorPage({ params }: { params: { creatorId: string } }) {
  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);
  const creatorId = params.creatorId;

  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [items, setItems] = useState<PosterEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brokenPosterIds, setBrokenPosterIds] = useState<Record<string, true>>({});

  async function loadCreatorInfo() {
    const r = await fetch(`${base}/v1/creators?limit=500`);
    if (!r.ok) throw new Error(`creators failed: ${r.status}`);
    const json = (await r.json()) as CreatorsResponse;
    const match = json.results.find((c) => c.creator_id === creatorId);
    setCreatorName(match?.display_name || null);
  }

  async function loadFirst() {
    setError(null);
    const u = new URL(`${base}/v1/by_creator`);
    u.searchParams.set("creator_id", creatorId);
    u.searchParams.set("limit", "40");

    const r = await fetch(u.toString());
    if (!r.ok) throw new Error(`by_creator failed: ${r.status}`);
    const json = (await r.json()) as PagedResponse;
    setItems(json.results);
    setNextCursor(json.next_cursor || null);
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const u = new URL(`${base}/v1/by_creator`);
      u.searchParams.set("creator_id", creatorId);
      u.searchParams.set("limit", "40");
      u.searchParams.set("cursor", nextCursor);

      const r = await fetch(u.toString());
      if (!r.ok) throw new Error(`by_creator failed: ${r.status}`);
      const json = (await r.json()) as PagedResponse;
      setItems((prev) => [...(prev || []), ...json.results]);
      setNextCursor(json.next_cursor || null);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadCreatorInfo(), loadFirst()]);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId]);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "flex-end" }} justifyContent="space-between">
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" sx={{ fontWeight: 800 }} noWrap>
              {creatorName || creatorId}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Creator id: <code>{creatorId}</code>
            </Typography>
          </Box>

          <Button
            component={Link}
            href={`/browse?creator_id=${encodeURIComponent(creatorId)}`}
            variant="outlined"
          >
            Browse posters
          </Button>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          Posters
        </Typography>

        {items === null ? (
          <Typography color="text.secondary">Loading…</Typography>
        ) : items.length === 0 ? (
          <Typography color="text.secondary">No posters.</Typography>
        ) : (
          <Grid container spacing={2}>
            {items
              .filter((r) => !brokenPosterIds[r.poster_id])
              .map((r) => (
                <Grid key={r.poster_id} item xs={12} sm={6} md={4} lg={3}>
                  <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <Link href={`/p/${encodeURIComponent(r.poster_id)}`} style={{ textDecoration: "none" }}>
                      <CardMedia
                        component="img"
                        height={360}
                        image={r.assets.preview.url}
                        alt={r.media.title || r.poster_id}
                        onError={() => setBrokenPosterIds((prev) => ({ ...prev, [r.poster_id]: true }))}
                        sx={{ objectFit: "cover" }}
                      />
                    </Link>
                    <CardContent sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 800 }} noWrap>
                        {r.media.title || "(untitled)"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {r.media.type} · TMDB {r.media.tmdb_id}
                      </Typography>
                    </CardContent>
                    <CardActions>
                      <Button size="small" variant="text" href={r.assets.full.url} target="_blank" rel="noreferrer">
                        Download
                      </Button>
                      <Button size="small" variant="text" href={r.creator.home_node} target="_blank" rel="noreferrer">
                        Node
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
          </Grid>
        )}

        <Box sx={{ pt: 1 }}>
          {nextCursor ? (
            <Button
              variant="outlined"
              onClick={() => void loadMore().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          ) : (
            <Typography variant="body2" color="text.secondary">
              End of list.
            </Typography>
          )}
        </Box>
      </Stack>
    </Container>
  );
}
