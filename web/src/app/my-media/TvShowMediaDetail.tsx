"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Drawer from "@mui/material/Drawer";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import DoneIcon from "@mui/icons-material/Done";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import RefreshIcon from "@mui/icons-material/Refresh";
import ReplayIcon from "@mui/icons-material/Replay";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import UploadIcon from "@mui/icons-material/Upload";

import ArtworkMetadataTooltip from "@/components/ArtworkMetadataTooltip";
import OPLogo from "@/components/OPLogo";
import type { ArtworkMeta } from "@/components/ArtworkMetadataTooltip";
import MediaCard, { MediaCardOverlay, ToolbarButton } from "@/components/MediaCard";
import PosterCard from "@/components/PosterCard";
import PosterSubscribeMenu from "@/components/PosterSubscribeMenu";
import type { PosterEntry } from "@/lib/types";
import type { ThemeSubscription } from "@/lib/subscriptions";
import { getSubscriptions, getCreatorSubscriptions, subscribeCreator, unsubscribeCreator } from "@/lib/subscriptions";
import { applyToPlexPoster } from "@/lib/plex";
import { getArtworkSettings, getTrackedArtwork, fetchPosterFromNode, untrackArtwork } from "@/lib/artwork-tracking";
import type { TrackedArtwork } from "@/lib/artwork-tracking";
import { thumbUrl, artUrl, fetchMediaChildren } from "@/lib/media-server";
import type { MediaItem } from "@/lib/media-server";
import { POSTER_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";

// ─── CardRetryMenu ────────────────────────────────────────────────────────────

function CardRetryMenu({ onRetry }: { onRetry: () => void }) {
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
          Retry download
        </MenuItem>
      </Menu>
    </>
  );
}

// ─── CardManageMenu ───────────────────────────────────────────────────────────

function CardManageMenu({ onReset, onOpen }: { onReset: () => void; onOpen?: () => void }) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const t = useTranslations("myMedia");
  return (
    <>
      <IconButton
        size="small"
        aria-label="Card options"
        sx={{ opacity: 0.9, "&:hover": { opacity: 1 } }}
        onClick={(e) => { e.stopPropagation(); onOpen?.(); setAnchorEl(e.currentTarget); }}
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

// ─── AltArtworkCard ───────────────────────────────────────────────────────────
// Module-level to prevent remount.

interface AltArtworkCardProps {
  poster: PosterEntry;
  subs: ThemeSubscription[];
  applyingId: string | null;
  appliedIds: Set<string>;
  chip: { label: string; color: "primary" | "success" | "error" | "secondary" | "warning" };
  isBackdrop?: boolean;
  onApply: (p: PosterEntry) => void;
}

function AltArtworkCard({ poster, subs, applyingId, appliedIds, chip, isBackdrop = false, onApply }: AltArtworkCardProps) {
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
        aspectRatio={isBackdrop ? "16 / 9" : "2 / 3"}
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
            {isApplied ? "Applied ✓" : isApplying ? <CircularProgress size={12} /> : isBackdrop ? t("useBackdrop") : t("usePoster")}
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
      season_number: item.type === "season" ? (item.index ?? undefined) : undefined,
    },
    creator: { creator_id: "", display_name: creatorName, home_node: "" },
    assets: {
      preview: { url: src, hash: "", mime: "image/jpeg" },
      full: { url: src, hash: "", mime: "image/jpeg", access: "public" },
    },
  };
}

function makeArtworkMeta(tracked: TrackedArtwork | undefined, subThemeNames: Map<string, string>): ArtworkMeta {
  if (!tracked) return {};
  return {
    creator: tracked.creator_display_name ?? null,
    theme: tracked.theme_id ? (subThemeNames.get(tracked.theme_id) ?? null) : null,
    appliedAt: tracked.applied_at
      ? new Date(tracked.applied_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      : null,
  };
}

// ─── TvShowMediaDetail ────────────────────────────────────────────────────────

interface TvShowMediaDetailProps {
  item: MediaItem;
  seasons: MediaItem[];
  seasonsLoading: boolean;
  conn: { nodeUrl: string; adminToken: string };
  failedThumbs: Set<string>;
  trackedArtwork: Map<string, TrackedArtwork>;
  onBack: () => void;
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
  onBack,
  onMarkFailed,
  onMarkRetry,
  onUntrack,
  onTrack,
  onViewEpisodes,
}: TvShowMediaDetailProps) {
  const t = useTranslations("myMedia");

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selectedKind, setSelectedKind] = useState<"show" | "season">("show");
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  // selectedBackdropId: item.id = show backdrop, season.id = season backdrop
  const [selectedBackdropId, setSelectedBackdropId] = useState<string | null>(null);
  const [selectedShowCard, setSelectedShowCard] = useState(false);

  // ── Alt artwork drawer ────────────────────────────────────────────────────
  // The drawer is fully self-contained — it captures target at click time
  // and fetches independently, so it never depends on selectedKind/selectedSeason.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerKind, setDrawerKind] = useState<"show" | "season">("season");
  const [drawerSeasonId, setDrawerSeasonId] = useState<string | null>(null);
  const [drawerPosters, setDrawerPosters] = useState<PosterEntry[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerIsBackdrop, setDrawerIsBackdrop] = useState(false);

  // ── Alt artwork ───────────────────────────────────────────────────────────
  const [altPosters, setAltPosters] = useState<PosterEntry[]>([]);
  const [altLoading, setAltLoading] = useState(false);
  const [altLoadedForKey, setAltLoadedForKey] = useState<string | null>(null);
  const altFetchKeyRef = useRef<string | null>(null);

  // ── Apply ─────────────────────────────────────────────────────────────────
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  // Single preview map for all artwork slots. Key convention matches everywhere else:
  //   poster → plexRatingKey          e.g. "12345"
  //   backdrop → plexRatingKey + ":bg"  e.g. "12345:bg"
  // After a reset, the value is a versioned artUrl string (for cache-busting);
  // after an apply, it's the preview URL from the OpenPoster asset.
  const [appliedPreviews, setAppliedPreviews] = useState<Map<string, string>>(new Map());
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

  // ── Creator subscriptions ─────────────────────────────────────────────────
  const [creatorSubs, setCreatorSubs] = useState<Set<string>>(
    () => new Set(getCreatorSubscriptions().map((s) => s.creatorId)),
  );

  useEffect(() => {
    getArtworkSettings(conn.nodeUrl, conn.adminToken)
      .then((s) => setAutoUpdateEnabled(s.auto_update_artwork));
  }, [conn.nodeUrl, conn.adminToken]);

  // Clicking anywhere outside the seasons grid deselects the current season.
  // Uses a ref so the closure never goes stale and the effect runs only once.
  const seasonsGridRef = useRef<HTMLDivElement>(null);
  const showCardRef = useRef<HTMLDivElement>(null);
  const selectedSeasonIdRef = useRef(selectedSeasonId);
  selectedSeasonIdRef.current = selectedSeasonId;
  const selectedBackdropIdRef = useRef(selectedBackdropId);
  selectedBackdropIdRef.current = selectedBackdropId;
  const selectedShowCardRef = useRef(selectedShowCard);
  selectedShowCardRef.current = selectedShowCard;

  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      if (
        (selectedSeasonIdRef.current !== null || selectedBackdropIdRef.current !== null) &&
        seasonsGridRef.current &&
        !seasonsGridRef.current.contains(e.target as Node) &&
        !(showCardRef.current && showCardRef.current.contains(e.target as Node))
      ) {
        setSelectedKind("show");
        setSelectedSeasonId(null);
        setSelectedBackdropId(null);
      }
      if (
        selectedShowCardRef.current &&
        showCardRef.current &&
        !showCardRef.current.contains(e.target as Node)
      ) {
        setSelectedShowCard(false);
      }
    }
    document.addEventListener("click", handleDocClick);
    return () => document.removeEventListener("click", handleDocClick);
  }, []);

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
  const subs = useMemo(() => getSubscriptions(), []);
  const subscribedThemeIds = useMemo(() => new Set(subs.map((s) => s.themeId)), [subs]);
  const subscribedCreatorIds = useMemo(() => new Set(subs.map((s) => s.creatorId)), [subs]);
  const subThemeNames = useMemo(() => new Map(subs.map((s) => [s.themeId, s.themeName])), [subs]);

  // ── Derived selection ─────────────────────────────────────────────────────
  const selectedKey = selectedKind === "show" ? "show" : (selectedSeasonId ?? "show");
  const selectedSeason = useMemo(
    () => seasons.find((s) => s.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId],
  );
  const selectedTitle = selectedKind === "show" ? item.title : (selectedSeason?.title ?? item.title);
  // Plex doesn't attach TMDB GUIDs to season items, so season.tmdb_id is always null.
  // Fall back to the show's TMDB ID for season artwork search (seasons are indexed by show TMDB ID).
  const selectedTmdbId = selectedKind === "show" ? item.tmdb_id : (selectedSeason?.tmdb_id ?? item.tmdb_id ?? null);

  // ── Alt artwork fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    const key = selectedKey;
    altFetchKeyRef.current = key;

    if (!selectedTmdbId) {
      setAltPosters([]);
      setAltLoading(false);
      setAltLoadedForKey(key);
      return;
    }

    const type = selectedKind === "show" ? "show" : "season";
    setAltLoading(true);
    fetch(`/api/search?tmdb_id=${selectedTmdbId}&type=${type}&limit=50`)
      .then((r) => r.json())
      .then((d: { results: PosterEntry[] }) => {
        if (altFetchKeyRef.current !== key) return;
        setAltPosters(d.results.filter((p) => typeof p.assets?.preview?.url === "string" && p.assets.preview.url.length > 0));
        setAltLoadedForKey(key);
      })
      .catch(() => { if (altFetchKeyRef.current === key) { setAltPosters([]); setAltLoadedForKey(key); } })
      .finally(() => { if (altFetchKeyRef.current === key) setAltLoading(false); });
  }, [selectedKind, selectedKey, selectedTmdbId]);

  // ── Applied poster filtering ──────────────────────────────────────────────
  const appliedPosterId = selectedKind === "show"
    ? (trackedItem?.poster_id ?? null)
    : (trackedArtwork.get(selectedSeasonId ?? "")?.poster_id ?? null);

  const visibleAltPosters = useMemo(() => {
    let posters = altPosters.filter((p) => p.poster_id !== appliedPosterId);
    // When a season is selected we fetch all seasons for the show (since Plex
    // gives no season-level TMDB ID). Filter down to the selected season number.
    if (selectedKind === "season" && selectedSeason?.index != null) {
      posters = posters.filter((p) => p.media.season_number === selectedSeason.index);
    }
    return posters;
  }, [altPosters, appliedPosterId, selectedKind, selectedSeason?.index]);

  const fromSubs = useMemo(
    () => visibleAltPosters.filter(
      (p) => (p.media.theme_id && subscribedThemeIds.has(p.media.theme_id)) ||
        subscribedCreatorIds.has(p.creator.creator_id),
    ),
    [visibleAltPosters, subscribedThemeIds, subscribedCreatorIds],
  );

  const others = useMemo(
    () => visibleAltPosters.filter((p) => !fromSubs.includes(p)),
    [visibleAltPosters, fromSubs],
  );

  // ── Apply handler ─────────────────────────────────────────────────────────
  // When called from the drawer, targetSeason overrides selectedSeason/selectedKind.
  async function handleApply(poster: PosterEntry, targetSeason?: MediaItem, isBackdrop = false) {
    setApplyingId(poster.poster_id);
    const effectiveSeason = targetSeason ?? selectedSeason;
    const effectiveKind = targetSeason ? "season" : selectedKind;
    try {
      const trackingRecord = (mediaItemId: string, mediaType: string, tmdbId: number | null): TrackedArtwork => ({
        media_item_id: isBackdrop ? mediaItemId + ":bg" : mediaItemId,
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
        const effectiveTmdbId = selectedTmdbId ?? poster.media.tmdb_id ?? null;
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
        });
        if (isBackdrop) {
          setAppliedPreviews((prev) => new Map(prev).set(item.id + ":bg", poster.assets.preview.url));
          setFailedShowBg(false);
          onTrack(item.id + ":bg", trackingRecord(item.id, "show", effectiveTmdbId));
        } else {
          setAppliedPreviews((prev) => new Map(prev).set(item.id, poster.assets.preview.url));
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
        onTrack(bgKey, trackingRecord(effectiveSeason.id, "season", seasonTmdbId));
      }
      setAppliedIds((prev) => new Set([...prev, poster.poster_id]));
      setDrawerOpen(false);
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
        fetch(`/api/search?tmdb_id=${item.tmdb_id}&type=episode&limit=500`).then((r) => r.json()) as Promise<SearchResult>,
      ]);
    } catch { return; }

    type Job = { label: string; imageUrl: string; plexRatingKey: string; mediaType: string; isBackdrop: boolean; poster: PosterEntry | null; season: MediaItem | null; previewUrl: string };
    const jobs: Job[] = [];

    const fmt = (n: number) => String(n).padStart(2, "0");

    // Show poster — skip if this creator's artwork is already tracked for the show
    const showPoster = (showResults.results ?? []).find((p) => p.creator.creator_id === appliedCreatorId);
    const showAlreadyTracked = trackedItem?.creator_id === appliedCreatorId;
    if (showPoster && item.id !== justAppliedRatingKey && !showAlreadyTracked) {
      jobs.push({ label: "TV show poster", imageUrl: showPoster.assets.full.url, plexRatingKey: item.id, mediaType: "show", isBackdrop: false, poster: showPoster, season: null, previewUrl: showPoster.assets.preview.url });
    }

    // Show backdrop
    const showBackdrop = (backdropResults.results ?? []).find((p) => p.creator.creator_id === appliedCreatorId && !p.media.season_number);
    if (showBackdrop) {
      jobs.push({ label: "TV show backdrop", imageUrl: showBackdrop.assets.full.url, plexRatingKey: item.id, mediaType: "show", isBackdrop: true, poster: showBackdrop, season: null, previewUrl: showBackdrop.assets.preview.url });
    }

    // Season posters and backdrops
    for (const season of seasons) {
      if (season.index == null) continue;
      const label = `Season ${fmt(season.index)}`;

      const seasonPoster = (seasonResults.results ?? []).find((p) => p.creator.creator_id === appliedCreatorId && p.media.season_number === season.index);
      const seasonAlreadyTracked = trackedArtwork.get(season.id)?.creator_id === appliedCreatorId;
      if (seasonPoster && season.id !== justAppliedRatingKey && !seasonAlreadyTracked) {
        jobs.push({ label: `${label} poster`, imageUrl: seasonPoster.assets.full.url, plexRatingKey: season.id, mediaType: "season", isBackdrop: false, poster: seasonPoster, season, previewUrl: seasonPoster.assets.preview.url });
      }

      const seasonBackdrop = (backdropResults.results ?? []).find((p) => p.creator.creator_id === appliedCreatorId && p.media.season_number === season.index);
      if (seasonBackdrop) {
        jobs.push({ label: `${label} backdrop`, imageUrl: seasonBackdrop.assets.full.url, plexRatingKey: season.id, mediaType: "season", isBackdrop: true, poster: seasonBackdrop, season, previewUrl: seasonBackdrop.assets.preview.url });
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
            const epPoster = creatorEpisodePosters.find((p) => p.media.season_number === seasonNum && p.media.episode_number === episode.index);
            if (epPoster) {
              jobs.push({ label: `Season ${fmt(seasonNum)}, Episode ${fmt(episode.index)}`, imageUrl: epPoster.assets.full.url, plexRatingKey: episode.id, mediaType: "episode", isBackdrop: false, poster: epPoster, season, previewUrl: epPoster.assets.preview.url });
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
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, bgKey).catch(() => {});
      onUntrack(bgKey);
      // Store a cache-busted artUrl under the ":bg" key so the card re-fetches
      // whatever Plex has after the metadata refresh, bypassing the browser cache.
      const bustUrl = `${artUrl(conn.nodeUrl, conn.adminToken, plexRatingKey)}&v=${Date.now()}`;
      setAppliedPreviews((prev) => new Map(prev).set(bgKey, bustUrl));

      // Try to push the TMDB default backdrop. If TMDB has none (or no tmdb_id),
      // we still untracked above — the card reloads from Plex and shows as missing
      // naturally if Plex has nothing either.
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
      }
      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    } finally {
      setResettingIds((prev) => { const s = new Set(prev); s.delete(bgKey); return s; });
    }
  }

  // ── Derived display values ────────────────────────────────────────────────
  const creatorName = trackedItem?.creator_display_name ?? null;
  const themeId = trackedItem?.theme_id ?? null;
  const themeName = themeId ? (subs.find((s) => s.themeId === themeId)?.themeName ?? themeId) : null;
  const appliedAt = trackedItem?.applied_at
    ? new Date(trackedItem.applied_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;

  const showThumbSrc = appliedPreviews.get(item.id) ?? thumbUrl(conn.nodeUrl, conn.adminToken, item.id);
  const showThumbPoster: PosterEntry = {
    poster_id: item.id,
    media: { type: "show", title: item.title, year: item.year ?? undefined },
    creator: { creator_id: "", display_name: creatorName ?? "", home_node: "" },
    assets: {
      preview: { url: showThumbSrc, hash: "", mime: "image/jpeg" },
      full: { url: showThumbSrc, hash: "", mime: "image/jpeg", access: "public" },
    },
  };

  const altChip = selectedKind === "show"
    ? { label: "TV SHOW", color: "error" as const }
    : { label: "SEASON", color: "secondary" as const };
  const showAltSpinner = altLoading || altLoadedForKey !== selectedKey;
  const drawerSeason = seasons.find((s) => s.id === drawerSeasonId) ?? null;
  const drawerSubtitle = drawerKind === "show"
    ? "This Show"
    : drawerSeason?.index != null
      ? `Season ${String(drawerSeason.index).padStart(2, "0")}`
      : "This show";
  const drawerChip = drawerIsBackdrop
    ? { label: "BACKDROP", color: "warning" as const }
    : drawerKind === "show"
      ? { label: "TV SHOW", color: "error" as const }
      : { label: "SEASON", color: "secondary" as const };
  const drawerFromSubs = drawerPosters.filter(
    (p) => (p.media.theme_id && subscribedThemeIds.has(p.media.theme_id)) || subscribedCreatorIds.has(p.creator.creator_id),
  );
  const drawerOthers = drawerPosters.filter((p) => !drawerFromSubs.includes(p));

  const closeOverlay = () => { setSelectedKind("show"); setSelectedSeasonId(null); };

  const isShowCreatorSubscribed = trackedItem?.creator_id ? creatorSubs.has(trackedItem.creator_id) : false;
  const handleShowCreatorSubscribe = () => {
    if (!trackedItem?.creator_id) return;
    if (isShowCreatorSubscribed) {
      unsubscribeCreator(trackedItem.creator_id);
      setCreatorSubs((prev) => { const s = new Set(prev); s.delete(trackedItem.creator_id!); return s; });
    } else {
      subscribeCreator({ creatorId: trackedItem.creator_id, creatorDisplayName: trackedItem.creator_display_name ?? trackedItem.creator_id, nodeBase: trackedItem.node_base ?? "" });
      setCreatorSubs((prev) => new Set([...prev, trackedItem.creator_id!]));
    }
  };

  const showCardSeasonCount = item.child_count ?? seasons.length;
  const showCardEpisodeCount = item.leaf_count ?? 0;
  const showCardSubtitle = `${showCardSeasonCount} season${showCardSeasonCount !== 1 ? "s" : ""} · ${showCardEpisodeCount} episode${showCardEpisodeCount !== 1 ? "s" : ""}`;

  const isShowResetting = resettingIds.has(item.id);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box>
      {/* Back */}
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 2 }}>
        <IconButton size="small" onClick={onBack} aria-label={t("backToShows")}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ cursor: "pointer" }} onClick={onBack}>
          {t("backToShows")}
        </Typography>
      </Stack>

      <Typography variant="h5" gutterBottom>{item.title}</Typography>

      {/* BOX SET card + Seasons grid */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={3} alignItems="flex-start" sx={{ mb: 4 }}>

        {/* BOX SET card */}
        <Box sx={{ flexShrink: 0 }}>
          <Typography variant="overline" color="text.secondary"
            sx={{ display: "block", mb: 1, fontSize: "0.65rem", letterSpacing: 1.5 }}>
            {t("tvShowLabel")}
          </Typography>
          <Box ref={showCardRef} sx={{ width: "var(--op-poster-width, 180px)", display: "flex", flexDirection: "column", gap: 1 }}>
            <MediaCard
                    image={showThumbSrc}
                    resetting={isShowResetting}
                    alt={item.title}
                    selected={selectedShowCard}
                    imageFailed={failedThumb}
                    onImageError={() => setFailedThumb(true)}
                    onClick={() => { setSelectedShowCard(true); setSelectedSeasonId(null); setSelectedBackdropId(null); }}
                    onClose={() => setSelectedShowCard(false)}
                    tooltip="View alternate artwork and other options"
                    badge={trackedItem ? (
                      <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: "white", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.08)" }}>
                        <DoneIcon sx={{ fontSize: 13, color: "black" }} />
                      </Box>
                    ) : undefined}
                    chip={<Chip label="TV SHOW" size="small" color="error" sx={{ fontWeight: 700, fontSize: "0.6rem", height: 20, borderRadius: "0 6px 6px 0", pointerEvents: "none", textTransform: "uppercase" }} />}
                    overlay={
                      <MediaCardOverlay title={item.title} subtitle={showCardSubtitle}>
                        <ToolbarButton
                          cols={2}
                          icon={isShowCreatorSubscribed ? <StarIcon sx={{ fontSize: "1.1rem" }} /> : <StarBorderIcon sx={{ fontSize: "1.1rem" }} />}
                          disabled={!trackedItem}
                          active={isShowCreatorSubscribed}
                          tooltip={isShowCreatorSubscribed ? "Subscribed" : "Subscribe to creator"}
                          menuItems={trackedItem?.creator_id ? [
                            { label: isShowCreatorSubscribed ? "Unsubscribe" : "Subscribe", onClick: () => { handleShowCreatorSubscribe(); setTimeout(() => setSelectedShowCard(false), 500); } },
                          ] : undefined}
                        />
                        <ToolbarButton
                          cols={2}
                          icon={<ReplayIcon sx={{ fontSize: "1.1rem" }} />}
                          disabled={!trackedItem}
                          tooltip="Reset to default"
                          onClick={(e) => { e.stopPropagation(); handleReset(item.id, "show"); setSelectedShowCard(false); }}
                        />
                        <ToolbarButton cols={2} size="sm" label="UPLOAD" tooltip="Upload your own poster" onClick={(e) => { e.stopPropagation(); setSelectedShowCard(false); }} />
                        <ToolbarButton
                          cols={2}
                          size="sm"
                          label={trackedItem ? "CHANGE" : "SELECT"}
                          tooltip="Select a new poster from an OpenPoster creator"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedShowCard(false);
                            setDrawerKind("show");
                            setDrawerSeasonId(null);
                            setDrawerIsBackdrop(false);
                            setDrawerPosters([]);
                            setDrawerOpen(true);
                            if (item.tmdb_id) {
                              setDrawerLoading(true);
                              fetch(`/api/search?tmdb_id=${item.tmdb_id}&type=show&limit=50`)
                                .then((r) => r.json())
                                .then((d: { results: PosterEntry[] }) => {
                                  setDrawerPosters(d.results.filter((p) => typeof p.assets?.preview?.url === "string" && p.assets.preview.url.length > 0));
                                })
                                .catch(() => setDrawerPosters([]))
                                .finally(() => setDrawerLoading(false));
                            }
                          }}
                        />
                      </MediaCardOverlay>
                    }
            />
            <MediaCard
              image={failedShowBg ? null : (appliedPreviews.get(item.id + ":bg") ?? artUrl(conn.nodeUrl, conn.adminToken, item.id))}
              alt={`${item.title} backdrop`}
              aspectRatio="16 / 9"
              imageFailed={failedShowBg}
              onImageError={() => setFailedShowBg(true)}
              resetting={resettingIds.has(item.id + ":bg")}
              selected={selectedBackdropId === item.id}
              onClick={() => { setSelectedBackdropId(item.id); setSelectedKind("show"); setSelectedSeasonId(null); }}
              onClose={() => setSelectedBackdropId(null)}
              tooltip="View backdrop options"
              badge={trackedArtwork.get(item.id + ":bg") ? (
                <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: "white", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.08)" }}>
                  <DoneIcon sx={{ fontSize: 13, color: "black" }} />
                </Box>
              ) : undefined}
              chip={<Chip label="TV SHOW" size="small" color="error" sx={{ fontWeight: 700, fontSize: "0.6rem", height: 20, borderRadius: "0 6px 6px 0", pointerEvents: "none", textTransform: "uppercase" }} />}
              overlay={
                <MediaCardOverlay title={item.title} subtitle={showCardSubtitle}>
                  <Box sx={{ gridColumn: "span 4", display: "flex", gap: 0.75 }}>
                    <Box sx={{ flex: 1 }}><ToolbarButton icon={<UploadIcon sx={{ fontSize: "1.1rem" }} />} tooltip="Upload your own backdrop" onClick={(e) => e.stopPropagation()} /></Box>
                    <Box sx={{ flex: 1 }}><ToolbarButton
                      icon={<ReplayIcon sx={{ fontSize: "1.1rem" }} />}
                      tooltip="Reset to default backdrop"
                      onClick={(e) => { e.stopPropagation(); setSelectedBackdropId(null); handleResetBackdrop(item.id, "show"); }}
                    /></Box>
                    <Box sx={{ flex: 1 }}><ToolbarButton
                      icon={<PhotoLibraryIcon sx={{ fontSize: "1.1rem" }} />}
                      tooltip="Select a backdrop from an OpenPoster creator"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBackdropId(null);
                        setDrawerKind("show");
                        setDrawerSeasonId(null);
                        setDrawerIsBackdrop(true);
                        setDrawerPosters([]);
                        setDrawerOpen(true);
                        if (item.tmdb_id) {
                          setDrawerLoading(true);
                          fetch(`/api/search?tmdb_id=${item.tmdb_id}&type=backdrop&limit=50`)
                            .then((r) => r.json())
                            .then((d: { results: PosterEntry[] }) => {
                              setDrawerPosters(d.results.filter((p) => typeof p.assets?.preview?.url === "string" && p.assets.preview.url.length > 0));
                            })
                            .catch(() => setDrawerPosters([]))
                            .finally(() => setDrawerLoading(false));
                        }
                      }}
                    /></Box>
                  </Box>
                </MediaCardOverlay>
              }
            />
          </Box>
        </Box>

        {/* Seasons grid */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary"
            sx={{ display: "block", mb: 1, fontSize: "0.65rem", letterSpacing: 1.5 }}>
            {t("seasons")}
          </Typography>
          {seasonsLoading ? (
            <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={24} /></Stack>
          ) : seasons.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t("noItems")}</Typography>
          ) : (
            <Box ref={seasonsGridRef} sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
              {seasons.map((season) => {
                const failed = failedThumbs.has(season.id);
                const isSelected = selectedKind === "season" && season.id === selectedSeasonId;
                const tracked = trackedArtwork.get(season.id) ?? null;
                const isCreatorSubscribed = tracked?.creator_id ? creatorSubs.has(tracked.creator_id) : false;
                const epCount = season.leaf_count ?? 0;
                const seasonNum = season.index != null
                  ? `Season ${String(season.index).padStart(2, "0")}`
                  : (season.title ?? "");
                const seasonSubtitle = [seasonNum, season.year ? String(season.year) : null].filter(Boolean).join(" · ");

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

                const failedBg = failedThumbs.has(season.id + ":bg");

                const isResetting = resettingIds.has(season.id);

                return (
                  <Box key={season.id} sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <MediaCard
                      resetting={isResetting}
                      image={appliedPreviews.get(season.id) ?? (failed ? null : thumbUrl(conn.nodeUrl, conn.adminToken, season.id))}
                      alt={seasonNum}
                      selected={isSelected}
                      imageFailed={failed}
                      onImageError={() => onMarkFailed(season.id)}
                      onClick={() => { setSelectedKind("season"); setSelectedSeasonId(season.id); setSelectedBackdropId(null); }}
                      onClose={() => { setSelectedKind("show"); setSelectedSeasonId(null); }}
                      tooltip="View alternate artwork and other options"
                      badge={tracked ? (
                        <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: "white", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.08)" }}>
                          <DoneIcon sx={{ fontSize: 13, color: "black" }} />
                        </Box>
                      ) : undefined}
                      chip={
                        failed
                          ? <Chip label="MISSING" size="small" color="error" sx={{ fontWeight: 700, fontSize: "0.6rem", height: 20, borderRadius: "0 6px 6px 0", pointerEvents: "none", textTransform: "uppercase" }} />
                          : <Chip label={seasonNum} size="small" color="secondary" sx={{ fontWeight: 700, fontSize: "0.6rem", height: 20, borderRadius: "0 6px 6px 0", pointerEvents: "none", textTransform: "uppercase" }} />
                      }
                      overlay={
                        <MediaCardOverlay title={item.title} subtitle={seasonSubtitle} detail={season.index != null && season.title && !/^season\s+0*\d+$/i.test(season.title.trim()) ? season.title : undefined}>
                          {/* Row 1: Subscribe (1/3) + Episodes (2/3) */}
                          <Box sx={{ gridColumn: "span 4", display: "flex", gap: 0.75 }}>
                            <Box sx={{ flex: 1 }}>
                              {failed ? (
                                <ToolbarButton
                                  icon={<RefreshIcon sx={{ fontSize: "1.1rem" }} />}
                                  tooltip="Retry download"
                                  onClick={(e) => { e.stopPropagation(); onMarkRetry(season.id); closeOverlay(); }}
                                />
                              ) : (
                                <ToolbarButton
                                  icon={isCreatorSubscribed ? <StarIcon sx={{ fontSize: "1.1rem" }} /> : <StarBorderIcon sx={{ fontSize: "1.1rem" }} />}
                                  disabled={!tracked}
                                  active={isCreatorSubscribed}
                                  tooltip={isCreatorSubscribed ? "Subscribed" : "Subscribe to creator"}
                                  menuItems={tracked?.creator_id ? [
                                    { label: isCreatorSubscribed ? "Unsubscribe" : "Subscribe", onClick: () => { handleCreatorSubscribe(); setTimeout(closeOverlay, 500); } },
                                  ] : undefined}
                                />
                              )}
                            </Box>
                            <Box sx={{ flex: 2 }}>
                              <ToolbarButton
                                label={epCount === 1 ? "1 EPISODE" : `${epCount} EPISODES`}
                                disabled={epCount === 0}
                                tooltip="Show episode cards"
                                onClick={(e) => { e.stopPropagation(); onViewEpisodes?.(season); closeOverlay(); }}
                              />
                            </Box>
                          </Box>
                          {/* Row 2: Upload + Reset + Select (equal thirds) */}
                          <Box sx={{ gridColumn: "span 4", display: "flex", gap: 0.75 }}>
                            <Box sx={{ flex: 1 }}><ToolbarButton icon={<UploadIcon sx={{ fontSize: "1.1rem" }} />} tooltip="Upload your own poster" onClick={(e) => { e.stopPropagation(); closeOverlay(); }} /></Box>
                            <Box sx={{ flex: 1 }}><ToolbarButton
                              icon={<ReplayIcon sx={{ fontSize: "1.1rem" }} />}
                              disabled={!tracked}
                              tooltip="Reset to default"
                              onClick={(e) => { e.stopPropagation(); handleReset(season.id, "season", season.index); closeOverlay(); }}
                            /></Box>
                            <Box sx={{ flex: 1 }}><ToolbarButton
                              icon={<PhotoLibraryIcon sx={{ fontSize: "1.1rem" }} />}
                              tooltip="Select a new poster from an OpenPoster creator"
                              onClick={(e) => {
                                e.stopPropagation();
                                closeOverlay();
                                const tmdbId = season.tmdb_id ?? item.tmdb_id ?? null;
                                setDrawerKind("season");
                                setDrawerSeasonId(season.id);
                                setDrawerIsBackdrop(false);
                                setDrawerPosters([]);
                                setDrawerOpen(true);
                                if (tmdbId) {
                                  setDrawerLoading(true);
                                  fetch(`/api/search?tmdb_id=${tmdbId}&type=season&limit=50`)
                                    .then((r) => r.json())
                                    .then((d: { results: PosterEntry[] }) => {
                                      let results = d.results.filter((p) => typeof p.assets?.preview?.url === "string" && p.assets.preview.url.length > 0);
                                      if (season.index != null) results = results.filter((p) => p.media.season_number === season.index);
                                      setDrawerPosters(results);
                                    })
                                    .catch(() => setDrawerPosters([]))
                                    .finally(() => setDrawerLoading(false));
                                }
                              }}
                            /></Box>
                          </Box>
                        </MediaCardOverlay>
                      }
                    />
                    <MediaCard
                      image={failedBg ? null : (appliedPreviews.get(season.id + ":bg") ?? artUrl(conn.nodeUrl, conn.adminToken, season.id))}
                      alt={`${seasonNum} backdrop`}
                      aspectRatio="16 / 9"
                      imageFailed={failedBg}
                      onImageError={() => onMarkFailed(season.id + ":bg")}
                      resetting={resettingIds.has(season.id + ":bg")}
                      selected={selectedBackdropId === season.id}
                      onClick={() => { setSelectedBackdropId(season.id); setSelectedKind("show"); setSelectedSeasonId(null); }}
                      onClose={() => setSelectedBackdropId(null)}
                      tooltip="View backdrop options"
                      badge={trackedArtwork.get(season.id + ":bg") ? (
                        <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: "white", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.08)" }}>
                          <DoneIcon sx={{ fontSize: 13, color: "black" }} />
                        </Box>
                      ) : undefined}
                      chip={<Chip label={seasonNum} size="small" color="secondary" sx={{ fontWeight: 700, fontSize: "0.6rem", height: 20, borderRadius: "0 6px 6px 0", pointerEvents: "none", textTransform: "uppercase" }} />}
                      overlay={
                        <MediaCardOverlay title={item.title} subtitle={seasonSubtitle}>
                          <Box sx={{ gridColumn: "span 4", display: "flex", gap: 0.75 }}>
                            <Box sx={{ flex: 1 }}><ToolbarButton icon={<UploadIcon sx={{ fontSize: "1.1rem" }} />} tooltip="Upload your own backdrop" onClick={(e) => e.stopPropagation()} /></Box>
                            <Box sx={{ flex: 1 }}><ToolbarButton
                              icon={<ReplayIcon sx={{ fontSize: "1.1rem" }} />}
                              tooltip="Reset to default backdrop"
                              onClick={(e) => { e.stopPropagation(); setSelectedBackdropId(null); handleResetBackdrop(season.id, "season"); }}
                            /></Box>
                            <Box sx={{ flex: 1 }}><ToolbarButton
                              icon={<PhotoLibraryIcon sx={{ fontSize: "1.1rem" }} />}
                              tooltip="Select a backdrop from an OpenPoster creator"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBackdropId(null);
                                setDrawerKind("season");
                                setDrawerSeasonId(season.id);
                                setDrawerIsBackdrop(true);
                                setDrawerPosters([]);
                                setDrawerOpen(true);
                                const tmdbId = season.tmdb_id ?? item.tmdb_id ?? null;
                                if (tmdbId) {
                                  setDrawerLoading(true);
                                  fetch(`/api/search?tmdb_id=${tmdbId}&type=backdrop&limit=50`)
                                    .then((r) => r.json())
                                    .then((d: { results: PosterEntry[] }) => {
                                      setDrawerPosters(d.results.filter((p) => typeof p.assets?.preview?.url === "string" && p.assets.preview.url.length > 0));
                                    })
                                    .catch(() => setDrawerPosters([]))
                                    .finally(() => setDrawerLoading(false));
                                }
                              }}
                            /></Box>
                          </Box>
                        </MediaCardOverlay>
                      }
                    />
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Stack>

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
              <Typography variant="h6" noWrap sx={{ lineHeight: 1.2 }}>{item.title}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>{drawerSubtitle}</Typography>
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
                  <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                    {drawerFromSubs.map((p) => (
                      <Box key={p.poster_id}>
                        <AltArtworkCard poster={p} subs={subs} applyingId={applyingId} appliedIds={appliedIds} chip={drawerChip} onApply={(p) => handleApply(p, drawerKind === "season" ? (drawerSeason ?? undefined) : undefined, drawerIsBackdrop)}
                        isBackdrop={drawerIsBackdrop} />
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
              {drawerOthers.length > 0 && (
                <Box>
                  <Typography variant="overline" color="text.secondary"
                    sx={{ display: "block", mb: 1, fontSize: "0.65rem", letterSpacing: 1.5 }}>
                    {drawerKind === "show" ? "Other posters for this show" : "Other posters for this season"}
                  </Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                    {drawerOthers.map((p) => (
                      <Box key={p.poster_id}>
                        <AltArtworkCard poster={p} subs={subs} applyingId={applyingId} appliedIds={appliedIds} chip={drawerChip} onApply={(p) => handleApply(p, drawerKind === "season" ? (drawerSeason ?? undefined) : undefined, drawerIsBackdrop)}
                        isBackdrop={drawerIsBackdrop} />
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
