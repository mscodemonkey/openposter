"use client";

// ─── AltArtworkDrawer ─────────────────────────────────────────────────────────
// Shared right-side Drawer for browsing alternative artwork (posters, backdrops,
// episode thumbnails). Used by TvShowMediaDetail, MovieMediaDetail, and
// EpisodeMediaDetail. Partitions `posters` into "from subscriptions" and "others"
// automatically based on the caller's subscription list.

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import CloseIcon from "@mui/icons-material/Close";

import OPLogo from "@/components/OPLogo";
import AltArtworkCard, { type AltArtworkChip } from "@/components/AltArtworkCard";
import type { PosterEntry } from "@/lib/types";
import type { ThemeSubscription } from "@/lib/subscriptions";
import { GRID_GAP } from "@/lib/grid-sizes";

export interface AltArtworkDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Primary heading — usually the item title (show name, movie title, etc.) */
  title: string;
  /** Secondary line shown in uppercase below the title (e.g. "SEASON 01 · POSTERS") */
  subtitle?: string;
  /**
   * Posters to display. The parent is responsible for pre-filtering out the
   * already-applied poster so it doesn't appear in the drawer.
   */
  posters: PosterEntry[];
  loading: boolean;
  /** Pass false to show a "No TMDB ID" warning instead of content. */
  hasTmdbId: boolean;
  /** Controls AltArtworkCard aspect ratio (16/9 vs 2/3) and default button label. */
  isBackdrop: boolean;
  /** Override aspect ratio passed to each card (e.g. "3 / 1" for logos). Takes precedence over isBackdrop. */
  aspectRatio?: string;
  /** CSS grid-template-columns value for the poster grid (e.g. POSTER_GRID_COLS). */
  gridCols: string;
  chip: AltArtworkChip;
  subs: ThemeSubscription[];
  appliedIds: Set<string>;
  applyingId: string | null;
  /** Header for the "others" section. Omit to show a flat grid with no section headers. */
  othersLabel?: string;
  /** Override the apply button label on every card (e.g. "Use thumbnail"). */
  buttonLabel?: string;
  onApply: (p: PosterEntry) => void;
}

export default function AltArtworkDrawer({
  open,
  onClose,
  title,
  subtitle,
  posters,
  loading,
  hasTmdbId,
  isBackdrop,
  aspectRatio: aspectRatioProp,
  gridCols,
  chip,
  subs,
  appliedIds,
  applyingId,
  othersLabel,
  buttonLabel,
  onApply,
}: AltArtworkDrawerProps) {
  const t = useTranslations("myMedia");

  const subscribedThemeIds = useMemo(() => new Set(subs.map((s) => s.themeId)), [subs]);
  const subscribedCreatorIds = useMemo(() => new Set(subs.map((s) => s.creatorId)), [subs]);

  const fromSubs = useMemo(
    () =>
      posters.filter(
        (p) =>
          (p.media.theme_id && subscribedThemeIds.has(p.media.theme_id)) ||
          subscribedCreatorIds.has(p.creator.creator_id),
      ),
    [posters, subscribedThemeIds, subscribedCreatorIds],
  );

  const others = useMemo(
    () => posters.filter((p) => !fromSubs.includes(p)),
    [posters, fromSubs],
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      disableRestoreFocus
      PaperProps={{ sx: { width: { xs: "100vw", sm: 520 }, display: "flex", flexDirection: "column" } }}
      slotProps={{ backdrop: { sx: { bgcolor: "transparent" } } }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          py: 2,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
          <OPLogo size={28} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" noWrap sx={{ lineHeight: 1.2 }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ ml: 1, flexShrink: 0 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Scrollable content */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5 }}>
        {!hasTmdbId ? (
          <Alert severity="info">No TMDB ID — artwork lookup unavailable for this item.</Alert>
        ) : loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress />
          </Stack>
        ) : posters.length === 0 ? (
          <Typography color="text.secondary">{t("noAlternatives")}</Typography>
        ) : fromSubs.length === 0 ? (
          // No subscriptions match — flat grid, no section headers
          <Box sx={{ display: "grid", gridTemplateColumns: gridCols, gap: GRID_GAP }}>
            {others.map((p) => (
              <AltArtworkCard
                key={p.poster_id}
                poster={p}
                subs={subs}
                applyingId={applyingId}
                appliedIds={appliedIds}
                chip={chip}
                isBackdrop={isBackdrop}
                aspectRatio={aspectRatioProp}
                buttonLabel={buttonLabel}
                onApply={onApply}
              />
            ))}
          </Box>
        ) : (
          // Sectioned: "From subscriptions" first, then the rest
          <Stack spacing={3}>
            <Box>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ display: "block", mb: 1, fontSize: "0.65rem", letterSpacing: 1.5 }}
              >
                {t("fromSubscriptions")}
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: gridCols, gap: GRID_GAP }}>
                {fromSubs.map((p) => (
                  <AltArtworkCard
                    key={p.poster_id}
                    poster={p}
                    subs={subs}
                    applyingId={applyingId}
                    appliedIds={appliedIds}
                    chip={chip}
                    isBackdrop={isBackdrop}
                    buttonLabel={buttonLabel}
                    onApply={onApply}
                  />
                ))}
              </Box>
            </Box>
            {others.length > 0 && (
              <Box>
                {othersLabel && (
                  <Typography
                    variant="overline"
                    color="text.secondary"
                    sx={{ display: "block", mb: 1, fontSize: "0.65rem", letterSpacing: 1.5 }}
                  >
                    {othersLabel}
                  </Typography>
                )}
                <Box sx={{ display: "grid", gridTemplateColumns: gridCols, gap: GRID_GAP }}>
                  {others.map((p) => (
                    <AltArtworkCard
                      key={p.poster_id}
                      poster={p}
                      subs={subs}
                      applyingId={applyingId}
                      appliedIds={appliedIds}
                      chip={chip}
                      isBackdrop={isBackdrop}
                      buttonLabel={buttonLabel}
                      onApply={onApply}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}
