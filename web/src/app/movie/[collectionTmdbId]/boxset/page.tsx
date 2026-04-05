import { getTranslations } from "next-intl/server";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { type PlexApplyRequest } from "@/lib/plex";

import { fetchMovieBoxset } from "@/lib/server-api";
import MovieBoxsetBackdrop from "./MovieBoxsetBackdrop";
import { INDEXER_BASE_URL } from "@/lib/config";
import PlexApplyButton from "@/components/PlexApplyButton";
import RelatedArtworkSection from "@/components/RelatedArtworkSection";
import PosterCard from "@/components/PosterCard";
import SubscribeEntityButton from "@/components/SubscribeEntityButton";
import type { PosterEntry } from "@/lib/types";

function PosterGrid({ items }: { items: PosterEntry[] }) {
  return (
    <Grid container spacing={2}>
      {items.map((p) => (
        <Grid key={p.poster_id} size={{ xs: 6, sm: 4, md: 2 }}>
          <PosterCard
            poster={p}
            actions={[{ label: "DETAILS", href: `/p/${encodeURIComponent(p.poster_id)}` }]}
          />
        </Grid>
      ))}
    </Grid>
  );
}

export default async function MovieBoxsetPage({
  params,
}: {
  params: Promise<{ collectionTmdbId: string }>;
}) {
  const { collectionTmdbId } = await params;
  const t = await getTranslations("movieBoxset");

  const { collection, movies } = await fetchMovieBoxset(collectionTmdbId).catch(() => ({
    collection: null,
    movies: [],
  }));

  if (!collection) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography color="text.secondary">{t("noBoxSet")}</Typography>
      </Container>
    );
  }

  const title = collection.media.title || t("movieCollection");
  const displayTitle =
    title
      .replace(/\s+collection\s*$/i, "")
      .replace(/\s+box\s*set\s*$/i, "")
      .trim() || title;

  const backdropUrl = collection.assets.full.url ?? null;

  // Derive unique themes and languages from all posters in the boxset
  const themeMap = new Map<string, { themeId: string; themeName: string; nodeBase: string; creatorName: string }>();
  for (const p of [collection, ...movies]) {
    if (p.media.theme_id && !themeMap.has(p.media.theme_id)) {
      themeMap.set(p.media.theme_id, {
        themeId: p.media.theme_id,
        themeName: p.media.theme_id,
        nodeBase: p.creator.home_node ?? "",
        creatorName: p.creator.display_name,
      });
    }
  }
  const uniqueThemes = [...themeMap.values()];
  const languageSet = new Set(
    ([collection, ...movies] as PosterEntry[])
      .map((p) => p.language ?? null)
      .filter((l): l is string => l !== null)
  );
  const uniqueLanguages = [...languageSet];

  return (
    <>
      {backdropUrl && <MovieBoxsetBackdrop url={backdropUrl} />}
    <Container maxWidth="lg" sx={{ py: 3, position: "relative", zIndex: 1 }}>
      <Stack spacing={2.5}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {displayTitle}
            </Typography>
            <SubscribeEntityButton
              entityType="collection"
              entityId={collectionTmdbId}
              entityName={displayTitle}
              availableThemes={uniqueThemes}
              availableLanguages={uniqueLanguages}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {[t("movieBoxSetLabel"), collection.creator.display_name].filter(Boolean).join(" · ")}
          </Typography>
        </Box>

        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {t("posters")}
            </Typography>
            <PlexApplyButton
              items={([collection, ...movies] as typeof movies)
                .filter((p): p is typeof p & { media: { tmdb_id: number } } => p.media.tmdb_id != null)
                .map((p): PlexApplyRequest => ({
                  imageUrl: p.assets.full.url,
                  tmdbId: p.media.tmdb_id,
                  mediaType: p.media.type,
                }))}
            />
          </Stack>
          <PosterGrid items={[collection, ...movies]} />
        </Box>

        <RelatedArtworkSection
          base={INDEXER_BASE_URL}
          links={(collection.links || []).filter((l) => l.rel !== "movie")}
        />
      </Stack>
    </Container>
    </>
  );
}
