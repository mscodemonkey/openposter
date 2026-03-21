"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Collapse from "@mui/material/Collapse";
import Container from "@mui/material/Container";

import { POSTER_GRID_COLS, EPISODE_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Slide from "@mui/material/Slide";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { INDEXER_BASE_URL } from "@/lib/config";
import PlexApplyButton from "@/components/PlexApplyButton";
import PlexLogo from "@/components/PlexLogo";
import RelatedArtworkSection from "@/components/RelatedArtworkSection";
import PosterCard from "@/components/PosterCard";
import { applyToPlexPoster, getPlexStatus, type PlexApplyRequest, type PlexStatus } from "@/lib/plex";
import { loadCreatorConnection } from "@/lib/storage";
import type { PosterEntry } from "@/lib/types";
import type { TvBoxsetResponse } from "@/lib/server-api";


// ─── Per-card overlay: checkbox + MoreVert menu ──────────────────────────────

function CardOverlay({
  plexReq,
  isSelected,
  onToggle,
  plexConnected,
}: {
  plexReq: PlexApplyRequest | null;
  isSelected: boolean;
  onToggle: () => void;
  plexConnected: boolean;
}) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  async function handleAddToPlex() {
    setAnchor(null);
    if (!plexReq) return;
    const conn = loadCreatorConnection();
    if (!conn) return;
    await applyToPlexPoster(conn.nodeUrl, conn.adminToken, plexReq).catch(() => undefined);
  }

  return (
    <>
      {/* Checkbox — bottom-right */}
      <Box
        className="card-cb"
        sx={{ position: "absolute", bottom: 4, right: 4, transition: "opacity 0.15s" }}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
      >
        <Checkbox
          size="small"
          checked={isSelected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          sx={{ p: 0.25, bgcolor: "rgba(0,0,0,0.4)", borderRadius: 1 }}
        />
      </Box>

      {/* MoreVert — top-right */}
      {(plexConnected && plexReq) && (
        <Box
          className="card-menu"
          sx={{ position: "absolute", top: 4, right: 4, transition: "opacity 0.15s" }}
          onClick={(e) => e.stopPropagation()}
        >
          <IconButton
            size="small"
            sx={{ bgcolor: "rgba(0,0,0,0.6)", color: "white", "&:hover": { bgcolor: "rgba(0,0,0,0.8)" }, p: 0.5 }}
            onClick={(e) => setAnchor(e.currentTarget)}
            aria-label="actions"
          >
            <MoreVertIcon sx={{ fontSize: "1rem" }} />
          </IconButton>
          <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
            <MenuItem onClick={() => void handleAddToPlex()}>
              <PlexLogo height={14} />
              <Typography variant="body2" sx={{ ml: 1 }}>Add to Plex</Typography>
            </MenuItem>
          </Menu>
        </Box>
      )}
    </>
  );
}

// ─── Selectable card wrapper ──────────────────────────────────────────────────

function SelectableCard({
  poster,
  plexReq,
  isSelected,
  onToggle,
  plexConnected,
  aspectRatio = "2 / 3",
}: {
  poster: PosterEntry;
  plexReq: PlexApplyRequest | null;
  isSelected: boolean;
  onToggle: () => void;
  plexConnected: boolean;
  aspectRatio?: string;
}) {
  return (
    <Box
      sx={{
        position: "relative",
        outline: isSelected ? "2px solid" : "none",
        outlineColor: "primary.main",
        borderRadius: 1,
        "& .card-cb": { opacity: isSelected ? 1 : 0 },
        "& .card-menu": { opacity: 0 },
        "&:hover .card-cb": { opacity: 1 },
        "&:hover .card-menu": { opacity: 1 },
      }}
    >
      <PosterCard
        poster={poster}
        aspectRatio={aspectRatio}
        actions={[{ label: "DETAILS", href: `/p/${encodeURIComponent(poster.poster_id)}` }]}
      />
      <CardOverlay
        plexReq={plexReq}
        isSelected={isSelected}
        onToggle={onToggle}
        plexConnected={plexConnected}
      />
    </Box>
  );
}


export default function TvBoxsetContent({ data }: { data: TvBoxsetResponse }) {
  const t = useTranslations("tvBoxset");

  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [plexStatus, setPlexStatus] = useState<PlexStatus | null>(null);

  useEffect(() => {
    const conn = loadCreatorConnection();
    if (!conn) { setPlexStatus({ connected: false }); return; }
    getPlexStatus(conn.nodeUrl, conn.adminToken)
      .then(setPlexStatus)
      .catch(() => setPlexStatus({ connected: false }));
  }, []);

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
  const showTmdbId = showPoster?.media.tmdb_id ?? null;
  const plexConnected = plexStatus?.connected === true;

  // ── Build plex request map for every selectable poster ──────────────────────
  const plexReqMap = new Map<string, PlexApplyRequest>();

  for (const p of data.show) {
    if (p.media.tmdb_id != null)
      plexReqMap.set(p.poster_id, { imageUrl: p.assets.full.url, tmdbId: p.media.tmdb_id, mediaType: "show" });
  }
  for (const p of data.seasons) {
    if (showTmdbId != null)
      plexReqMap.set(p.poster_id, {
        imageUrl: p.assets.full.url,
        tmdbId: p.media.tmdb_id ?? showTmdbId,
        mediaType: "season",
        showTmdbId,
        seasonNumber: p.media.season_number ?? undefined,
      });
  }
  for (const eps of Object.values(data.episodes_by_season)) {
    for (const p of eps) {
      if (p.media.episode_number != null && showTmdbId != null)
        plexReqMap.set(p.poster_id, {
          imageUrl: p.assets.full.url,
          tmdbId: p.media.tmdb_id ?? showTmdbId,
          mediaType: "episode",
          showTmdbId,
          seasonNumber: p.media.season_number ?? undefined,
          episodeNumber: p.media.episode_number,
        });
    }
  }

  function toggleSelect(posterId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(posterId) ? next.delete(posterId) : next.add(posterId);
      return next;
    });
  }

  function toggleSeasonSelection(episodeIds: string[]) {
    const allSelected = episodeIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) episodeIds.forEach((id) => next.delete(id));
      else episodeIds.forEach((id) => next.add(id));
      return next;
    });
  }

  // ── "Add to Plex" for bottom bar ────────────────────────────────────────────
  const selectedPlexItems = [...selected]
    .map((id) => plexReqMap.get(id))
    .filter((r): r is PlexApplyRequest => r != null);

  const plexItems: PlexApplyRequest[] = [
    ...data.show.filter((p) => p.media.tmdb_id != null).map((p) => ({
      imageUrl: p.assets.full.url, tmdbId: p.media.tmdb_id!, mediaType: "show",
    })),
    ...data.seasons.filter(() => showTmdbId != null).map((p) => ({
      imageUrl: p.assets.full.url, tmdbId: p.media.tmdb_id ?? showTmdbId!, mediaType: "season",
      showTmdbId: showTmdbId!, seasonNumber: p.media.season_number ?? undefined,
    })),
  ];

  const backdropUrl = data.backdrops?.[0]?.assets.full.url ?? data.show[0]?.assets.full.url ?? null;

  return (
    <>
      {backdropUrl && (
        <Box sx={{ position: "fixed", top: 0, left: 0, right: 0, height: "75vh", zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
          <Box component="img" src={backdropUrl} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", opacity: 0.3 }} />
          <Box sx={{ position: "absolute", inset: 0, background: (theme) => `linear-gradient(to bottom, transparent 40%, ${theme.palette.background.default} 95%)` }} />
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
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>{t("posters")}</Typography>
                {plexItems.length > 0 && <PlexApplyButton items={plexItems} />}
              </Stack>
              <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                {[...data.show, ...data.seasons].map((p) => (
                  <Box key={p.poster_id}>
                    <SelectableCard
                      poster={p}
                      plexReq={plexReqMap.get(p.poster_id) ?? null}
                      isSelected={selected.has(p.poster_id)}
                      onToggle={() => toggleSelect(p.poster_id)}
                      plexConnected={plexConnected}
                    />
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {Object.keys(data.episodes_by_season).length > 0 && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>{t("episodeCards")}</Typography>
              <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
                {Object.entries(data.episodes_by_season)
                  .map(([season, eps]) => ({ season: Number(season), eps }))
                  .filter((x) => Number.isFinite(x.season))
                  .sort((a, b) => b.season - a.season)
                  .map(({ season, eps }) => {
                    const episodeIds = eps.filter((p) => p.media.episode_number != null).map((p) => p.poster_id);
                    const allEpsSelected = episodeIds.length > 0 && episodeIds.every((id) => selected.has(id));
                    const someEpsSelected = episodeIds.some((id) => selected.has(id));
                    const paddedSeason = String(season).padStart(2, "0");
                    return (
                      <Box key={season} id={`season-${season}`}>
                        <Box
                          sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", py: 1, px: 0, "&:hover": { color: "primary.main" } }}
                          onClick={() => toggleSeason(season)}
                        >
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Checkbox
                              size="small"
                              checked={allEpsSelected}
                              indeterminate={someEpsSelected && !allEpsSelected}
                              onClick={(e) => { e.stopPropagation(); toggleSeasonSelection(episodeIds); }}
                              onChange={() => {}}
                              sx={{ p: 0 }}
                            />
                            <Typography sx={{ fontWeight: 800 }}>
                              {t("seasonHeading", { number: paddedSeason })}
                            </Typography>
                            {showTmdbId != null && (
                              <span onClick={(e) => e.stopPropagation()}>
                                <PlexApplyButton
                                  items={eps.filter((p) => p.media.episode_number != null).map((p) => ({
                                    imageUrl: p.assets.full.url,
                                    tmdbId: p.media.tmdb_id ?? showTmdbId,
                                    mediaType: "episode",
                                    showTmdbId,
                                    seasonNumber: p.media.season_number ?? season,
                                    episodeNumber: p.media.episode_number!,
                                  }))}
                                />
                              </span>
                            )}
                          </Stack>
                          <IconButton
                            size="small"
                            aria-label={t("seasonHeading", { number: paddedSeason })}
                            sx={{ transform: expandedSeasons.has(season) ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s" }}
                          >
                            <ExpandMoreIcon />
                          </IconButton>
                        </Box>
                        <Collapse in={expandedSeasons.has(season)} timeout="auto" unmountOnExit>
                          <Box sx={{ mt: 1.5 }}>
                            <Box sx={{ display: "grid", gridTemplateColumns: EPISODE_GRID_COLS, gap: GRID_GAP }}>
                              {eps.map((p) => (
                                <Box key={p.poster_id}>
                                  <SelectableCard
                                    poster={p}
                                    plexReq={plexReqMap.get(p.poster_id) ?? null}
                                    isSelected={selected.has(p.poster_id)}
                                    onToggle={() => toggleSelect(p.poster_id)}
                                    plexConnected={plexConnected}
                                    aspectRatio="16 / 9"
                                  />
                                </Box>
                              ))}
                            </Box>
                          </Box>
                        </Collapse>
                      </Box>
                    );
                  })}
              </Box>
            </Box>
          )}

          {showPoster ? <RelatedArtworkSection base={INDEXER_BASE_URL} links={showPoster.links || null} /> : null}
        </Stack>
      </Container>

      {/* Bottom selection bar */}
      <Slide direction="up" in={selected.size > 0} mountOnEnter unmountOnExit>
        <Box sx={{ position: "fixed", bottom: 24, left: 0, right: 0, zIndex: 1200, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <Paper elevation={8} sx={{ px: 2, py: 1, borderRadius: 3, display: "flex", alignItems: "center", gap: 1.5, pointerEvents: "auto" }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{selected.size} selected</Typography>
            {plexConnected && selectedPlexItems.length > 0 && (
              <PlexApplyButton items={selectedPlexItems} />
            )}
            <Button size="small" onClick={() => setSelected(new Set())} sx={{ minWidth: 0, px: 1 }}>
              Clear
            </Button>
          </Paper>
        </Box>
      </Slide>
    </>
  );
}
