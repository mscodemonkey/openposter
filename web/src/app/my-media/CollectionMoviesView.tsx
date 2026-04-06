"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MoreVertIcon from "@mui/icons-material/MoreVert";

import ArtworkMetadataTooltip from "@/components/ArtworkMetadataTooltip";
import type { ArtworkMeta } from "@/components/ArtworkMetadataTooltip";
import PosterCard from "@/components/PosterCard";
import PosterSubscribeMenu from "@/components/PosterSubscribeMenu";
import { loadPosterSearchResults } from "./posterSearch";
import { useArtworkAutoUpdate } from "./useArtworkAutoUpdate";
import type { PosterEntry } from "@/lib/types";
import { getThemeSubscriptions, type ThemeSubscription } from "@/lib/subscriptions";
import { loadIssuerToken } from "@/lib/issuer_storage";
import { applyToPlexPoster } from "@/lib/plex";
import type { TrackedArtwork } from "@/lib/artwork-tracking";
import { thumbUrl } from "@/lib/media-server";
import type { MediaItem } from "@/lib/media-server";
import { POSTER_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";

// ─── CardRetryMenu ────────────────────────────────────────────────────────────
// Module-level to prevent remount on parent re-render.

function CardRetryMenu({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("myMedia");
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
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
        <MenuItem onClick={() => { setAnchorEl(null); onRetry(); }} dense>
          {t("retryDownload")}
        </MenuItem>
      </Menu>
    </>
  );
}

// ─── AltMoviePosterCard ───────────────────────────────────────────────────────
// Module-level to prevent remount when selectedMovieId changes.

interface AltMoviePosterCardProps {
  poster: PosterEntry;
  subs: ThemeSubscription[];
  applyingId: string | null;
  appliedIds: Set<string>;
  onApply: (p: PosterEntry) => void;
}

function AltMoviePosterCard({ poster, subs, applyingId, appliedIds, onApply }: AltMoviePosterCardProps) {
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
            {isApplied ? t("appliedCheck") : isApplying ? <CircularProgress size={12} /> : t("usePoster")}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePoster(item: MediaItem, src: string, creatorName = ""): PosterEntry {
  return {
    poster_id: item.id,
    media: {
      type: item.type,
      tmdb_id: item.tmdb_id ?? undefined,
      title: item.title,
      year: item.year ?? undefined,
    },
    creator: { creator_id: "", display_name: creatorName, home_node: "" },
    assets: {
      preview: { url: src, hash: "", mime: "image/jpeg" },
      full: { url: src, hash: "", mime: "image/jpeg", access: "public" },
    },
  };
}

function makeArtworkMeta(
  tracked: TrackedArtwork | undefined,
  subThemeNames: Map<string, string>,
): ArtworkMeta {
  if (!tracked) return {};
  return {
    creator: tracked.creator_display_name ?? null,
    theme: tracked.theme_id ? (subThemeNames.get(tracked.theme_id) ?? null) : null,
    appliedAt: tracked.applied_at
      ? new Date(tracked.applied_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      : null,
  };
}

// ─── CollectionMoviesView ─────────────────────────────────────────────────────

interface CollectionMoviesViewProps {
  children: MediaItem[];
  conn: { nodeUrl: string; adminToken: string };
  collectionTitle: string;
  failedThumbs: Set<string>;
  trackedArtwork: Map<string, TrackedArtwork>;
  onBack: () => void;
  onMarkFailed: (id: string) => void;
  onMarkRetry: (id: string) => void;
}

export default function CollectionMoviesView({
  children,
  conn,
  collectionTitle,
  failedThumbs,
  trackedArtwork,
  onBack,
  onMarkFailed,
  onMarkRetry,
}: CollectionMoviesViewProps) {
  const t = useTranslations("myMedia");

  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null);
  const [altPosters, setAltPosters] = useState<PosterEntry[]>([]);
  const [altLoading, setAltLoading] = useState(false);
  const [altLoadedForId, setAltLoadedForId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const autoUpdateEnabled = useArtworkAutoUpdate(conn.nodeUrl, conn.adminToken);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false, message: "", severity: "success",
  });

  // Auto-select first movie when children arrive; don't reset on re-render.
  useEffect(() => {
    if (children.length > 0 && !selectedMovieId) {
      setSelectedMovieId(children[0].id);
    }
  }, [children, selectedMovieId]);

  const selectedMovie = useMemo(
    () => children.find((c) => c.id === selectedMovieId) ?? null,
    [children, selectedMovieId],
  );

  // Fetch alt posters whenever the selected movie changes.
  // altLoadedForId tracks which selectedMovieId the current altPosters belong to.
  // When selectedMovieId changes, altLoadedForId !== selectedMovieId → spinner shown
  // immediately, preventing stale data from the previous selection flashing.
  useEffect(() => {
    if (!selectedMovie?.tmdb_id) {
      setAltPosters([]);
      setAltLoading(false);
      setAltLoadedForId(selectedMovieId);
      return;
    }
    setAltLoading(true);
    loadPosterSearchResults(`/api/search?tmdb_id=${selectedMovie.tmdb_id}&type=movie&limit=50`)
      .then((results) => {
        setAltPosters(results);
        setAltLoadedForId(selectedMovieId);
      })
      .catch(() => { setAltPosters([]); setAltLoadedForId(selectedMovieId); })
      .finally(() => setAltLoading(false));
  }, [selectedMovie?.tmdb_id, selectedMovieId]);

  const [subs, setSubs] = useState<ThemeSubscription[]>([]);
  useEffect(() => {
    const token = loadIssuerToken();
    if (!token) return;
    getThemeSubscriptions(token).then(setSubs).catch(() => {});
  }, []);
  const subscribedThemeIds = useMemo(() => new Set(subs.map((s) => s.themeId)), [subs]);
  const subscribedCreatorIds = useMemo(() => new Set(subs.map((s) => s.creatorId)), [subs]);
  const subThemeNames = useMemo(() => new Map(subs.map((s) => [s.themeId, s.themeName])), [subs]);

  // Exclude the currently-applied poster for the selected movie.
  const appliedPosterId = selectedMovieId ? (trackedArtwork.get(selectedMovieId)?.poster_id ?? null) : null;
  const visibleAltPosters = useMemo(
    () => altPosters.filter((p) => p.poster_id !== appliedPosterId),
    [altPosters, appliedPosterId],
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
    if (!selectedMovie) return;
    setApplyingId(poster.poster_id);
    try {
      await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
        imageUrl: poster.assets.full.url,
        tmdbId: selectedMovie.tmdb_id ?? undefined,
        plexRatingKey: selectedMovie.id,
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

  return (
    <Box>
      {/* Back button */}
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 2 }}>
        <IconButton size="small" onClick={onBack} aria-label={t("backToCollection", { title: collectionTitle })}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ cursor: "pointer" }} onClick={onBack}>
          {t("backToCollection", { title: collectionTitle })}
        </Typography>
      </Stack>

      <Typography variant="h5" fontWeight={800} sx={{ mt: 1, mb: 2 }}>{t("moviesFor", { title: collectionTitle })}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t("selectMovieHint")}
      </Typography>

      {/* Movie grid */}
      {children.length === 0 ? (
        <Typography color="text.secondary">{t("noItems")}</Typography>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP, mb: 4 }}>
          {children.map((item) => {
            const failed = failedThumbs.has(item.id);
            const isSelected = item.id === selectedMovieId;
            const tracked = trackedArtwork.get(item.id);
            return (
              <ArtworkMetadataTooltip key={item.id} meta={makeArtworkMeta(tracked, subThemeNames)}>
                <Box
                  sx={{ opacity: selectedMovieId && !isSelected ? 0.5 : 1, transition: "opacity 0.15s", cursor: "pointer" }}
                >
                  <PosterCard
                    poster={makePoster(item, thumbUrl(conn.nodeUrl, conn.adminToken, item.id), tracked?.creator_display_name ?? undefined)}
                    imageFailed={failed}
                    managed={!!tracked}
                    selected={isSelected}
                    menuSlot={failed ? <CardRetryMenu onRetry={() => onMarkRetry(item.id)} /> : undefined}
                    onImageError={() => onMarkFailed(item.id)}
                    onClick={() => setSelectedMovieId(item.id)}
                  />
                </Box>
              </ArtworkMetadataTooltip>
            );
          })}
        </Box>
      )}

      {/* Alt artwork for selected movie */}
      {selectedMovie && (
        <Box>
          <Typography variant="h6" gutterBottom>
            {t("alternativePostersFor", { title: selectedMovie.title })}
          </Typography>

          {(altLoading || altLoadedForId !== selectedMovieId) ? (
            <Stack alignItems="center" sx={{ py: 4 }}>
              <CircularProgress />
            </Stack>
          ) : !selectedMovie.tmdb_id ? (
            <Alert severity="info" sx={{ maxWidth: 500 }}>
              {t("noTmdbIdMovie")}
            </Alert>
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
                        <AltMoviePosterCard
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
                        <AltMoviePosterCard
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
        </Box>
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={snack.severity === "success" ? 4000 : null}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack((prev) => ({ ...prev, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
