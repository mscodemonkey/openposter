"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import DoneIcon from "@mui/icons-material/Done";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import ReplayIcon from "@mui/icons-material/Replay";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";
import UploadIcon from "@mui/icons-material/Upload";

import OPLogo from "@/components/OPLogo";
import PosterCard from "@/components/PosterCard";
import PosterSubscribeMenu from "@/components/PosterSubscribeMenu";
import MediaCard, { MediaCardOverlay, ToolbarButton } from "@/components/MediaCard";
import type { PosterEntry } from "@/lib/types";
import type { ThemeSubscription } from "@/lib/subscriptions";
import { getSubscriptions, getCreatorSubscriptions, subscribeCreator, unsubscribeCreator } from "@/lib/subscriptions";
import { applyToPlexPoster } from "@/lib/plex";
import { getArtworkSettings, untrackArtwork } from "@/lib/artwork-tracking";
import type { TrackedArtwork } from "@/lib/artwork-tracking";
import { thumbUrl, fetchMediaChildren } from "@/lib/media-server";
import type { MediaItem } from "@/lib/media-server";
import { EPISODE_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";

// ─── AltArtworkCard ───────────────────────────────────────────────────────────
// Module-level to prevent remount.

interface AltArtworkCardProps {
  poster: PosterEntry;
  subs: ThemeSubscription[];
  applyingId: string | null;
  appliedIds: Set<string>;
  chip: { label: string; color: "primary" | "success" | "error" | "secondary" | "warning" };
  onApply: (p: PosterEntry) => void;
}

function AltArtworkCard({ poster, subs, applyingId, appliedIds, chip, onApply }: AltArtworkCardProps) {
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
        chip={chip}
        aspectRatio="16 / 9"
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
            {isApplied ? "Applied ✓" : isApplying ? <CircularProgress size={12} /> : t("useThumbnail")}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}

// ─── EpisodeMediaDetail ───────────────────────────────────────────────────────

interface EpisodeMediaDetailProps {
  episodes: MediaItem[];
  episodesLoading: boolean;
  seasonTitle: string;
  seasonIndex: number | null;
  showId: string;
  showTitle: string;
  showTmdbId: number | null;
  conn: { nodeUrl: string; adminToken: string };
  failedThumbs: Set<string>;
  trackedArtwork: Map<string, TrackedArtwork>;
  onBack: () => void;
  onMarkFailed: (id: string) => void;
  onMarkRetry: (id: string) => void;
  onUntrack: (id: string) => void;
  onTrack: (id: string, artwork: TrackedArtwork) => void;
}

export default function EpisodeMediaDetail({
  episodes,
  episodesLoading,
  seasonTitle,
  seasonIndex,
  showId,
  showTitle,
  showTmdbId,
  conn,
  failedThumbs,
  trackedArtwork,
  onBack,
  onMarkFailed,
  onMarkRetry,
  onUntrack,
  onTrack,
}: EpisodeMediaDetailProps) {
  const t = useTranslations("myMedia");

  // ── Selection ──────────────────────────────────────────────────────────────
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);

  // ── Alt artwork drawer ─────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEpisodeId, setDrawerEpisodeId] = useState<string | null>(null);
  const [drawerPosters, setDrawerPosters] = useState<PosterEntry[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // ── Apply ──────────────────────────────────────────────────────────────────
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);

  // Single preview map for all artwork slots, keyed by episode.id (no :bg suffix ever).
  const [appliedPreviews, setAppliedPreviews] = useState<Map<string, string>>(new Map());
  const [resettingIds, setResettingIds] = useState<Set<string>>(new Set());

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false, message: "", severity: "success",
  });

  const [suggestion, setSuggestion] = useState<{
    creatorId: string;
    creatorName: string;
    jobs: Array<{
      label: string;
      imageUrl: string;
      plexRatingKey: string;
      mediaType: string;
      isBackdrop: boolean;
      poster: PosterEntry | null;
      previewUrl: string;
    }>;
  } | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ done: number; total: number; current: string } | null>(null);

  // ── Creator subscriptions ──────────────────────────────────────────────────
  const [creatorSubs, setCreatorSubs] = useState<Set<string>>(
    () => new Set(getCreatorSubscriptions().map((s) => s.creatorId)),
  );

  // ── Subscriptions ──────────────────────────────────────────────────────────
  const subs = useMemo(() => getSubscriptions(), []);
  const subscribedThemeIds = useMemo(() => new Set(subs.map((s) => s.themeId)), [subs]);
  const subscribedCreatorIds = useMemo(() => new Set(subs.map((s) => s.creatorId)), [subs]);

  useEffect(() => {
    getArtworkSettings(conn.nodeUrl, conn.adminToken)
      .then((s) => setAutoUpdateEnabled(s.auto_update_artwork));
  }, [conn.nodeUrl, conn.adminToken]);

  // Clicking outside the grid deselects the current episode.
  const gridRef = useRef<HTMLDivElement>(null);
  const selectedEpisodeIdRef = useRef(selectedEpisodeId);
  selectedEpisodeIdRef.current = selectedEpisodeId;

  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      if (
        selectedEpisodeIdRef.current !== null &&
        gridRef.current &&
        !gridRef.current.contains(e.target as Node)
      ) {
        setSelectedEpisodeId(null);
      }
    }
    document.addEventListener("click", handleDocClick);
    return () => document.removeEventListener("click", handleDocClick);
  }, []);

  // ── Derived drawer episode ─────────────────────────────────────────────────
  const drawerEpisode = useMemo(
    () => episodes.find((e) => e.id === drawerEpisodeId) ?? null,
    [episodes, drawerEpisodeId],
  );

  // ── Drawer poster partitions ───────────────────────────────────────────────
  const drawerFromSubs = drawerPosters.filter(
    (p) => (p.media.theme_id && subscribedThemeIds.has(p.media.theme_id)) || subscribedCreatorIds.has(p.creator.creator_id),
  );
  const drawerOthers = drawerPosters.filter((p) => !drawerFromSubs.includes(p));

  // ── Apply handler ──────────────────────────────────────────────────────────
  async function handleApply(poster: PosterEntry, episode: MediaItem) {
    setApplyingId(poster.poster_id);
    try {
      await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
        imageUrl: poster.assets.full.url,
        plexRatingKey: episode.id,
        mediaType: "episode",
        posterId: poster.poster_id,
        assetHash: poster.assets.full.hash,
        creatorId: poster.creator.creator_id,
        creatorDisplayName: poster.creator.display_name,
        themeId: poster.media.theme_id ?? undefined,
        nodeBase: poster.creator.home_node,
        autoUpdate: autoUpdateEnabled,
      });
      setAppliedPreviews((prev) => new Map(prev).set(episode.id, poster.assets.preview.url));
      onTrack(episode.id, {
        media_item_id: episode.id,
        tmdb_id: null,
        media_type: "episode",
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
      setAppliedIds((prev) => new Set([...prev, poster.poster_id]));
      setDrawerOpen(false);
      setSnack({ open: true, message: t("applySuccess"), severity: "success" });
      if (poster.creator.creator_id) {
        checkCreatorMatches(
          poster.creator.creator_id,
          poster.creator.display_name ?? poster.creator.creator_id,
          episode.id,
        ).catch(() => {});
      }
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("applyError"), severity: "error" });
    } finally {
      setApplyingId(null);
    }
  }

  // ── Reset handler ──────────────────────────────────────────────────────────
  async function handleReset(episode: MediaItem) {
    setResettingIds((prev) => new Set([...prev, episode.id]));
    let newPreviewUrl: string | null = null;
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, episode.id);
      onUntrack(episode.id);
      setAppliedPreviews((prev) => { const next = new Map(prev); next.delete(episode.id); return next; });
      setAppliedIds(new Set());

      // Try to restore the TMDB still and push it directly to Plex.
      if (showTmdbId && seasonIndex != null && episode.index != null) {
        try {
          const tmdbData = await fetch(`/api/tmdb/tv/${showTmdbId}/season/${seasonIndex}`)
            .then((r) => r.ok ? r.json() : null) as { episodes?: Array<{ episode_number: number; still_path?: string }> } | null;
          const ep = tmdbData?.episodes?.find((e) => e.episode_number === episode.index);
          if (ep?.still_path) {
            await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
              imageUrl: `https://image.tmdb.org/t/p/original${ep.still_path}`,
              plexRatingKey: episode.id,
              mediaType: "episode",
              isBackdrop: false,
            });
            // Cache-bust so the browser re-fetches the updated thumb from Plex.
            newPreviewUrl = thumbUrl(conn.nodeUrl, conn.adminToken, episode.id) + "&v=" + Date.now();
          }
        } catch { /* silent */ }
      }

      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    } finally {
      setResettingIds((prev) => { const s = new Set(prev); s.delete(episode.id); return s; });
      if (newPreviewUrl) {
        setAppliedPreviews((prev) => new Map(prev).set(episode.id, newPreviewUrl!));
      }
    }
  }

  // ── Open drawer for an episode ─────────────────────────────────────────────
  function openDrawer(episode: MediaItem) {
    setDrawerEpisodeId(episode.id);
    setDrawerPosters([]);
    setDrawerOpen(true);
    if (showTmdbId) {
      setDrawerLoading(true);
      fetch(`/api/search?tmdb_id=${showTmdbId}&type=episode&limit=200`)
        .then((r) => r.json())
        .then((d: { results: PosterEntry[] }) => {
          let results = d.results.filter((p) => typeof p.assets?.preview?.url === "string" && p.assets.preview.url.length > 0);
          if (seasonIndex != null && episode.index != null) {
            results = results.filter((p) => p.media.season_number === seasonIndex && p.media.episode_number === episode.index);
          }
          setDrawerPosters(results);
        })
        .catch(() => setDrawerPosters([]))
        .finally(() => setDrawerLoading(false));
    }
  }

  // ── Creator suggestion ─────────────────────────────────────────────────────
  async function checkCreatorMatches(
    appliedCreatorId: string,
    appliedCreatorName: string,
    justAppliedEpisodeId: string,
  ) {
    if (!showTmdbId) return;
    type SearchResult = { results: PosterEntry[] };
    let showResults: SearchResult, seasonResults: SearchResult, backdropResults: SearchResult, episodeResults: SearchResult;
    try {
      [showResults, seasonResults, backdropResults, episodeResults] = await Promise.all([
        fetch(`/api/search?tmdb_id=${showTmdbId}&type=show&limit=50`).then((r) => r.json()) as Promise<SearchResult>,
        fetch(`/api/search?tmdb_id=${showTmdbId}&type=season&limit=200`).then((r) => r.json()) as Promise<SearchResult>,
        fetch(`/api/search?tmdb_id=${showTmdbId}&type=backdrop&limit=100`).then((r) => r.json()) as Promise<SearchResult>,
        fetch(`/api/search?tmdb_id=${showTmdbId}&type=episode&limit=500`).then((r) => r.json()) as Promise<SearchResult>,
      ]);
    } catch { return; }

    // Fetch all seasons for this show so we can map season_number → plexRatingKey.
    let allSeasons: MediaItem[] = [];
    try {
      allSeasons = await fetchMediaChildren(conn.nodeUrl, conn.adminToken, showId);
    } catch { return; }

    type Job = { label: string; imageUrl: string; plexRatingKey: string; mediaType: string; isBackdrop: boolean; poster: PosterEntry | null; previewUrl: string };
    const jobs: Job[] = [];
    const fmt = (n: number) => String(n).padStart(2, "0");

    // Show poster — skip if this creator's artwork is already tracked for the show
    const showPoster = (showResults.results ?? []).find((p) => p.creator.creator_id === appliedCreatorId);
    const showAlreadyTracked = trackedArtwork.get(showId)?.creator_id === appliedCreatorId;
    if (showPoster && !showAlreadyTracked) {
      jobs.push({ label: "TV show poster", imageUrl: showPoster.assets.full.url, plexRatingKey: showId, mediaType: "show", isBackdrop: false, poster: showPoster, previewUrl: showPoster.assets.preview.url });
    }

    // Show backdrop
    const showBackdrop = (backdropResults.results ?? []).find((p) => p.creator.creator_id === appliedCreatorId && !p.media.season_number);
    if (showBackdrop) {
      jobs.push({ label: "TV show backdrop", imageUrl: showBackdrop.assets.full.url, plexRatingKey: showId, mediaType: "show", isBackdrop: true, poster: showBackdrop, previewUrl: showBackdrop.assets.preview.url });
    }

    // Season posters and backdrops
    for (const season of allSeasons) {
      if (season.index == null) continue;
      const label = `Season ${fmt(season.index)}`;

      const seasonPoster = (seasonResults.results ?? []).find((p) => p.creator.creator_id === appliedCreatorId && p.media.season_number === season.index);
      const seasonAlreadyTracked = trackedArtwork.get(season.id)?.creator_id === appliedCreatorId;
      if (seasonPoster && !seasonAlreadyTracked) {
        jobs.push({ label: `${label} poster`, imageUrl: seasonPoster.assets.full.url, plexRatingKey: season.id, mediaType: "season", isBackdrop: false, poster: seasonPoster, previewUrl: seasonPoster.assets.preview.url });
      }

      const seasonBackdrop = (backdropResults.results ?? []).find((p) => p.creator.creator_id === appliedCreatorId && p.media.season_number === season.index);
      if (seasonBackdrop) {
        jobs.push({ label: `${label} backdrop`, imageUrl: seasonBackdrop.assets.full.url, plexRatingKey: season.id, mediaType: "season", isBackdrop: true, poster: seasonBackdrop, previewUrl: seasonBackdrop.assets.preview.url });
      }
    }

    // Episode thumbnails — skip the one just applied
    const creatorEpisodePosters = (episodeResults.results ?? []).filter((p) => p.creator.creator_id === appliedCreatorId);
    if (creatorEpisodePosters.length > 0) {
      const coveredSeasonNums = new Set(creatorEpisodePosters.map((p) => p.media.season_number).filter((n): n is number => n != null));
      for (const seasonNum of coveredSeasonNums) {
        const season = allSeasons.find((s) => s.index === seasonNum);
        if (!season) continue;
        try {
          const eps = await fetchMediaChildren(conn.nodeUrl, conn.adminToken, season.id);
          for (const ep of eps) {
            if (ep.index == null || ep.id === justAppliedEpisodeId) continue;
            const alreadyTracked = trackedArtwork.get(ep.id)?.creator_id === appliedCreatorId;
            if (alreadyTracked) continue;
            const epPoster = creatorEpisodePosters.find((p) => p.media.season_number === seasonNum && p.media.episode_number === ep.index);
            if (epPoster) {
              jobs.push({ label: `Season ${fmt(seasonNum)}, Episode ${fmt(ep.index)}`, imageUrl: epPoster.assets.full.url, plexRatingKey: ep.id, mediaType: "episode", isBackdrop: false, poster: epPoster, previewUrl: epPoster.assets.preview.url });
            }
          }
        } catch { /* skip this season's episodes if fetch fails */ }
      }
    }

    if (jobs.length > 0) {
      setSuggestion({ creatorId: appliedCreatorId, creatorName: appliedCreatorName, jobs });
    }
  }

  // ── Apply-all handler ──────────────────────────────────────────────────────
  async function handleApplyAll() {
    if (!suggestion) return;
    const { jobs } = suggestion;
    setApplyingAll(true);
    setApplyProgress({ done: 0, total: jobs.length, current: jobs[0]?.label ?? "" });
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      setApplyProgress({ done: i, total: jobs.length, current: job.label });
      try {
        await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
          imageUrl: job.imageUrl,
          plexRatingKey: job.plexRatingKey,
          mediaType: job.mediaType,
          isBackdrop: job.isBackdrop,
          posterId: job.poster?.poster_id ?? undefined,
          assetHash: job.poster?.assets.full.hash ?? undefined,
          creatorId: suggestion.creatorId,
          creatorDisplayName: suggestion.creatorName,
          themeId: job.poster?.media.theme_id ?? undefined,
          nodeBase: job.poster?.creator.home_node ?? undefined,
          autoUpdate: autoUpdateEnabled,
        });
        const previewKey = job.isBackdrop ? job.plexRatingKey + ":bg" : job.plexRatingKey;
        setAppliedPreviews((prev) => new Map(prev).set(previewKey, job.previewUrl));
        if (job.poster) {
          const trackKey = job.isBackdrop ? job.plexRatingKey + ":bg" : job.plexRatingKey;
          onTrack(trackKey, {
            media_item_id: trackKey,
            tmdb_id: null,
            media_type: job.mediaType,
            poster_id: job.poster.poster_id,
            asset_hash: job.poster.assets.full.hash,
            creator_id: suggestion.creatorId,
            creator_display_name: suggestion.creatorName,
            theme_id: job.poster.media.theme_id ?? null,
            node_base: job.poster.creator.home_node ?? "",
            applied_at: new Date().toISOString(),
            auto_update: autoUpdateEnabled,
            plex_label: null,
          });
        }
      } catch { /* best-effort per item */ }
    }
    setApplyProgress(null);
    setSuggestion(null);
    setApplyingAll(false);
    setSnack({ open: true, message: t("suggestionApplied"), severity: "success" });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box>
      {/* Back */}
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 2 }}>
        <IconButton size="small" onClick={onBack} aria-label={t("backToShow", { title: showTitle })}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ cursor: "pointer" }} onClick={onBack}>
          {t("backToShow", { title: showTitle })}
        </Typography>
      </Stack>

      <Typography variant="h5" gutterBottom>{seasonTitle}</Typography>

      {episodesLoading ? (
        <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
      ) : episodes.length === 0 ? (
        <Typography color="text.secondary">{t("noItems")}</Typography>
      ) : (
        <Box ref={gridRef} sx={{ display: "grid", gridTemplateColumns: EPISODE_GRID_COLS, gap: GRID_GAP }}>
          {episodes.map((episode) => {
            const failed = failedThumbs.has(episode.id);
            const tracked = trackedArtwork.get(episode.id) ?? null;
            const isResetting = resettingIds.has(episode.id);
            const isSelected = selectedEpisodeId === episode.id;
            const epLabel = episode.index != null
              ? `EP ${String(episode.index).padStart(2, "0")}`
              : (episode.title ?? "Episode");
            const epSubtitle = episode.index != null
              ? [seasonTitle, `EP ${String(episode.index).padStart(2, "0")}`].join(" · ")
              : seasonTitle;

            const isCreatorSubscribed = tracked?.creator_id ? creatorSubs.has(tracked.creator_id) : false;

            const handleCreatorSubscribe = () => {
              if (!tracked?.creator_id) return;
              if (isCreatorSubscribed) {
                unsubscribeCreator(tracked.creator_id);
                setCreatorSubs((prev) => { const s = new Set(prev); s.delete(tracked.creator_id!); return s; });
              } else {
                subscribeCreator({
                  creatorId: tracked.creator_id,
                  creatorDisplayName: tracked.creator_display_name ?? tracked.creator_id,
                  nodeBase: tracked.node_base ?? "",
                });
                setCreatorSubs((prev) => new Set([...prev, tracked.creator_id!]));
              }
            };

            const imageUrl = failed
              ? null
              : (appliedPreviews.get(episode.id) ?? thumbUrl(conn.nodeUrl, conn.adminToken, episode.id));

            return (
              <Box key={episode.id}>
                <MediaCard
                  image={imageUrl}
                  alt={episode.title ?? epLabel}
                  aspectRatio="16 / 9"
                  imageFailed={failed}
                  onImageError={() => onMarkFailed(episode.id)}
                  resetting={isResetting}
                  selected={isSelected}
                  onClick={() => setSelectedEpisodeId(episode.id)}
                  onClose={() => setSelectedEpisodeId(null)}
                  badge={tracked ? (
                    <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: "white", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.08)" }}>
                      <DoneIcon sx={{ fontSize: 13, color: "black" }} />
                    </Box>
                  ) : undefined}
                  chip={
                    failed
                      ? <Chip label="MISSING" size="small" color="error" sx={{ fontWeight: 700, fontSize: "0.6rem", height: 20, borderRadius: "0 6px 6px 0", pointerEvents: "none", textTransform: "uppercase" }} />
                      : <Chip label={epLabel} size="small" color="warning" sx={{ fontWeight: 700, fontSize: "0.6rem", height: 20, borderRadius: "0 6px 6px 0", pointerEvents: "none", textTransform: "uppercase" }} />
                  }
                  overlay={
                    <MediaCardOverlay title={episode.title ?? epLabel} subtitle={epSubtitle}>
                      <Box sx={{ gridColumn: "span 4", display: "flex", gap: 0.75 }}>
                        <Box sx={{ flex: 1 }}>
                          <ToolbarButton
                            icon={isCreatorSubscribed ? <StarIcon sx={{ fontSize: "1.1rem" }} /> : <StarBorderIcon sx={{ fontSize: "1.1rem" }} />}
                            disabled={!tracked}
                            active={isCreatorSubscribed}
                            tooltip={isCreatorSubscribed ? "Subscribed" : "Subscribe to creator"}
                            menuItems={tracked?.creator_id ? [
                              { label: isCreatorSubscribed ? "Unsubscribe" : "Subscribe", onClick: () => { handleCreatorSubscribe(); setTimeout(() => setSelectedEpisodeId(null), 500); } },
                            ] : undefined}
                          />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <ToolbarButton
                            icon={<ReplayIcon sx={{ fontSize: "1.1rem" }} />}
                            disabled={!tracked}
                            tooltip="Reset to default"
                            onClick={(e) => { e.stopPropagation(); handleReset(episode); setSelectedEpisodeId(null); }}
                          />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <ToolbarButton
                            icon={<UploadIcon sx={{ fontSize: "1.1rem" }} />}
                            tooltip="Upload your own thumbnail"
                            onClick={(e) => { e.stopPropagation(); setSelectedEpisodeId(null); }}
                          />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <ToolbarButton
                            icon={<PhotoLibraryIcon sx={{ fontSize: "1.1rem" }} />}
                            tooltip="Select thumbnail from an OpenPoster creator"
                            onClick={(e) => { e.stopPropagation(); setSelectedEpisodeId(null); openDrawer(episode); }}
                          />
                        </Box>
                      </Box>
                    </MediaCardOverlay>
                  }
                />
              </Box>
            );
          })}
        </Box>
      )}

      {/* Alt artwork drawer */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        disableRestoreFocus
        PaperProps={{ sx: { width: { xs: "100vw", sm: 520 }, display: "flex", flexDirection: "column" } }}
      >
        <Box sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
            <OPLogo size={28} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" noWrap sx={{ lineHeight: 1.2 }}>{showTitle}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {drawerEpisode?.index != null
                  ? `${seasonTitle} · EP ${String(drawerEpisode.index).padStart(2, "0")}`
                  : seasonTitle}
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={() => setDrawerOpen(false)} sx={{ ml: 1, flexShrink: 0 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box sx={{ flex: 1, overflowY: "auto", p: 2.5 }}>
          {drawerLoading ? (
            <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
          ) : drawerPosters.length === 0 ? (
            <Typography color="text.secondary">{t("noAlternatives")}</Typography>
          ) : (
            <Stack spacing={3}>
              {drawerFromSubs.length > 0 && (
                <Box>
                  <Typography variant="overline" color="text.secondary"
                    sx={{ display: "block", mb: 1, fontSize: "0.65rem", letterSpacing: 1.5 }}>
                    {t("fromSubscriptions")}
                  </Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: EPISODE_GRID_COLS, gap: GRID_GAP }}>
                    {drawerFromSubs.map((p) => (
                      <Box key={p.poster_id}>
                        <AltArtworkCard
                          poster={p}
                          subs={subs}
                          applyingId={applyingId}
                          appliedIds={appliedIds}
                          chip={{ label: "EPISODE", color: "warning" }}
                          onApply={(poster) => drawerEpisode ? handleApply(poster, drawerEpisode) : undefined}
                        />
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
              {drawerOthers.length > 0 && (
                <Box>
                  <Typography variant="overline" color="text.secondary"
                    sx={{ display: "block", mb: 1, fontSize: "0.65rem", letterSpacing: 1.5 }}>
                    Other thumbnails for this episode
                  </Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: EPISODE_GRID_COLS, gap: GRID_GAP }}>
                    {drawerOthers.map((p) => (
                      <Box key={p.poster_id}>
                        <AltArtworkCard
                          poster={p}
                          subs={subs}
                          applyingId={applyingId}
                          appliedIds={appliedIds}
                          chip={{ label: "EPISODE", color: "warning" }}
                          onApply={(poster) => drawerEpisode ? handleApply(poster, drawerEpisode) : undefined}
                        />
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </Stack>
          )}
        </Box>
      </Drawer>

      <Dialog open={!!suggestion} onClose={applyingAll ? undefined : () => setSuggestion(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("suggestionTitle")}</DialogTitle>
        <DialogContent>
          {applyingAll && applyProgress ? (
            <Box>
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                Applying <strong>{applyProgress.current}</strong>…
              </Typography>
              <LinearProgress
                variant="determinate"
                value={(applyProgress.done / applyProgress.total) * 100}
                sx={{ mb: 1, borderRadius: 1, height: 6 }}
              />
              <Typography variant="caption" color="text.secondary">
                {applyProgress.done} of {applyProgress.total}
              </Typography>
            </Box>
          ) : (
            <Typography>
              <strong>{suggestion?.creatorName}</strong> has{" "}
              <strong>{suggestion?.jobs.length}</strong>{" "}
              {suggestion?.jobs.length === 1 ? "item" : "items"} of matching artwork for this show
              (posters, backdrops, and episodes). Would you like to apply them all?
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuggestion(null)} disabled={applyingAll}>{t("suggestionDecline")}</Button>
          <Button onClick={handleApplyAll} variant="contained" disabled={applyingAll}>
            {applyingAll ? <CircularProgress size={16} /> : t("suggestionApplyAll")}
          </Button>
        </DialogActions>
      </Dialog>

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
