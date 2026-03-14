"use client";

import { useEffect, useState } from "react";
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
import type { TvBoxsetResponse } from "@/lib/server-api";


function EpisodeGrid({ items }: { items: PosterEntry[] }) {
  return (
    <Grid container spacing={2}>
      {items.map((p) => (
        <Grid key={p.poster_id} size={{ xs: 12, sm: 6, md: 3 }}>
          <PosterCard
            poster={p}
            showCreator={false}
            aspectRatio="16 / 9"
            hideBoxSetLink
            actions={[{ label: "DETAILS", href: `/p/${encodeURIComponent(p.poster_id)}` }]}
          />
        </Grid>
      ))}
    </Grid>
  );
}

export default function TvBoxsetContent({ data }: { data: TvBoxsetResponse }) {
  const t = useTranslations("tvBoxset");

  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());

  useEffect(() => {
    const seasons = Object.keys(data.episodes_by_season)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n));

    const hashMatch = window.location.hash.match(/^#season-(\d+)$/);
    if (hashMatch) {
      setExpandedSeasons(new Set([Number(hashMatch[1])]));
    } else {
      const latest = seasons.length > 0 ? Math.max(...seasons) : null;
      if (latest !== null) setExpandedSeasons(new Set([latest]));
    }
  }, [data.episodes_by_season]);

  const toggleSeason = (season: number) => {
    setExpandedSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(season)) next.delete(season);
      else next.add(season);
      return next;
    });
  };

  const showPoster = data.show[0] ?? null;
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
            sx={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", opacity: 0.3 }}
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
              {[t("tvBoxSet"), showPoster?.creator.display_name].filter(Boolean).join(" · ")}
            </Typography>
          </Box>

          {(data.show.length > 0 || data.seasons.length > 0) && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>{t("posters")}</Typography>
              <Grid container spacing={2}>
                {[...data.show, ...data.seasons].map((p) => (
                  <Grid key={p.poster_id} size={{ xs: 6, sm: 4, md: 2 }}>
                    <PosterCard
                      poster={p}
                      showCreator={false}
                      actions={[{ label: "DETAILS", href: `/p/${encodeURIComponent(p.poster_id)}` }]}
                    />
                  </Grid>
                ))}
              </Grid>
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
                          <EpisodeGrid items={eps} />
                        </Box>
                      </Collapse>
                    </Box>
                  ))}
              </Box>
            </Box>
          )}

          {showPoster ? (
            <RelatedArtworkSection base={INDEXER_BASE_URL} links={showPoster.links || null} />
          ) : null}
        </Stack>
      </Container>
    </>
  );
}
