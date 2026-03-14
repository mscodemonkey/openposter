"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { INDEXER_BASE_URL } from "@/lib/config";
import RelatedArtworkSection from "@/components/RelatedArtworkSection";
import PosterCard from "@/components/PosterCard";
import type { PosterEntry, SearchResponse } from "@/lib/types";

function PosterGrid({ items }: { items: PosterEntry[] }) {
  return (
    <Grid container spacing={2}>
      {items.map((p) => (
        <Grid key={p.poster_id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
          <PosterCard
            poster={p}
            showCreator={false}
            actions={[{ label: "DETAILS", href: `/p/${encodeURIComponent(p.poster_id)}` }]}
          />
        </Grid>
      ))}
    </Grid>
  );
}

function MovieBoxsetReal({ collectionTmdbId }: { collectionTmdbId: string }) {
  const t = useTranslations("movieBoxset");
  const tc = useTranslations("common");
  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);
  const [collection, setCollection] = useState<PosterEntry | null | undefined>(undefined);
  const [movies, setMovies] = useState<PosterEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const u = new URL(`${base}/v1/search`);
        u.searchParams.set("tmdb_id", collectionTmdbId);
        u.searchParams.set("type", "collection");
        u.searchParams.set("limit", "5");
        const r = await fetch(u.toString());
        if (!r.ok) throw new Error(`collection search failed: ${r.status}`);
        const json = (await r.json()) as SearchResponse;
        const first = json.results[0] || null;
        setCollection(first);

        if (!first?.links || first.links.length === 0) {
          setMovies([]);
          return;
        }

        const movieLinks = first.links.filter((l) => l.media?.type === "movie" && l.href.startsWith("/p/"));
        const posterIds = movieLinks
          .map((l) => decodeURIComponent(l.href.slice("/p/".length)))
          .filter(Boolean);

        const fetched: PosterEntry[] = [];
        for (const pid of posterIds) {
          // eslint-disable-next-line no-await-in-loop
          const pr = await fetch(`${base}/v1/posters/${encodeURIComponent(pid)}`);
          if (!pr.ok) continue;
          // eslint-disable-next-line no-await-in-loop
          fetched.push((await pr.json()) as PosterEntry);
        }

        setMovies(fetched);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [base, collectionTmdbId]);

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography color="error">{error}</Typography>
      </Container>
    );
  }

  if (collection === undefined) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography color="text.secondary">{tc("loading")}</Typography>
      </Container>
    );
  }

  if (collection === null) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography color="text.secondary">{t("noBoxSet")}</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {(() => {
              const title = collection.media.title || t("movieCollection");
              return (
                title.replace(/\s+collection\s*$/i, "")
                  .replace(/\s+box\s*set\s*$/i, "")
                  .trim() || title
              );
            })()}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("movieBoxSet", { creator: collection.creator.display_name })}
          </Typography>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {t("boxSetPoster")}
          </Typography>
          <Box sx={{ mt: 1.5 }}>
            <PosterGrid items={[collection]} />
          </Box>
        </Box>

        {movies.length > 0 && (
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {t("movies")}
            </Typography>
            <Box sx={{ mt: 1.5 }}>
              <PosterGrid items={movies} />
            </Box>
          </Box>
        )}

        <RelatedArtworkSection base={base} links={collection.links || null} relFilter={(rel) => rel !== "movie"} />
      </Stack>
    </Container>
  );
}

export default function MovieBoxsetPage({
  params,
}: {
  params: Promise<{ collectionTmdbId: string }>;
}) {
  const { collectionTmdbId } = use(params);
  return <MovieBoxsetReal collectionTmdbId={collectionTmdbId} />;
}
