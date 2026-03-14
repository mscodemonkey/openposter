"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import SearchIcon from "@mui/icons-material/Search";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { PosterEntry } from "@/lib/types";

import CreatorPicker from "@/components/CreatorPicker";
import SectionedPosterView from "@/components/SectionedPosterView";

type PagedResponse = {
  results: PosterEntry[];
  next_cursor?: string | null;
};

const LOAD_LIMIT = 200;

function hasArtwork(p: PosterEntry): boolean {
  return (
    typeof p.assets?.preview?.url === "string" &&
    p.assets.preview.url.length > 0 &&
    typeof p.assets?.full?.url === "string" &&
    p.assets.full.url.length > 0
  );
}

export default function BrowsePage() {
  const t = useTranslations("browse");
  const tc = useTranslations("common");
  const [q, setQ] = useState<string>("");
  const [creatorId, setCreatorId] = useState<string>("");
  const [creatorQ, setCreatorQ] = useState<string>("");
  const [items, setItems] = useState<PosterEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);

  // Parse URL params on mount
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setCreatorId(sp.get("creator_id") || "");
      setCreatorQ(sp.get("creator_q") || "");
      setQ(sp.get("q") || "");
    } catch {
      // ignore
    }
  }, []);

  // Sync URL
  useEffect(() => {
    try {
      const sp = new URLSearchParams();
      if (creatorId) sp.set("creator_id", creatorId);
      if (creatorQ.trim()) sp.set("creator_q", creatorQ.trim());
      if (q.trim()) sp.set("q", q.trim());
      const qs = sp.toString();
      window.history.replaceState(null, "", qs ? `/browse?${qs}` : "/browse");
    } catch {
      // ignore
    }
  }, [creatorId, creatorQ, q]);

  // Fetch items
  useEffect(() => {
    const trimQ = q.trim();
    const isTmdbId = /^\d+$/.test(trimQ);

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const collected: PosterEntry[] = [];
        let cursor: string | null = null;
        do {
          let url: string;
          if (trimQ) {
            const u = new URL(`${base}/v1/search`);
            u.searchParams.set("limit", "100");
            if (isTmdbId) u.searchParams.set("tmdb_id", trimQ);
            else u.searchParams.set("q", trimQ);
            if (creatorId) u.searchParams.set("creator_id", creatorId);
            if (cursor) u.searchParams.set("cursor", cursor);
            url = u.toString();
          } else {
            const u = new URL(`${base}/v1/recent`);
            u.searchParams.set("limit", "100");
            if (creatorId) u.searchParams.set("creator_id", creatorId);
            if (cursor) u.searchParams.set("cursor", cursor);
            url = u.toString();
          }
          const r = await fetch(url);
          if (!r.ok) throw new Error(`request failed: ${r.status}`);
          const json = (await r.json()) as PagedResponse;
          collected.push(...json.results.filter(hasArtwork));
          cursor =
            collected.length < LOAD_LIMIT ? (json.next_cursor ?? null) : null;
        } while (cursor);

        setItems(collected.slice(0, LOAD_LIMIT));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, creatorId, q]);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 800 }}>
            {t("title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {tc("indexerLabel", { url: INDEXER_BASE_URL })}
          </Typography>
        </Box>

        {/* Search bar */}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            placeholder={t("searchPlaceholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
            inputProps={{ "aria-label": t("searchAriaLabel") }}
          />
          <Box sx={{ minWidth: 220 }}>
            <CreatorPicker
              indexerBaseUrl={INDEXER_BASE_URL}
              value={creatorId}
              onChange={(v) => setCreatorId(v)}
              initialOptions={[]}
              query={creatorQ}
              onQueryChange={(v) => setCreatorQ(v)}
              label={t("creatorLabel")}
            />
          </Box>
        </Stack>

        {error && <Typography color="error" role="alert">{error}</Typography>}

        <SectionedPosterView
          items={items ?? []}
          loading={loading || items === null}
          showCreator
        />
      </Stack>
    </Container>
  );
}
