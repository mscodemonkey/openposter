import { getTranslations } from "next-intl/server";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { fetchMovieBoxset } from "@/lib/server-api";
import { INDEXER_BASE_URL } from "@/lib/config";
import RelatedArtworkSection from "@/components/RelatedArtworkSection";
import PosterCard from "@/components/PosterCard";
import type { PosterEntry } from "@/lib/types";

function PosterGrid({ items }: { items: PosterEntry[] }) {
  return (
    <Grid container spacing={2}>
      {items.map((p) => (
        <Grid key={p.poster_id} size={{ xs: 6, sm: 4, md: 2 }}>
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

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {displayTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {[t("movieBoxSetLabel"), collection.creator.display_name].filter(Boolean).join(" · ")}
          </Typography>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {t("posters")}
          </Typography>
          <Box sx={{ mt: 1.5 }}>
            <PosterGrid items={[collection, ...movies]} />
          </Box>
        </Box>

        <RelatedArtworkSection
          base={INDEXER_BASE_URL}
          links={(collection.links || []).filter((l) => l.rel !== "movie")}
        />
      </Stack>
    </Container>
  );
}
