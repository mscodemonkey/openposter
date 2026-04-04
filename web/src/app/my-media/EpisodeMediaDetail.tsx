"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import LinearProgress from "@mui/material/LinearProgress";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import TvOutlinedIcon from "@mui/icons-material/TvOutlined";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import ReplayIcon from "@mui/icons-material/Replay";
import UploadIcon from "@mui/icons-material/Upload";

import AltArtworkDrawer from "@/components/AltArtworkDrawer";
import ArtworkSourceBadge from "@/components/ArtworkSourceBadge";
import MediaCard, { CardChip, MediaCardOverlay, ToolbarButton } from "@/components/MediaCard";
import CreatorSubscriptionToolbarAction from "./CreatorSubscriptionToolbarAction";
import { useArtworkAutoUpdate } from "./useArtworkAutoUpdate";
import { useCreatorSubscriptions } from "./useCreatorSubscriptions";
import { useArtworkDrawer } from "./useArtworkDrawer";
import type { PosterEntry } from "@/lib/types";
import { getSubscriptions } from "@/lib/subscriptions";
import { applyToPlexPoster } from "@/lib/plex";
import { untrackArtwork } from "@/lib/artwork-tracking";
import type { TrackedArtwork } from "@/lib/artwork-tracking";
import { thumbUrl, artUrl } from "@/lib/media-server";
import type { MediaItem } from "@/lib/media-server";
import { BACKDROP_GRID_COLS, GRID_GAP, CHIP_HEIGHT } from "@/lib/grid-sizes";

// ─── MissingEpisodeCard ───────────────────────────────────────────────────────

/** Placeholder card for an episode that exists in TMDB but is not present on the media server. */
function MissingEpisodeCard({ episodeNumber, airDate }: { episodeNumber: number; airDate: string | null }) {
  const t = useTranslations("myMedia");
  const label = `EPISODE ${String(episodeNumber).padStart(2, "0")}`;

  const { statusLabel, statusColor } = (() => {
    if (!airDate) return { statusLabel: t("episodeStatusNotBroadcast"), statusColor: "text.disabled" as const };
    const aired = new Date(airDate);
    const now = new Date();
    const daysDiff = (now.getTime() - aired.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff < 0) {
      const formatted = aired.toLocaleDateString(undefined, {
        day: "numeric", month: "short",
        ...(aired.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
      });
      return { statusLabel: t("episodeStatusComing", { date: formatted }), statusColor: "text.disabled" as const };
    }
    if (daysDiff < 2) return { statusLabel: t("episodeStatusExpectedSoon"), statusColor: "warning.main" as const };
    return { statusLabel: t("episodeStatusMissing"), statusColor: "error.main" as const };
  })();

  return (
    <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
      <Box sx={{ position: "relative", aspectRatio: "16 / 9", bgcolor: "action.hover", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.75 }}>
        <TvOutlinedIcon sx={{ fontSize: "2rem", color: "text.disabled", opacity: 0.5 }} />
        <Typography variant="caption" sx={{ color: statusColor, fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {statusLabel}
        </Typography>
        <Box sx={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
          <CardChip label={label} color="success" />
        </Box>
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
  showTitle: string;
  showTmdbId: number | null;
  /** Plex rating key for the season — used to fetch the season backdrop hero. */
  seasonId: string;
  /** Plex rating key for the show — fallback hero if no season backdrop is available. */
  showId: string;
  conn: { nodeUrl: string; adminToken: string };
  failedThumbs: Set<string>;
  trackedArtwork: Map<string, TrackedArtwork>;
  onMarkFailed: (id: string) => void;
  onMarkRetry: (id: string) => void;
  onUntrack: (id: string) => void;
  onTrack: (id: string, artwork: TrackedArtwork) => void;
  serverName?: string;
}

export default function EpisodeMediaDetail({
  episodes,
  episodesLoading,
  seasonTitle,
  seasonIndex,
  showTitle,
  showTmdbId,
  seasonId,
  showId,
  conn,
  failedThumbs,
  trackedArtwork,
  onMarkFailed,
  onMarkRetry,
  onUntrack,
  onTrack,
  serverName,
}: EpisodeMediaDetailProps) {
  const t = useTranslations("myMedia");

  // ── TMDB episode count ─────────────────────────────────────────────────────
  const [tmdbEpisodes, setTmdbEpisodes] = useState<{ episode_number: number; air_date: string | null }[] | null>(null);
  const [tmdbEpisodeCountLoading, setTmdbEpisodeCountLoading] = useState(false);
  useEffect(() => {
    if (!showTmdbId || seasonIndex == null) { setTmdbEpisodes(null); return; }
    let cancelled = false;
    setTmdbEpisodeCountLoading(true);
    fetch(`/api/tmdb/tv/${showTmdbId}/season/${seasonIndex}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: { episodes?: { episode_number: number; air_date?: string | null }[] } | null) => {
        if (!cancelled) setTmdbEpisodes(d?.episodes?.map((e) => ({ episode_number: e.episode_number, air_date: e.air_date ?? null })) ?? null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTmdbEpisodeCountLoading(false); });
    return () => { cancelled = true; };
  }, [showTmdbId, seasonIndex]);
  const tmdbEpisodeCount = tmdbEpisodes?.length ?? null;

  // ── Hero backdrop ──────────────────────────────────────────────────────────
  const [failedSeasonBg, setFailedSeasonBg] = useState(false);
  const [failedShowBg, setFailedShowBg] = useState(false);
  const heroUrl = failedSeasonBg
    ? (failedShowBg ? null : artUrl(conn.nodeUrl, conn.adminToken, showId))
    : artUrl(conn.nodeUrl, conn.adminToken, seasonId);

  // ── Selection ──────────────────────────────────────────────────────────────
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);

  // ── Alt artwork drawer ─────────────────────────────────────────────────────
  const [drawerEpisodeId, setDrawerEpisodeId] = useState<string | null>(null);
  const { drawerOpen, drawerPosters, drawerLoading, closeDrawer, openDrawer: openArtworkDrawer } = useArtworkDrawer();

  // ── Apply ──────────────────────────────────────────────────────────────────
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const autoUpdateEnabled = useArtworkAutoUpdate(conn.nodeUrl, conn.adminToken);

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
  const { creatorSubs, toggleCreatorSubscription } = useCreatorSubscriptions();

  // ── Subscriptions ──────────────────────────────────────────────────────────
  const subs = useMemo(() => getSubscriptions(), []);

  // Merged list of real episodes and TMDB-only placeholders, sorted by episode number.
  const mergedEpisodes = useMemo<Array<{ type: "real"; episode: MediaItem } | { type: "missing"; episodeNumber: number; airDate: string | null }>>(() => {
    const realByNumber = new Map(episodes.map((e) => [e.index ?? -1, e]));
    if (!tmdbEpisodes) return episodes.map((e) => ({ type: "real", episode: e }));
    return tmdbEpisodes.map((te) => {
      const real = realByNumber.get(te.episode_number);
      return real ? { type: "real", episode: real } : { type: "missing", episodeNumber: te.episode_number, airDate: te.air_date };
    });
  }, [episodes, tmdbEpisodes]);

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
  // Exclude the poster that is already applied to this episode.
  const appliedPosterId = drawerEpisodeId ? (trackedArtwork.get(drawerEpisodeId)?.poster_id ?? null) : null;
  const visibleDrawerPosters = drawerPosters.filter((p) => p.poster_id !== appliedPosterId);

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
      closeDrawer();
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
    openArtworkDrawer(showTmdbId ? `/api/search?tmdb_id=${showTmdbId}&type=episode&limit=200` : null, {
      mapResults: (initialResults) => {
        let results = initialResults;
        if (seasonIndex != null && episode.index != null) {
          results = results.filter((p) => p.media.season_number === seasonIndex && p.media.episode_number === episode.index);
        }
        return results;
      },
    });
  }

  // ── Creator suggestion ─────────────────────────────────────────────────────
  // After applying an episode card, check if the same creator has cards for
  // other episodes in this season that aren't applied yet.
  async function checkCreatorMatches(
    appliedCreatorId: string,
    appliedCreatorName: string,
    justAppliedEpisodeId: string,
  ) {
    if (!showTmdbId || seasonIndex == null) return;
    type SearchResult = { results: PosterEntry[] };
    let episodeResults: SearchResult;
    try {
      episodeResults = await fetch(
        `/api/search?tmdb_id=${showTmdbId}&type=episode&creator_id=${encodeURIComponent(appliedCreatorId)}&limit=200`
      ).then((r) => r.json()) as SearchResult;
    } catch { return; }

    // Filter to this season only.
    const seasonPosters = (episodeResults.results ?? []).filter(
      (p) => p.media.season_number === seasonIndex,
    );

    type Job = { label: string; imageUrl: string; plexRatingKey: string; mediaType: string; isBackdrop: boolean; poster: PosterEntry | null; previewUrl: string };
    const jobs: Job[] = [];
    const fmt = (n: number) => String(n).padStart(2, "0");

    // Match against the episodes we already have for this season.
    for (const ep of episodes) {
      if (ep.index == null || ep.id === justAppliedEpisodeId) continue;
      if (trackedArtwork.get(ep.id)?.creator_id === appliedCreatorId) continue;
      const epPoster = seasonPosters.find((p) => p.media.episode_number === ep.index);
      if (epPoster) {
        jobs.push({
          label: `Episode ${fmt(ep.index)}`,
          imageUrl: epPoster.assets.full.url,
          plexRatingKey: ep.id,
          mediaType: "episode",
          isBackdrop: false,
          poster: epPoster,
          previewUrl: epPoster.assets.preview.url,
        });
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
    setSnack({ open: true, message: t("episodeSuggestionApplied"), severity: "success" });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box>
      {/* Hero backdrop */}
      {heroUrl && (
        <Box sx={{ position: "fixed", top: 64, left: 0, right: 0, height: "75vh", zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
          <Box
            component="img"
            src={heroUrl}
            alt=""
            sx={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", opacity: 0.2, filter: "grayscale(0.75)" }}
            onError={failedSeasonBg ? () => setFailedShowBg(true) : () => setFailedSeasonBg(true)}
          />
          <Box sx={{ position: "absolute", inset: 0, background: (theme) => `linear-gradient(to bottom, transparent 40%, ${theme.palette.background.default} 95%)` }} />
        </Box>
      )}

      {/* Page content above hero */}
      <Box sx={{ position: "relative", zIndex: 1 }}>


      {!episodesLoading && episodes.length > 0 && (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          {tmdbEpisodeCountLoading
            ? <><CircularProgress size={12} /><Typography variant="caption" color="text.secondary" sx={{ letterSpacing: "0.05em", textTransform: "uppercase" }}>{t("checkingEpisodeCount")}</Typography></>
            : tmdbEpisodeCount != null
              ? <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {episodes.length >= tmdbEpisodeCount
                    ? t("allEpisodesAvailable", { server: serverName ?? "your media server" })
                    : t("episodesAvailableCount", { count: episodes.length, total: tmdbEpisodeCount, server: serverName ?? "your media server" })}
                </Typography>
              : null}
        </Stack>
      )}

      {episodesLoading ? (
        <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
      ) : episodes.length === 0 ? (
        <Typography color="text.secondary">{t("noItems")}</Typography>
      ) : (
        <Box ref={gridRef} sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {mergedEpisodes.map((entry) => {
            if (entry.type === "missing") {
              return <MissingEpisodeCard key={`missing-${entry.episodeNumber}`} episodeNumber={entry.episodeNumber} airDate={entry.airDate} />;
            }
            const episode = entry.episode;
            const failed = failedThumbs.has(episode.id);
            const tracked = trackedArtwork.get(episode.id) ?? null;
            const isResetting = resettingIds.has(episode.id);
            const isSelected = selectedEpisodeId === episode.id;
            const epLabel = episode.index != null
              ? `EPISODE ${String(episode.index).padStart(2, "0")}`
              : (episode.title ?? "Episode");
            const seasonLabel = seasonIndex != null
              ? `SEASON ${String(seasonIndex).padStart(2, "0")}`
              : seasonTitle;
            const epSubtitle = episode.index != null
              ? [seasonLabel, `EPISODE ${String(episode.index).padStart(2, "0")}`].join(" · ")
              : seasonLabel;

            const isCreatorSubscribed = tracked?.creator_id ? creatorSubs.has(tracked.creator_id) : false;

            const handleCreatorSubscribe = () => {
              if (!tracked?.creator_id) return;
              toggleCreatorSubscription({
                creatorId: tracked.creator_id,
                creatorDisplayName: tracked.creator_display_name ?? tracked.creator_id,
                nodeBase: tracked.node_base ?? "",
              });
            };

            const imageUrl = failed
              ? null
              : (appliedPreviews.get(episode.id) ?? thumbUrl(conn.nodeUrl, conn.adminToken, episode.id));

            return (
              <Box key={episode.id}>
                <MediaCard
                  image={imageUrl}
                  alt={episode.title ?? epLabel}
                  title={episode.index != null ? `Episode ${String(episode.index).padStart(2, "0")}` : (episode.title ?? "Episode")}
                  subtitle={episode.title && !/^episode\s+\d+$/i.test(episode.title.trim()) ? episode.title : undefined}
                  aspectRatio="16 / 9"
                  imageFailed={failed}
                  imageBackground="repeating-conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%) 0 0 / 20px 20px"
                  onImageError={() => onMarkFailed(episode.id)}
                  resetting={isResetting}
                  selected={isSelected}
                  onClick={() => setSelectedEpisodeId(episode.id)}
                  onClose={() => setSelectedEpisodeId(null)}
                  creatorName={tracked?.creator_display_name}
                  badge={<ArtworkSourceBadge source={tracked ? "openposter" : failed ? null : "plex"} creatorName={tracked?.creator_display_name} mediaServer={serverName} />}
                  chip={<CardChip label={epLabel} color="success" />}
                  overlay={
                    <MediaCardOverlay>
                      <Box sx={{ gridColumn: "span 4", display: "flex", gap: 0.75 }}>
                        <Box sx={{ flex: 1 }}>
                          <CreatorSubscriptionToolbarAction
                            creatorId={tracked?.creator_id}
                            isSubscribed={isCreatorSubscribed}
                            disabled={!tracked}
                            onToggle={handleCreatorSubscribe}
                            onAfterToggle={() => setTimeout(() => setSelectedEpisodeId(null), 500)}
                          />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <ToolbarButton
                            icon={<ReplayIcon sx={{ fontSize: "1.1rem" }} />}
                            disabled={!tracked}
                            tooltip={t("tooltipResetToDefault")}
                            onClick={(e) => { e.stopPropagation(); handleReset(episode); setSelectedEpisodeId(null); }}
                          />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <ToolbarButton
                            icon={<UploadIcon sx={{ fontSize: "1.1rem" }} />}
                            tooltip={t("tooltipUploadOwnEpisodeCard")}
                            onClick={(e) => { e.stopPropagation(); setSelectedEpisodeId(null); }}
                          />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <ToolbarButton
                            icon={<PhotoLibraryIcon sx={{ fontSize: "1.1rem" }} />}
                            tooltip={t("tooltipSelectEpisodeCard")}
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
      <AltArtworkDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={showTitle}
        subtitle={
          drawerEpisode?.index != null
            ? `${seasonIndex != null ? `SEASON ${String(seasonIndex).padStart(2, "0")}` : seasonTitle} · EPISODE ${String(drawerEpisode.index).padStart(2, "0")}`
            : (seasonIndex != null ? `SEASON ${String(seasonIndex).padStart(2, "0")}` : seasonTitle)
        }
        posters={visibleDrawerPosters}
        loading={drawerLoading}
        hasTmdbId={!!showTmdbId}
        isBackdrop={false}
        gridCols={BACKDROP_GRID_COLS}
        chip={{ label: "EPISODE", color: "warning" }}
        subs={subs}
        appliedIds={appliedIds}
        applyingId={applyingId}
        othersLabel={t("othersLabelEpisodeCards")}
        buttonLabel={t("useThumbnail")}
        onApply={(poster) => drawerEpisode ? handleApply(poster, drawerEpisode) : undefined}
      />

      <Dialog open={!!suggestion} onClose={applyingAll ? undefined : () => setSuggestion(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("episodeSuggestionTitle")}</DialogTitle>
        <DialogContent>
          {applyingAll && applyProgress ? (
            <Box>
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                {t("applyingItem", { item: applyProgress.current })}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={(applyProgress.done / applyProgress.total) * 100}
                sx={{ mb: 1, borderRadius: 1, height: 6 }}
              />
              <Typography variant="caption" color="text.secondary">
                {t("applyProgressCount", { done: applyProgress.done, total: applyProgress.total })}
              </Typography>
            </Box>
          ) : (
            <Typography>
              {t("episodeSuggestionBody", { creatorName: suggestion?.creatorName ?? "", count: suggestion?.jobs.length ?? 0 })}
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
      </Box> {/* end relative z-index content wrapper */}
    </Box>
  );
}
