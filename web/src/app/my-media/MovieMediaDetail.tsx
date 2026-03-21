"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";

import { POSTER_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MoreVertIcon from "@mui/icons-material/MoreVert";

import ArtworkMetadataTooltip from "@/components/ArtworkMetadataTooltip";
import PosterCard from "@/components/PosterCard";
import PosterSubscribeMenu from "@/components/PosterSubscribeMenu";
import type { PosterEntry } from "@/lib/types";
import type { ThemeSubscription } from "@/lib/subscriptions";
import { getSubscriptions } from "@/lib/subscriptions";
import { applyToPlexPoster } from "@/lib/plex";
import { fetchPosterFromNode, getArtworkSettings, getTrackedArtwork, untrackArtwork } from "@/lib/artwork-tracking";
import type { TrackedArtwork } from "@/lib/artwork-tracking";
import { thumbUrl } from "@/lib/media-server";
import type { MediaItem } from "@/lib/media-server";

// ─── CardManageMenu ───────────────────────────────────────────────────────────

function CardManageMenu({ onReset }: { onReset: () => void }) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const t = useTranslations("myMedia");
  return (
    <>
      <IconButton
        size="small"
        aria-label="Card options"
        sx={{ opacity: 0.9, "&:hover": { opacity: 1 } }}
        onClick={(e) => { e.stopPropagation(); setAnchorEl(e.currentTarget); }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={() => { setAnchorEl(null); onReset(); }} dense>
          {t("resetArtwork")}
        </MenuItem>
      </Menu>
    </>
  );
}

// ─── AltPosterCard ────────────────────────────────────────────────────────────
// Defined at module level (NEVER inside another component) to prevent remount.

interface AltPosterCardProps {
  poster: PosterEntry;
  subs: ThemeSubscription[];
  applyingId: string | null;
  appliedIds: Set<string>;
  onApply: (p: PosterEntry) => void;
}

function AltPosterCard({ poster, subs, applyingId, appliedIds, onApply }: AltPosterCardProps) {
  const t = useTranslations("myMedia");
  const themeId = poster.media.theme_id ?? null;
  const matchingSub = themeId ? subs.find((s) => s.themeId === themeId) : null;
  const themeLabel = matchingSub?.themeName ?? (themeId ? t("inATheme") : null);
  const isApplying = applyingId === poster.poster_id;
  const isApplied = appliedIds.has(poster.poster_id);

  return (
    <Box>
      <PosterCard
        poster={poster}
        chip={{ label: "MOVIE", color: "success" }}
        subscribeSlot={
          poster.creator.creator_id ? (
            <PosterSubscribeMenu
              creatorId={poster.creator.creator_id}
              creatorDisplayName={poster.creator.display_name}
              themeId={themeId}
              themeName={themeLabel}
              coverUrl={poster.assets.preview.url}
              nodeBase={poster.creator.home_node}
            />
          ) : undefined
        }
      />
      <Box sx={{ px: 1, pt: 0.5, pb: 1 }}>
        {themeLabel && (
          <Typography variant="caption" color="text.secondary" display="block" noWrap textAlign="center">
            {themeLabel}
          </Typography>
        )}
        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center" sx={{ mt: 0.75 }}>
          <Button
            size="small"
            variant={isApplied ? "contained" : "outlined"}
            onClick={() => onApply(poster)}
            disabled={isApplying || isApplied}
            sx={{ fontSize: "0.65rem", py: 0.25, minWidth: 0 }}
          >
            {isApplied ? "Applied ✓" : isApplying ? <CircularProgress size={12} /> : t("usePoster")}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}

// ─── MovieMediaDetail ─────────────────────────────────────────────────────────

interface MovieMediaDetailProps {
  item: MediaItem;
  conn: { nodeUrl: string; adminToken: string };
  onBack: () => void;
}

export default function MovieMediaDetail({ item, conn, onBack }: MovieMediaDetailProps) {
  const t = useTranslations("myMedia");

  const [altPosters, setAltPosters] = useState<PosterEntry[]>([]);
  const [altLoading, setAltLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  const [snack, setSnack] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const [failedThumb, setFailedThumb] = useState(false);

  // Applied artwork tracking
  const [trackedItem, setTrackedItem] = useState<TrackedArtwork | null>(null);
  const [collectionName, setCollectionName] = useState<string | null>(null);

  useEffect(() => {
    getArtworkSettings(conn.nodeUrl, conn.adminToken)
      .then((s) => setAutoUpdateEnabled(s.auto_update_artwork));
  }, [conn.nodeUrl, conn.adminToken]);

  // Load tracked record for this Plex item; fall back to a node fetch for
  // legacy records that predate the creator_display_name column.
  useEffect(() => {
    getTrackedArtwork(conn.nodeUrl, conn.adminToken).then((all) => {
      const found = all.find((t) => t.media_item_id === item.id) ?? null;
      setTrackedItem(found);
      if (found && !found.creator_display_name && found.node_base && found.poster_id) {
        fetchPosterFromNode(found.node_base, found.poster_id).then((p) => {
          if (p) setTrackedItem({ ...found, creator_display_name: p.creator.display_name });
        });
      }
    });
  }, [item.id, conn.nodeUrl, conn.adminToken]);

  // Load collection name from TMDB
  useEffect(() => {
    if (!item.tmdb_id) return;
    fetch(`/api/tmdb/movie/${item.tmdb_id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { belongs_to_collection?: { name: string } | null } | null) => {
        setCollectionName(d?.belongs_to_collection?.name ?? null);
      })
      .catch(() => {});
  }, [item.tmdb_id]);

  useEffect(() => {
    if (!item.tmdb_id) {
      setAltLoading(false);
      return;
    }
    setAltLoading(true);
    fetch(`/api/search?tmdb_id=${item.tmdb_id}&type=movie&limit=50`)
      .then((r) => r.json())
      .then((d: { results: PosterEntry[] }) =>
        setAltPosters(
          d.results.filter(
            (p) =>
              typeof p.assets?.preview?.url === "string" &&
              p.assets.preview.url.length > 0,
          ),
        ),
      )
      .catch(() => setAltPosters([]))
      .finally(() => setAltLoading(false));
  }, [item.tmdb_id]);

  const subs = useMemo(() => getSubscriptions(), []);
  const subscribedThemeIds = useMemo(() => new Set(subs.map((s) => s.themeId)), [subs]);
  const subscribedCreatorIds = useMemo(() => new Set(subs.map((s) => s.creatorId)), [subs]);

  // Exclude the currently-applied poster from alternatives
  const visibleAltPosters = useMemo(
    () => altPosters.filter((p) => p.poster_id !== trackedItem?.poster_id),
    [altPosters, trackedItem],
  );

  const fromSubs = useMemo(
    () =>
      visibleAltPosters.filter(
        (p) =>
          (p.media.theme_id && subscribedThemeIds.has(p.media.theme_id)) ||
          subscribedCreatorIds.has(p.creator.creator_id),
      ),
    [visibleAltPosters, subscribedThemeIds, subscribedCreatorIds],
  );

  const others = useMemo(
    () => visibleAltPosters.filter((p) => !fromSubs.includes(p)),
    [visibleAltPosters, fromSubs],
  );

  async function handleApply(poster: PosterEntry) {
    setApplyingId(poster.poster_id);
    try {
      await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
        imageUrl: poster.assets.full.url,
        tmdbId: item.tmdb_id ?? undefined,
        plexRatingKey: item.id,
        mediaType: "movie",
        posterId: poster.poster_id,
        assetHash: poster.assets.full.hash,
        creatorId: poster.creator.creator_id,
        creatorDisplayName: poster.creator.display_name,
        themeId: poster.media.theme_id ?? undefined,
        nodeBase: poster.creator.home_node,
        autoUpdate: autoUpdateEnabled,
      });
      setAppliedIds((prev) => new Set([...prev, poster.poster_id]));
      // Immediately reflect tracking state so the applied poster is filtered out
      // and the metadata panel appears — even before a page reload.
      setTrackedItem({
        media_item_id: item.id,
        tmdb_id: item.tmdb_id,
        media_type: "movie",
        poster_id: poster.poster_id,
        asset_hash: poster.assets.full.hash,
        creator_id: poster.creator.creator_id,
        creator_display_name: poster.creator.display_name,
        theme_id: poster.media.theme_id ?? null,
        node_base: poster.creator.home_node,
        applied_at: new Date().toISOString(),
        auto_update: autoUpdateEnabled,
        plex_label: null,
      });
      setSnack({ open: true, message: t("applySuccess"), severity: "success" });
    } catch (e) {
      setSnack({
        open: true,
        message: e instanceof Error ? e.message : t("applyError"),
        severity: "error",
      });
    } finally {
      setApplyingId(null);
    }
  }

  async function handleReset() {
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, item.id);
      setTrackedItem(null);
      setAppliedIds(new Set());

      // Push the TMDB default poster to Plex directly (no OP tracking).
      if (item.tmdb_id) {
        try {
          const tmdbData = await fetch(`/api/tmdb/movie/${item.tmdb_id}`).then((r) => r.ok ? r.json() : null) as { poster_path?: string } | null;
          if (tmdbData?.poster_path) {
            await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
              imageUrl: `https://image.tmdb.org/t/p/original${tmdbData.poster_path}`,
              plexRatingKey: item.id,
              mediaType: "movie",
              // No posterId / assetHash — backend will not create a tracking record
            });
          }
        } catch {
          // silent — Plex poster may not revert immediately
        }
      }

      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    }
  }

  // Metadata derived from tracking record
  const creatorName = trackedItem?.creator_display_name ?? null;
  const themeId = trackedItem?.theme_id ?? null;
  const themeName = themeId
    ? (subs.find((s) => s.themeId === themeId)?.themeName ?? themeId)
    : null;
  const appliedAt = trackedItem?.applied_at
    ? new Date(trackedItem.applied_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const currentThumbSrc = thumbUrl(conn.nodeUrl, conn.adminToken, item.id);
  const currentThumbPoster: PosterEntry = {
    poster_id: item.id,
    media: { type: "movie", title: item.title, year: item.year ?? undefined },
    creator: { creator_id: "", display_name: creatorName ?? "", home_node: "" },
    assets: {
      preview: { url: currentThumbSrc, hash: "", mime: "image/jpeg" },
      full: { url: currentThumbSrc, hash: "", mime: "image/jpeg", access: "public" },
    },
  };

  return (
    <Box>
      {/* Back button */}
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 2 }}>
        <IconButton size="small" onClick={onBack} aria-label={t("backToMovies")}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ cursor: "pointer" }}
          onClick={onBack}
        >
          {t("backToMovies")}
        </Typography>
      </Stack>

      {/* Title */}
      <Typography variant="h5" gutterBottom>
        {item.title}{item.year ? ` (${item.year})` : ""}
      </Typography>

      {/* Current poster */}
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: "block", mb: 1, fontSize: "0.65rem", letterSpacing: 1.5 }}
      >
        {t("currentPoster")}
      </Typography>
      <Box sx={{ width: "var(--op-poster-width, 180px)", mb: 4 }}>
        <PosterCard
          poster={currentThumbPoster}
          chip={false}
          managed={!!trackedItem}
          menuSlot={trackedItem ? <CardManageMenu onReset={handleReset} /> : undefined}
          imageWrapper={trackedItem ? (img) => <ArtworkMetadataTooltip meta={{ creator: creatorName, theme: themeName, appliedAt }}>{img}</ArtworkMetadataTooltip> : undefined}
          imageFailed={failedThumb}
          onImageError={() => setFailedThumb(true)}
        />
      </Box>

      {/* Alternative artwork */}
      <Typography variant="h6" gutterBottom>
        {t("alternativeArtwork")}
      </Typography>

      {!item.tmdb_id ? (
        <Alert severity="info" sx={{ maxWidth: 500 }}>
          No TMDB ID — artwork lookup unavailable for this item.
        </Alert>
      ) : altLoading ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress />
        </Stack>
      ) : visibleAltPosters.length === 0 ? (
        <Typography color="text.secondary">{t("noAlternatives")}</Typography>
      ) : (
        <Stack spacing={3}>
          {fromSubs.length > 0 && (
            <Box>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ display: "block", mb: 1, fontSize: "0.65rem", letterSpacing: 1.5 }}
              >
                {t("fromSubscriptions")}
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                {fromSubs.map((p) => (
                  <Box key={p.poster_id}>
                    <AltPosterCard
                      poster={p}
                      subs={subs}
                      applyingId={applyingId}
                      appliedIds={appliedIds}
                      onApply={handleApply}
                    />
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {others.length > 0 && (
            <Box>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ display: "block", mb: 1, fontSize: "0.65rem", letterSpacing: 1.5 }}
              >
                {t("otherPosters")}
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                {others.map((p) => (
                  <Box key={p.poster_id}>
                    <AltPosterCard
                      poster={p}
                      subs={subs}
                      applyingId={applyingId}
                      appliedIds={appliedIds}
                      onApply={handleApply}
                    />
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Stack>
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={snack.severity === "success" ? 4000 : null}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snack.severity}
          onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
