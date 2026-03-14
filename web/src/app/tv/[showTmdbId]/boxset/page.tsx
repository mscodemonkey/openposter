"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { INDEXER_BASE_URL } from "@/lib/config";
import RelatedArtworkSection from "@/components/RelatedArtworkSection";
import PosterCard from "@/components/PosterCard";
import type { PosterEntry } from "@/lib/types";

type TvBoxsetResponse = {
  show_tmdb_id: string;
  show: PosterEntry[];
  seasons: PosterEntry[];
  episodes_by_season: Record<string, PosterEntry[]>;
  backdrops?: PosterEntry[];
};

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

function EpisodeGrid({ items, showTitle }: { items: PosterEntry[]; showTitle?: string }) {
  return (
    <Grid container spacing={2}>
      {items.map((p) => (
        <Grid key={p.poster_id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
          <PosterCard
            poster={p}
            showCreator={false}
            aspectRatio="16 / 9"
            showTitle={showTitle}
            actions={[{ label: "DETAILS", href: `/p/${encodeURIComponent(p.poster_id)}` }]}
          />
        </Grid>
      ))}
    </Grid>
  );
}

function TvBoxsetReal({ showTmdbId }: { showTmdbId: string }) {
  const t = useTranslations("tvBoxset");
  const tc = useTranslations("common");
  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);

  const [data, setData] = useState<TvBoxsetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());

  const toggleSeason = (season: number) => {
    const newExpanded = new Set(expandedSeasons);
    if (newExpanded.has(season)) {
      newExpanded.delete(season);
    } else {
      newExpanded.add(season);
    }
    setExpandedSeasons(newExpanded);
  };

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`${base}/v1/tv_boxset/${encodeURIComponent(showTmdbId)}`);
        if (!r.ok) throw new Error(`tv_boxset failed: ${r.status}`);
        const json = (await r.json()) as TvBoxsetResponse;
        setData(json);

        const seasons = Object.keys(json.episodes_by_season)
          .map((k) => Number(k))
          .filter((n) => Number.isFinite(n));

        // Deep-link: #season-N expands only that season
        const hashMatch = window.location.hash.match(/^#season-(\d+)$/);
        if (hashMatch) {
          setExpandedSeasons(new Set([Number(hashMatch[1])]));
        } else {
          // Default: open the latest season
          const latest = seasons.length > 0 ? Math.max(...seasons) : null;
          if (latest !== null) setExpandedSeasons(new Set([latest]));
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [base, showTmdbId]);

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography color="error">{error}</Typography>
      </Container>
    );
  }

  if (!data) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography color="text.secondary">{tc("loading")}</Typography>
      </Container>
    );
  }

  const showPoster = data.show[0] || null;
  // Backdrop: explicit backdrop poster first, then fall back to show poster full image
  const backdropUrl =
    data.backdrops?.[0]?.assets.full.url ??
    data.show[0]?.assets.full.url ??
    null;

  return (
    <>
      {backdropUrl && (
        <Box
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: "60vh",
            zIndex: 0,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <Box
            component="img"
            src={backdropUrl}
            alt=""
            sx={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", opacity: 0.6 }}
          />
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              background: (theme) =>
                `linear-gradient(to bottom, transparent 40%, ${theme.palette.background.default} 95%)`,
            }}
          />
        </Box>
      )}
      <Container maxWidth="lg" sx={{ py: 3, position: "relative", zIndex: 1 }}>
        <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {showPoster?.media.title || t("tvBoxSet")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("tvShowLabel")}
            {showPoster?.media.year ? ` | ${showPoster.media.year}` : ""}
            {showPoster?.creator.display_name ? ` | ${showPoster.creator.display_name}` : ""}
          </Typography>
        </Box>

        {data.show.length > 0 && (
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {t("mainShowPosters")}
            </Typography>
            <Box sx={{ mt: 1.5 }}>
              <PosterGrid items={data.show} />
            </Box>
          </Box>
        )}

        {data.seasons.length > 0 && (
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {t("seasonPosters")}
            </Typography>
            <Box sx={{ mt: 1.5 }}>
              <PosterGrid items={data.seasons} />
            </Box>
          </Box>
        )}

        {Object.keys(data.episodes_by_season).length > 0 && (
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {t("episodeCards")}
            </Typography>
            <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
              {Object.entries(data.episodes_by_season)
                .map(([season, eps]) => ({ season: Number(season), eps }))
                .filter((x) => Number.isFinite(x.season))
                .sort((a, b) => b.season - a.season)
                .map(({ season, eps }) => (
                  <Box key={season} id={`season-${season}`}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        py: 1,
                        px: 0,
                        "&:hover": { color: "primary.main" },
                      }}
                      onClick={() => toggleSeason(season)}
                    >
                      <Typography sx={{ fontWeight: 800 }}>{t("seasonHeading", { number: season })}</Typography>
                      <IconButton
                        size="small"
                        aria-label={t("seasonHeading", { number: season })}
                        sx={{
                          transform: expandedSeasons.has(season) ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.3s",
                        }}
                      >
                        <ExpandMoreIcon />
                      </IconButton>
                    </Box>
                    <Collapse in={expandedSeasons.has(season)} timeout="auto" unmountOnExit>
                      <Box sx={{ mt: 1.5 }}>
                        <EpisodeGrid items={eps} showTitle={showPoster?.media.title} />
                      </Box>
                    </Collapse>
                  </Box>
                ))}
            </Box>
          </Box>
        )}

          {showPoster ? <RelatedArtworkSection base={base} links={showPoster.links || null} /> : null}
        </Stack>
      </Container>
    </>
  );
}

export default function TvBoxsetPage({
  params,
}: {
  params: Promise<{ showTmdbId: string }>;
}) {
  const { showTmdbId } = use(params);
  return <TvBoxsetReal showTmdbId={showTmdbId} />;
}
