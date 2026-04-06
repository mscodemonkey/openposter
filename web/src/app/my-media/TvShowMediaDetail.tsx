"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import CircularProgress from "@mui/material/CircularProgress";
import Skeleton from "@mui/material/Skeleton";
import LinearProgress from "@mui/material/LinearProgress";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import AltArtworkDrawer from "@/components/AltArtworkDrawer";
import ArtworkSourceBadge from "@/components/ArtworkSourceBadge";
import MediaCard, { CardMenuButton } from "@/components/MediaCard";
import { useArtworkAutoUpdate } from "./useArtworkAutoUpdate";
import { useCreatorSubscriptions } from "./useCreatorSubscriptions";
import { useArtworkDrawer } from "./useArtworkDrawer";
import type { PosterEntry } from "@/lib/types";
import { getThemeSubscriptions, type ThemeSubscription } from "@/lib/subscriptions";
import { loadIssuerToken } from "@/lib/issuer_storage";
import { applyToPlexPoster } from "@/lib/plex";
import { getTrackedArtwork, fetchPosterFromNode, untrackArtwork } from "@/lib/artwork-tracking";
import type { TrackedArtwork } from "@/lib/artwork-tracking";
import { thumbUrl, artUrl, logoUrl, squareUrl, fetchMediaChildren } from "@/lib/media-server";
import type { MediaItem } from "@/lib/media-server";
import { POSTER_GRID_COLS, BACKDROP_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";

// ─── TvShowMediaDetail ────────────────────────────────────────────────────────

interface TvShowMediaDetailProps {
  item: MediaItem;
  seasons: MediaItem[];
  seasonsLoading: boolean;
  conn: { nodeUrl: string; adminToken: string };
  failedThumbs: Set<string>;
  trackedArtwork: Map<string, TrackedArtwork>;
  onMarkFailed: (id: string) => void;
  onMarkRetry: (id: string) => void;
  onUntrack: (id: string) => void;
  onTrack: (id: string, artwork: TrackedArtwork) => void;
  onViewEpisodes?: (season: MediaItem) => void;
}

export default function TvShowMediaDetail({
  item,
  seasons,
  seasonsLoading,
  conn,
  failedThumbs,
  trackedArtwork,
  onMarkFailed,
  onMarkRetry,
  onUntrack,
  onTrack,
  onViewEpisodes,
}: TvShowMediaDetailProps) {
  const t = useTranslations("myMedia");

  // ── Alt artwork drawer ────────────────────────────────────────────────────
  const [drawerKind, setDrawerKind] = useState<"show" | "season">("season");
  const [drawerSeasonId, setDrawerSeasonId] = useState<string | null>(null);
  const [drawerIsBackdrop, setDrawerIsBackdrop] = useState(false);
  const [drawerIsSquare, setDrawerIsSquare] = useState(false);
  const [drawerIsLogo, setDrawerIsLogo] = useState(false);
  const { drawerOpen, drawerPosters, drawerLoading, closeDrawer, openDrawer: openArtworkDrawer } = useArtworkDrawer();

  // ── Apply ─────────────────────────────────────────────────────────────────
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const autoUpdateEnabled = useArtworkAutoUpdate(conn.nodeUrl, conn.adminToken);
  // Single preview map for all artwork slots. Key convention matches everywhere else:
  //   poster → plexRatingKey          e.g. "12345"
  //   backdrop → plexRatingKey + ":bg"  e.g. "12345:bg"
  // After a reset, the value is a versioned artUrl string (for cache-busting);
  // after an apply, it's the preview URL from the OpenPoster asset.
  const [appliedPreviews, setAppliedPreviews] = useState<Map<string, string>>(new Map());
  const [opAppliedKeys, setOpAppliedKeys] = useState<Set<string>>(new Set());
  const [resettingIds, setResettingIds] = useState<Set<string>>(new Set());
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
      season: MediaItem | null;
      previewUrl: string;
    }>;
  } | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false, message: "", severity: "success",
  });

  // ── Show-level tracking ───────────────────────────────────────────────────
  const [trackedItem, setTrackedItem] = useState<TrackedArtwork | null>(null);
  const [failedThumb, setFailedThumb] = useState(false);
  const [failedShowBg, setFailedShowBg] = useState(false);
  const [failedShowSquare, setFailedShowSquare] = useState(false);
  const [failedShowLogo, setFailedShowLogo] = useState(false);

  // ── Creator subscriptions ─────────────────────────────────────────────────
  const { creatorSubs, toggleCreatorSubscription } = useCreatorSubscriptions();

  useEffect(() => {
    getTrackedArtwork(conn.nodeUrl, conn.adminToken).then((all) => {
      const found = all.find((r) => r.media_item_id === item.id) ?? null;
      setTrackedItem(found);
      if (found && !found.creator_display_name && found.node_base && found.poster_id) {
        fetchPosterFromNode(found.node_base, found.poster_id).then((p) => {
          if (p) setTrackedItem({ ...found, creator_display_name: p.creator.display_name });
        });
      }
    });
  }, [item.id, conn.nodeUrl, conn.adminToken]);

  // ── Subscriptions ─────────────────────────────────────────────────────────
  const [subs, setSubs] = useState<ThemeSubscription[]>([]);
  useEffect(() => {
    const token = loadIssuerToken();
    if (!token) return;
    getThemeSubscriptions(token).then(setSubs).catch(() => {});
  }, []);

  const drawerSeason = useMemo(
    () => seasons.find((s) => s.id === drawerSeasonId) ?? null,
    [seasons, drawerSeasonId],
  );

  const drawerAppliedPosterId = drawerKind === "show"
    ? drawerIsLogo
      ? trackedArtwork.get(item.id + ":logo")?.poster_id ?? null
      : drawerIsSquare
      ? trackedArtwork.get(item.id + ":square")?.poster_id ?? null
      : drawerIsBackdrop
      ? trackedArtwork.get(item.id + ":bg")?.poster_id ?? null
      : trackedItem?.poster_id ?? null
    : !drawerSeasonId
    ? null
    : drawerIsBackdrop
    ? trackedArtwork.get(drawerSeasonId + ":bg")?.poster_id ?? null
    : trackedArtwork.get(drawerSeasonId)?.poster_id ?? null;

  const visibleDrawerPosters = useMemo(() => {
    let posters = drawerPosters.filter((p) => p.poster_id !== drawerAppliedPosterId);
    if (drawerKind === "season" && drawerSeason?.index != null) {
      posters = posters.filter((p) => {
        if (drawerIsBackdrop) return p.media.season_number === drawerSeason.index;
        return p.media.season_number === drawerSeason.index;
      });
    }
    return posters;
  }, [drawerPosters, drawerAppliedPosterId, drawerKind, drawerSeason?.index, drawerIsBackdrop]);

  // ── Apply handler ─────────────────────────────────────────────────────────
  async function handleApply(poster: PosterEntry, targetSeason?: MediaItem, isBackdrop = false, isLogo = false, isSquare = false) {
    setApplyingId(poster.poster_id);
    const effectiveSeason = targetSeason ?? null;
    const effectiveKind = targetSeason ? "season" : "show";
    try {
      const trackingRecord = (mediaItemId: string, mediaType: string, tmdbId: number | null): TrackedArtwork => ({
        media_item_id: isLogo ? mediaItemId + ":logo" : isSquare ? mediaItemId + ":square" : isBackdrop ? mediaItemId + ":bg" : mediaItemId,
        tmdb_id: tmdbId,
        media_type: mediaType,
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

      if (effectiveKind === "show") {
        const effectiveTmdbId = item.tmdb_id ?? poster.media.tmdb_id ?? null;
        await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
          imageUrl: poster.assets.full.url,
          tmdbId: effectiveTmdbId ?? undefined,
          plexRatingKey: item.id,
          mediaType: "show",
          posterId: poster.poster_id,
          assetHash: poster.assets.full.hash,
          creatorId: poster.creator.creator_id,
          creatorDisplayName: poster.creator.display_name,
          themeId: poster.media.theme_id ?? undefined,
          nodeBase: poster.creator.home_node,
          autoUpdate: autoUpdateEnabled,
          isBackdrop,
          isSquare,
          isLogo,
        });
        if (isLogo) {
          setAppliedPreviews((prev) => new Map(prev).set(item.id + ":logo", poster.assets.preview.url));
          setOpAppliedKeys((prev) => new Set([...prev, item.id + ":logo"]));
          setFailedShowLogo(false);
          onTrack(item.id + ":logo", trackingRecord(item.id, "show", effectiveTmdbId));
        } else if (isSquare) {
          setAppliedPreviews((prev) => new Map(prev).set(item.id + ":square", poster.assets.preview.url));
          setOpAppliedKeys((prev) => new Set([...prev, item.id + ":square"]));
          setFailedShowSquare(false);
          onTrack(item.id + ":square", trackingRecord(item.id, "show", effectiveTmdbId));
        } else if (isBackdrop) {
          setAppliedPreviews((prev) => new Map(prev).set(item.id + ":bg", poster.assets.preview.url));
          setOpAppliedKeys((prev) => new Set([...prev, item.id + ":bg"]));
          setFailedShowBg(false);
          onTrack(item.id + ":bg", trackingRecord(item.id, "show", effectiveTmdbId));
        } else {
          setAppliedPreviews((prev) => new Map(prev).set(item.id, poster.assets.preview.url));
          setOpAppliedKeys((prev) => new Set([...prev, item.id]));
          setTrackedItem(trackingRecord(item.id, "show", effectiveTmdbId));
        }
      } else if (effectiveSeason) {
        const seasonTmdbId = effectiveSeason.tmdb_id ?? poster.media.tmdb_id ?? null;
        await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
          imageUrl: poster.assets.full.url,
          tmdbId: seasonTmdbId ?? undefined,
          plexRatingKey: effectiveSeason.id,
          mediaType: "season",
          posterId: poster.poster_id,
          assetHash: poster.assets.full.hash,
          creatorId: poster.creator.creator_id,
          creatorDisplayName: poster.creator.display_name,
          themeId: poster.media.theme_id ?? undefined,
          nodeBase: poster.creator.home_node,
          autoUpdate: autoUpdateEnabled,
          isBackdrop,
        });
        const bgKey = isBackdrop ? effectiveSeason.id + ":bg" : effectiveSeason.id;
        setAppliedPreviews((prev) => new Map(prev).set(bgKey, poster.assets.preview.url));
        setOpAppliedKeys((prev) => new Set([...prev, bgKey]));
        onTrack(bgKey, trackingRecord(effectiveSeason.id, "season", seasonTmdbId));
      }
      setAppliedIds((prev) => new Set([...prev, poster.poster_id]));
      closeDrawer();
      setSnack({ open: true, message: t("applySuccess"), severity: "success" });
      // Fire-and-forget: discover all artwork this creator has for this show.
      if (!isBackdrop && poster.creator.creator_id) {
        const justAppliedKey = effectiveKind === "season" && effectiveSeason ? effectiveSeason.id : effectiveKind === "show" ? item.id : null;
        checkCreatorMatches(
          poster.creator.creator_id,
          poster.creator.display_name ?? poster.creator.creator_id,
          justAppliedKey,
        ).catch(() => {});
      }
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("applyError"), severity: "error" });
    } finally {
      setApplyingId(null);
    }
  }

  // ── Creator suggestion ────────────────────────────────────────────────────
  // After applying a poster, discover ALL artwork this creator has for this show:
  // show poster, show backdrop, season posters, season backdrops, episode cards.
  async function checkCreatorMatches(
    appliedCreatorId: string,
    appliedCreatorName: string,
    justAppliedRatingKey: string | null,
  ) {
    if (!item.tmdb_id) return;
    type SearchResult = { results: PosterEntry[] };
    let showResults: SearchResult, seasonResults: SearchResult, backdropResults: SearchResult, episodeResults: SearchResult;
    try {
      [showResults, seasonResults, backdropResults, episodeResults] = await Promise.all([
        fetch(`/api/search?tmdb_id=${item.tmdb_id}&type=show&limit=50`).then((r) => r.json()) as Promise<SearchResult>,
        fetch(`/api/search?tmdb_id=${item.tmdb_id}&type=season&limit=200`).then((r) => r.json()) as Promise<SearchResult>,
        fetch(`/api/search?tmdb_id=${item.tmdb_id}&type=backdrop&limit=100`).then((r) => r.json()) as Promise<SearchResult>,
        fetch(`/api/search?tmdb_id=${item.tmdb_id}&type=episode&limit=200`).then((r) => r.json()) as Promise<SearchResult>,
      ]);
    } catch { return; }

    type Job = { label: string; imageUrl: string; plexRatingKey: string; mediaType: string; isBackdrop: boolean; poster: PosterEntry | null; season: MediaItem | null; previewUrl: string };
    const jobs: Job[] = [];

    const fmt = (n: number) => String(n).padStart(2, "0");

    // Show poster — skip if this creator's artwork is already tracked for the show
    const showPoster = (showResults.results ?? []).find((p) => p.creator.creator_id === appliedCreatorId);
    const showAlreadyTracked = trackedItem?.creator_id === appliedCreatorId;
    if (showPoster && item.id !== justAppliedRatingKey && !showAlreadyTracked) {
      jobs.push({ label: t("poster"), imageUrl: showPoster.assets.full.url, plexRatingKey: item.id, mediaType: "show", isBackdrop: false, poster: showPoster, season: null, previewUrl: showPoster.assets.preview.url });
    }

    // Show backdrop
    const showBackdrop = (backdropResults.results ?? []).find((p) => p.creator.creator_id === appliedCreatorId && !p.media.season_number);
    if (showBackdrop) {
      jobs.push({ label: t("backdrop"), imageUrl: showBackdrop.assets.full.url, plexRatingKey: item.id, mediaType: "show", isBackdrop: true, poster: showBackdrop, season: null, previewUrl: showBackdrop.assets.preview.url });
    }

    // Season posters and backdrops
    for (const season of seasons) {
      if (season.index == null) continue;
      const label = t("drawerThisSeason", { number: fmt(season.index) });

      const seasonPoster = (seasonResults.results ?? []).find((p) => p.creator.creator_id === appliedCreatorId && p.media.season_number === season.index);
      const seasonAlreadyTracked = trackedArtwork.get(season.id)?.creator_id === appliedCreatorId;
      if (seasonPoster && season.id !== justAppliedRatingKey && !seasonAlreadyTracked) {
        jobs.push({ label: `${label} ${t("poster")}`, imageUrl: seasonPoster.assets.full.url, plexRatingKey: season.id, mediaType: "season", isBackdrop: false, poster: seasonPoster, season, previewUrl: seasonPoster.assets.preview.url });
      }

      const seasonBackdrop = (backdropResults.results ?? []).find((p) => p.creator.creator_id === appliedCreatorId && p.media.season_number === season.index);
      if (seasonBackdrop) {
        jobs.push({ label: `${label} ${t("backdrop")}`, imageUrl: seasonBackdrop.assets.full.url, plexRatingKey: season.id, mediaType: "season", isBackdrop: true, poster: seasonBackdrop, season, previewUrl: seasonBackdrop.assets.preview.url });
      }
    }

    // Episode artwork — only fetch episodes from seasons this creator has covered
    const creatorEpisodePosters = (episodeResults.results ?? []).filter((p) => p.creator.creator_id === appliedCreatorId);
    if (creatorEpisodePosters.length > 0) {
      const coveredSeasonNums = new Set(creatorEpisodePosters.map((p) => p.media.season_number).filter((n): n is number => n != null));
      for (const seasonNum of coveredSeasonNums) {
        const season = seasons.find((s) => s.index === seasonNum);
        if (!season) continue;
        try {
          const episodes = await fetchMediaChildren(conn.nodeUrl, conn.adminToken, season.id);
          for (const episode of episodes) {
            if (episode.index == null) continue;
            if (episode.id === justAppliedRatingKey) continue;
            if (trackedArtwork.get(episode.id)?.creator_id === appliedCreatorId) continue;
            const epPoster = creatorEpisodePosters.find((p) => p.media.season_number === seasonNum && p.media.episode_number === episode.index);
            if (epPoster) {
              jobs.push({ label: `${t("drawerThisSeason", { number: fmt(seasonNum) })}, ${t("poster")}`, imageUrl: epPoster.assets.full.url, plexRatingKey: episode.id, mediaType: "episode", isBackdrop: false, poster: epPoster, season, previewUrl: epPoster.assets.preview.url });
            }
          }
        } catch { /* skip this season's episodes if fetch fails */ }
      }
    }

    if (jobs.length > 0) {
      setSuggestion({ creatorId: appliedCreatorId, creatorName: appliedCreatorName, jobs });
    }
  }

  // ── Apply-all handler ─────────────────────────────────────────────────────
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
        setOpAppliedKeys((prev) => new Set([...prev, previewKey]));
        if (job.poster) {
          const trackKey = job.isBackdrop ? job.plexRatingKey + ":bg" : job.plexRatingKey;
          onTrack(trackKey, {
            media_item_id: trackKey,
            tmdb_id: job.season?.tmdb_id ?? null,
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

  // ── Reset handler ─────────────────────────────────────────────────────────
  // Fetch the TMDB default poster and push it directly to Plex so the card
  // updates immediately without waiting for Plex's async metadata refresh.
  async function handleReset(mediaItemId: string, mediaType: string, seasonIndex?: number | null) {
    setResettingIds((prev) => new Set([...prev, mediaItemId]));
    // Defer the new preview URL to the finally block so it never renders
    // in the greyscale/resetting state — the preview and resetting-clear are
    // applied atomically in the same React batch.
    let newPreviewUrl: string | null = null;
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, mediaItemId);
      setAppliedPreviews((prev) => { const next = new Map(prev); next.delete(mediaItemId); return next; });
      setOpAppliedKeys((prev) => { const s = new Set(prev); s.delete(mediaItemId); return s; });
      setAppliedIds(new Set());
      if (mediaType === "show") {
        setTrackedItem(null);
      } else {
        onUntrack(mediaItemId);
      }

      const showTmdbId = item.tmdb_id;
      if (showTmdbId) {
        try {
          const tmdbUrl = mediaType === "season" && seasonIndex != null
            ? `/api/tmdb/tv/${showTmdbId}/season/${seasonIndex}`
            : `/api/tmdb/tv/${showTmdbId}`;
          const tmdbData = await fetch(tmdbUrl).then((r) => r.ok ? r.json() : null) as { poster_path?: string } | null;
          if (tmdbData?.poster_path) {
            await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
              imageUrl: `https://image.tmdb.org/t/p/original${tmdbData.poster_path}`,
              plexRatingKey: mediaItemId,
              mediaType,
            });
            newPreviewUrl = `https://image.tmdb.org/t/p/w342${tmdbData.poster_path}`;
          }
        } catch { /* silent */ }
      }

      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    } finally {
      // Both updates in one batch: clear resetting + set new preview.
      // This prevents any intermediate render showing the new artwork under the greyscale filter.
      setResettingIds((prev) => { const s = new Set(prev); s.delete(mediaItemId); return s; });
      if (newPreviewUrl) {
        setAppliedPreviews((prev) => new Map(prev).set(mediaItemId, newPreviewUrl!));
      }
    }
  }

  // ── Backdrop reset handler ────────────────────────────────────────────────
  // Untracks, fetches the TMDB backdrop, and pushes it directly to Plex.
  async function handleResetBackdrop(plexRatingKey: string, mediaType: string) {
    const bgKey = plexRatingKey + ":bg";
    setResettingIds((prev) => new Set([...prev, bgKey]));
    let newPreviewUrl: string | null = null;
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, bgKey).catch(() => {});
      onUntrack(bgKey);
      setAppliedPreviews((prev) => { const next = new Map(prev); next.delete(bgKey); return next; });
      setOpAppliedKeys((prev) => { const s = new Set(prev); s.delete(bgKey); return s; });
      setAppliedIds(new Set());

      const tmdbData = item.tmdb_id
        ? await fetch(`/api/tmdb/tv/${item.tmdb_id}`).then((r) => r.ok ? r.json() : null) as { backdrop_path?: string } | null
        : null;
      if (tmdbData?.backdrop_path) {
        await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
          imageUrl: `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}`,
          plexRatingKey,
          mediaType,
          isBackdrop: true,
        });
        newPreviewUrl = `https://image.tmdb.org/t/p/w780${tmdbData.backdrop_path}`;
      }
      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    } finally {
      // Atomic: clear resetting + set new preview in one batch (same pattern as handleReset).
      setResettingIds((prev) => { const s = new Set(prev); s.delete(bgKey); return s; });
      if (newPreviewUrl) {
        setAppliedPreviews((prev) => new Map(prev).set(bgKey, newPreviewUrl!));
      } else {
        // No TMDB backdrop available — bust the Plex proxy cache so it re-fetches
        // whatever Plex eventually restores via its metadata refresh.
        const bustUrl = `${artUrl(conn.nodeUrl, conn.adminToken, plexRatingKey)}&v=${Date.now()}`;
        setAppliedPreviews((prev) => new Map(prev).set(bgKey, bustUrl));
      }
    }
  }

  async function handleResetShowSquare() {
    const squareKey = item.id + ":square";
    setResettingIds((prev) => new Set([...prev, squareKey]));
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, squareKey).catch(() => {});
      await fetch(
        `${conn.nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/square/${encodeURIComponent(item.id)}/cache`,
        { method: "DELETE", headers: { Authorization: `Bearer ${conn.adminToken}` } },
      ).catch(() => {});
      onUntrack(squareKey);
      setAppliedPreviews((prev) => { const m = new Map(prev); m.delete(squareKey); return m; });
      setOpAppliedKeys((prev) => { const s = new Set(prev); s.delete(squareKey); return s; });
      setAppliedIds(new Set());
      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    } finally {
      setResettingIds((prev) => { const s = new Set(prev); s.delete(squareKey); return s; });
      setAppliedPreviews((prev) => new Map(prev).set(squareKey, `${squareUrl(conn.nodeUrl, conn.adminToken, item.id)}&v=${Date.now()}`));
    }
  }

  async function handleResetShowLogo() {
    const logoKey = item.id + ":logo";
    setResettingIds((prev) => new Set([...prev, logoKey]));
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, logoKey).catch(() => {});
      await fetch(
        `${conn.nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/logo/${encodeURIComponent(item.id)}/cache`,
        { method: "DELETE", headers: { Authorization: `Bearer ${conn.adminToken}` } },
      ).catch(() => {});
      onUntrack(logoKey);
      setAppliedPreviews((prev) => { const m = new Map(prev); m.delete(logoKey); return m; });
      setOpAppliedKeys((prev) => { const s = new Set(prev); s.delete(logoKey); return s; });
      setAppliedIds(new Set());
      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    } finally {
      setResettingIds((prev) => { const s = new Set(prev); s.delete(logoKey); return s; });
      setAppliedPreviews((prev) => new Map(prev).set(logoKey, `${logoUrl(conn.nodeUrl, conn.adminToken, item.id)}&v=${Date.now()}`));
    }
  }

  // ── Derived display values ────────────────────────────────────────────────
  const showThumbSrc = appliedPreviews.get(item.id) ?? thumbUrl(conn.nodeUrl, conn.adminToken, item.id);
  const showSquareSrc = appliedPreviews.get(item.id + ":square") ?? squareUrl(conn.nodeUrl, conn.adminToken, item.id);
  const showLogoSrc = appliedPreviews.get(item.id + ":logo") ?? logoUrl(conn.nodeUrl, conn.adminToken, item.id);
  const drawerSubtitle = drawerKind === "show"
    ? t("drawerThisShow")
    : drawerSeason?.index != null
      ? t("drawerThisSeason", { number: String(drawerSeason.index).padStart(2, "0") })
      : t("drawerThisShow");
  const drawerChip = drawerIsLogo || drawerIsSquare
    ? { label: "TV SHOW", color: "error" as const }
    : drawerIsBackdrop
    ? { label: "BACKDROP", color: "warning" as const }
    : drawerKind === "show"
      ? { label: "TV SHOW", color: "error" as const }
      : { label: "SEASON", color: "info" as const };
  const isShowCreatorSubscribed = trackedItem?.creator_id ? creatorSubs.has(trackedItem.creator_id) : false;
  const showBackdropTracked = trackedArtwork.get(item.id + ":bg") ?? null;
  const showSquareTracked = trackedArtwork.get(item.id + ":square") ?? null;
  const showLogoTracked = trackedArtwork.get(item.id + ":logo") ?? null;

  const isShowResetting = resettingIds.has(item.id);

  function subscribeMenuItem(tracked: TrackedArtwork | null, isSubscribed: boolean) {
    return {
      label: isSubscribed ? t("menuUnsubscribe") : t("menuSubscribe"),
      kind: isSubscribed ? "unsubscribe" as const : "subscribe" as const,
      disabled: !tracked?.creator_id,
      dataTestId: tracked?.creator_id ? `creator-subscription-${tracked.creator_id}` : undefined,
      onClick: () => {
        if (!tracked?.creator_id) return;
        toggleCreatorSubscription({
          creatorId: tracked.creator_id,
          creatorDisplayName: tracked.creator_display_name ?? tracked.creator_id,
          nodeBase: tracked.node_base ?? "",
        });
      },
    };
  }

  function openShowDrawer(mode: "poster" | "backdrop" | "square" | "logo") {
    setDrawerKind("show");
    setDrawerSeasonId(null);
    setDrawerIsBackdrop(mode === "backdrop");
    setDrawerIsSquare(mode === "square");
    setDrawerIsLogo(mode === "logo");
    openArtworkDrawer(
      item.tmdb_id
        ? mode === "backdrop"
          ? `/api/search?tmdb_id=${item.tmdb_id}&type=backdrop&limit=50`
          : mode === "square"
          ? `/api/search?tmdb_id=${item.tmdb_id}&type=show&kind=square&limit=50`
          : mode === "logo"
          ? `/api/search?tmdb_id=${item.tmdb_id}&type=show&kind=logo&limit=50`
          : `/api/search?tmdb_id=${item.tmdb_id}&type=show&limit=50`
        : null,
      mode === "backdrop" ? { mapResults: (results) => results.filter((p) => !p.media.season_number) } : undefined,
    );
  }

  function openSeasonDrawer(season: MediaItem, mode: "poster" | "backdrop") {
    const tmdbId = season.tmdb_id ?? item.tmdb_id ?? null;
    setDrawerKind("season");
    setDrawerSeasonId(season.id);
    setDrawerIsBackdrop(mode === "backdrop");
    setDrawerIsSquare(false);
    setDrawerIsLogo(false);
    openArtworkDrawer(
      tmdbId
        ? mode === "backdrop"
          ? `/api/search?tmdb_id=${tmdbId}&type=backdrop&limit=50`
          : `/api/search?tmdb_id=${tmdbId}&type=season&limit=50`
        : null,
      {
        mapResults: (results) =>
          results.filter((p) =>
            mode === "backdrop"
              ? p.media.season_number === season.index
              : season.index != null
              ? p.media.season_number === season.index
              : true,
          ),
      },
    );
  }

  // Always use the show's backdrop as a page hero — OP-applied preview if available,
  // otherwise fall back to whatever Plex has. Hide only if the image is known to have failed.
  const heroBackdropUrl = failedShowBg
    ? null
    : (appliedPreviews.get(item.id + ":bg") ?? artUrl(conn.nodeUrl, conn.adminToken, item.id));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box>
      {heroBackdropUrl && (
        <Box sx={{ position: "fixed", top: 64, left: 0, right: 0, height: "75vh", zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
          <Box component="img" src={heroBackdropUrl} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", opacity: 0.2, filter: "grayscale(0.75)" }} />
          <Box sx={{ position: "absolute", inset: 0, background: (theme) => `linear-gradient(to bottom, transparent 40%, ${theme.palette.background.default} 95%)` }} />
        </Box>
      )}

      {/* Page content above hero */}
      <Box sx={{ position: "relative", zIndex: 1 }}>


      <Box>

        {/* ── Posters ── */}
        <Typography variant="h6" sx={{ mb: 2 }}>{t("posters")}</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP, mb: 4 }}>

          {/* TV SHOW poster */}
          <Box>
            <MediaCard
              image={showThumbSrc}
              resetting={isShowResetting}
              alt={item.title}
              title={item.title}
              subtitle={item.year ? String(item.year) : undefined}
              imageFailed={failedThumb}
              onImageError={() => setFailedThumb(true)}
              creatorName={trackedItem?.creator_display_name}
              badge={<ArtworkSourceBadge source={trackedItem ? "openposter" : failedThumb ? null : "plex"} creatorName={trackedItem?.creator_display_name} />}
              menuSlot={
                <CardMenuButton
                  items={[
                    subscribeMenuItem(trackedItem, isShowCreatorSubscribed),
                    { label: t("tooltipResetToDefault"), kind: "reset", disabled: !trackedItem, onClick: () => handleReset(item.id, "show") },
                    { label: t("tooltipUploadOwnPoster"), kind: "upload", onClick: () => {} },
                    { label: t("menuChoosePosterFromOpenPoster"), kind: "select", onClick: () => openShowDrawer("poster") },
                  ]}
                  ariaLabel={`${item.title} poster options`}
                />
              }
            />
          </Box>

          {/* Season posters */}
          {seasonsLoading ? (
            Array.from({ length: item.child_count ?? 3 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" sx={{ aspectRatio: "2/3", width: "var(--op-backdrop-width, 340px)", height: "auto", borderRadius: 1 }} />
            ))
          ) : (
            seasons.map((season) => {
              const failed = failedThumbs.has(season.id);
              const tracked = trackedArtwork.get(season.id) ?? null;
              const isCreatorSubscribed = tracked?.creator_id ? creatorSubs.has(tracked.creator_id) : false;
              const seasonNumber = season.index != null
                ? String(season.index).padStart(2, "0")
                : "";
              const seasonNum = season.index != null
                ? t("drawerThisSeason", { number: seasonNumber })
                : (season.title ?? "");

              const isResetting = resettingIds.has(season.id);

              return (
                <Box key={season.id}>
                <MediaCard
                  resetting={isResetting}
                  image={appliedPreviews.get(season.id) ?? (failed ? null : thumbUrl(conn.nodeUrl, conn.adminToken, season.id))}
                  alt={seasonNum}
                  title={seasonNum}
                  subtitle={season.index != null && season.title && !/^season\s+0*\d+$/i.test(season.title.trim()) ? season.title : undefined}
                  imageFailed={failed}
                  onImageError={() => onMarkFailed(season.id)}
                  onClick={() => onViewEpisodes?.(season)}
                  tooltip={t("tooltipShowEpisodesForSeason", { season: seasonNumber })}
                  creatorName={tracked?.creator_display_name}
                  badge={<ArtworkSourceBadge source={tracked ? "openposter" : failed ? null : "plex"} creatorName={tracked?.creator_display_name} />}
                  menuSlot={
                    <CardMenuButton
                      items={[
                        ...(failed ? [{ label: t("menuRetryDownload"), kind: "retry" as const, onClick: () => onMarkRetry(season.id) }] : [subscribeMenuItem(tracked, isCreatorSubscribed)]),
                        { label: t("tooltipResetToDefault"), kind: "reset", disabled: !tracked, onClick: () => handleReset(season.id, "season", season.index) },
                        { label: t("tooltipUploadOwnPoster"), kind: "upload", onClick: () => {} },
                        { label: t("menuChoosePosterFromOpenPoster"), kind: "select", onClick: () => openSeasonDrawer(season, "poster") },
                      ]}
                      ariaLabel={`${seasonNum} poster options`}
                    />
                  }
                />
                </Box>
              );
            })
          )}
        </Box>

        {/* ── Backdrops ── */}
        <Typography variant="h6" sx={{ mb: 2 }}>{t("backdrops")}</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP, mb: 4 }}>

          {/* TV SHOW backdrop */}
          <Box>
          <MediaCard
            image={failedShowBg ? null : (appliedPreviews.get(item.id + ":bg") ?? artUrl(conn.nodeUrl, conn.adminToken, item.id))}
            alt={`${item.title} backdrop`}
            title={item.title}
            subtitle={item.year ? String(item.year) : undefined}
            aspectRatio="16 / 9"
            imageFailed={failedShowBg}
            onImageError={() => setFailedShowBg(true)}
            resetting={resettingIds.has(item.id + ":bg")}
            creatorName={showBackdropTracked?.creator_display_name}
            badge={<ArtworkSourceBadge source={(showBackdropTracked || opAppliedKeys.has(item.id + ":bg")) ? "openposter" : failedShowBg ? null : "plex"} creatorName={showBackdropTracked?.creator_display_name} />}
            menuSlot={
              <CardMenuButton
                items={[
                  subscribeMenuItem(showBackdropTracked, !!(showBackdropTracked?.creator_id && creatorSubs.has(showBackdropTracked.creator_id))),
                  { label: t("tooltipResetToDefaultBackdrop"), kind: "reset", disabled: !showBackdropTracked, onClick: () => handleResetBackdrop(item.id, "show") },
                  { label: t("tooltipUploadOwnBackdrop"), kind: "upload", onClick: () => {} },
                  { label: t("menuChooseBackdropFromOpenPoster"), kind: "select", onClick: () => openShowDrawer("backdrop") },
                ]}
                ariaLabel={`${item.title} backdrop options`}
              />
            }
          />
          </Box>

          {/* Season backdrops */}
          {seasonsLoading
            ? Array.from({ length: item.child_count ?? 3 }).map((_, i) => (
                <Skeleton key={i} variant="rectangular" sx={{ aspectRatio: "16/9", width: "var(--op-backdrop-width, 340px)", height: "auto", borderRadius: 1 }} />
              ))
            : seasons.map((season) => {
            const failedBg = failedThumbs.has(season.id + ":bg");
            const seasonNumber = season.index != null
              ? String(season.index).padStart(2, "0")
              : "";
            const seasonNum = season.index != null
              ? t("drawerThisSeason", { number: seasonNumber })
              : (season.title ?? "");
            return (
              <Box key={season.id + ":bg"}>
              <MediaCard
                image={failedBg ? null : (appliedPreviews.get(season.id + ":bg") ?? artUrl(conn.nodeUrl, conn.adminToken, season.id))}
                alt={`${seasonNum} backdrop`}
                title={seasonNum}
                subtitle={season.index != null && season.title && !/^season\s+0*\d+$/i.test(season.title.trim()) ? season.title : undefined}
                aspectRatio="16 / 9"
                imageFailed={failedBg}
                onImageError={() => onMarkFailed(season.id + ":bg")}
                resetting={resettingIds.has(season.id + ":bg")}
                creatorName={trackedArtwork.get(season.id + ":bg")?.creator_display_name}
                badge={<ArtworkSourceBadge source={(trackedArtwork.get(season.id + ":bg") || opAppliedKeys.has(season.id + ":bg")) ? "openposter" : null} creatorName={trackedArtwork.get(season.id + ":bg")?.creator_display_name} />}
                menuSlot={
                  <CardMenuButton
                    items={[
                      subscribeMenuItem(trackedArtwork.get(season.id + ":bg") ?? null, !!(trackedArtwork.get(season.id + ":bg")?.creator_id && creatorSubs.has(trackedArtwork.get(season.id + ":bg")!.creator_id))),
                      { label: t("tooltipResetToDefaultBackdrop"), kind: "reset", disabled: !trackedArtwork.get(season.id + ":bg"), onClick: () => handleResetBackdrop(season.id, "season") },
                      { label: t("tooltipUploadOwnBackdrop"), kind: "upload", onClick: () => {} },
                      { label: t("menuChooseBackdropFromOpenPoster"), kind: "select", onClick: () => openSeasonDrawer(season, "backdrop") },
                    ]}
                    ariaLabel={`${seasonNum} backdrop options`}
                  />
                }
              />
              </Box>
            );
          })}
        </Box>

        {/* ── Square section ── */}
        <Typography variant="h6" sx={{ mb: 2 }}>{t("squareArtwork")}</Typography>

        <Box sx={{ width: "var(--op-backdrop-width, 340px)", mb: 4 }}>
          <MediaCard
            image={failedShowSquare ? null : showSquareSrc}
            alt={`${item.title} square`}
            title={item.title}
            subtitle={item.year ? String(item.year) : undefined}
            aspectRatio="1 / 1"
            resetting={resettingIds.has(item.id + ":square")}
            imageFailed={failedShowSquare}
            onImageError={() => setFailedShowSquare(true)}
            imageBackground="repeating-conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%) 0 0 / 20px 20px"
            creatorName={showSquareTracked?.creator_display_name}
            badge={<ArtworkSourceBadge source={(showSquareTracked || opAppliedKeys.has(item.id + ":square")) ? "openposter" : failedShowSquare ? null : "plex"} creatorName={showSquareTracked?.creator_display_name} />}
            menuSlot={
              <CardMenuButton
                items={[
                  subscribeMenuItem(showSquareTracked, !!(showSquareTracked?.creator_id && creatorSubs.has(showSquareTracked.creator_id))),
                  { label: t("tooltipResetSquare"), kind: "reset", disabled: !showSquareTracked, onClick: handleResetShowSquare },
                  { label: t("tooltipUploadOwnSquare"), kind: "upload", onClick: () => {} },
                  { label: t("menuChooseSquareFromOpenPoster"), kind: "select", onClick: () => openShowDrawer("square") },
                ]}
                ariaLabel={`${item.title} square options`}
              />
            }
          />
        </Box>

        {/* ── Logo section ── */}
        <Typography variant="h6" sx={{ mb: 2 }}>{t("logo")}</Typography>

        <Box sx={{ width: "var(--op-backdrop-width, 340px)", mb: 4 }}>
          <MediaCard
            image={failedShowLogo ? null : showLogoSrc}
            alt={`${item.title} logo`}
            title={item.title}
            subtitle={item.year ? String(item.year) : undefined}
            aspectRatio="16 / 9"
            resetting={resettingIds.has(item.id + ":logo")}
            imageFailed={failedShowLogo}
            onImageError={() => setFailedShowLogo(true)}
            imageBackground="repeating-conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%) 0 0 / 20px 20px"
            creatorName={showLogoTracked?.creator_display_name}
            badge={<ArtworkSourceBadge source={(showLogoTracked || opAppliedKeys.has(item.id + ":logo")) ? "openposter" : failedShowLogo ? null : "plex"} creatorName={showLogoTracked?.creator_display_name} />}
            menuSlot={
              <CardMenuButton
                items={[
                  subscribeMenuItem(showLogoTracked, !!(showLogoTracked?.creator_id && creatorSubs.has(showLogoTracked.creator_id))),
                  { label: t("tooltipResetLogo"), kind: "reset", disabled: !showLogoTracked, onClick: handleResetShowLogo },
                  { label: t("tooltipUploadOwnLogo"), kind: "upload", onClick: () => {} },
                  { label: t("menuChooseLogoFromOpenPoster"), kind: "select", onClick: () => openShowDrawer("logo") },
                ]}
                ariaLabel={`${item.title} logo options`}
              />
            }
          />
        </Box>

      </Box>

      <AltArtworkDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={item.title}
        subtitle={drawerSubtitle}
        posters={visibleDrawerPosters}
        loading={drawerLoading}
        hasTmdbId={!!item.tmdb_id}
        isBackdrop={drawerIsBackdrop}
        aspectRatio={drawerIsLogo || drawerIsSquare ? "16 / 9" : undefined}
        gridCols={drawerIsLogo || drawerIsSquare || drawerIsBackdrop ? BACKDROP_GRID_COLS : POSTER_GRID_COLS}
        chip={drawerChip}
        subs={subs}
        appliedIds={appliedIds}
        applyingId={applyingId}
        othersLabel={
          drawerIsLogo
            ? t("othersLabelLogosShow")
            : drawerIsSquare
            ? t("othersLabelSquareShow")
            : drawerIsBackdrop
            ? (drawerKind === "show" ? t("othersLabelBackdropsShow") : t("othersLabelBackdropsSeason"))
            : (drawerKind === "show" ? t("othersLabelPostersShow") : t("othersLabelPostersForSeason"))
        }
        onApply={(p) => handleApply(p, drawerKind === "season" ? (drawerSeason ?? undefined) : undefined, drawerIsBackdrop, drawerIsLogo, drawerIsSquare)}
      />

      <Dialog open={!!suggestion} onClose={applyingAll ? undefined : () => setSuggestion(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("suggestionTitle")}</DialogTitle>
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
          ) : (() => {
            const jobs = suggestion?.jobs ?? [];
            const posterCount = jobs.filter((j) => !j.isBackdrop && j.mediaType !== "episode").length;
            const backdropCount = jobs.filter((j) => j.isBackdrop).length;
            const episodeCount = jobs.filter((j) => j.mediaType === "episode").length;
            const parts = [
              posterCount > 0 && `${posterCount} ${t("poster")}${posterCount !== 1 ? "s" : ""}`,
              backdropCount > 0 && `${backdropCount} ${t("backdrop")}${backdropCount !== 1 ? "s" : ""}`,
              episodeCount > 0 && `${episodeCount} ${t("useThumbnail").toLowerCase()}${episodeCount !== 1 ? "s" : ""}`,
            ].filter(Boolean).join(", ");
            return (
              <Typography>
                {t("suggestionTvBody", { creatorName: suggestion?.creatorName ?? "", parts })}
              </Typography>
            );
          })()}
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
      </Box>{/* end position:relative zIndex:1 */}
    </Box>
  );
}
