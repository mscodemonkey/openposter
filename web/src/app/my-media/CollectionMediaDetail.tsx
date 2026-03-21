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
import type { PosterEntry } from "@/lib/types";
import type { ThemeSubscription } from "@/lib/subscriptions";
import { getSubscriptions } from "@/lib/subscriptions";
import { applyToPlexPoster } from "@/lib/plex";
import { fetchPosterFromNode, getArtworkSettings, getTrackedArtwork, untrackArtwork } from "@/lib/artwork-tracking";
import type { TrackedArtwork } from "@/lib/artwork-tracking";
import { thumbUrl } from "@/lib/media-server";
import type { MediaItem } from "@/lib/media-server";
import { POSTER_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";

// ─── TMDB resolution ──────────────────────────────────────────────────────────

type TmdbResolution =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "confirmed"; tmdbId: number }
  | { status: "pending-confirm"; tmdbId: number; tmdbName: string; posterPath: string | null; movieThumbs: string[] }
  | { status: "text-search" };

function normaliseCollectionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/\s+collection$/i, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

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

// ─── TmdbConfirmCard ──────────────────────────────────────────────────────────

function TmdbConfirmCard({
  tmdbName, posterPath, movieThumbs, onConfirm, onReject,
}: {
  tmdbName: string;
  posterPath: string | null;
  movieThumbs: string[];
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2, mb: 3, maxWidth: 560 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        We found a possible TMDB match: <strong>{tmdbName}</strong>
      </Typography>
      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 2 }}>
        {posterPath && (
          <Box component="img" src={`https://image.tmdb.org/t/p/w342${posterPath}`} alt={tmdbName}
            sx={{ width: 80, borderRadius: 0.5, flexShrink: 0, display: "block" }} />
        )}
        {movieThumbs.map((url, i) => (
          <Box key={i} component="img" src={url} alt={`Movie ${i + 1}`}
            sx={{ width: 46, borderRadius: 0.5, flexShrink: 0, display: "block" }} />
        ))}
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="contained" onClick={onConfirm}>Yes, that&apos;s it</Button>
        <Button size="small" variant="outlined" onClick={onReject}>No, search by name</Button>
      </Stack>
    </Box>
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePoster(item: MediaItem, src: string, creatorName = ""): PosterEntry {
  return {
    poster_id: item.id,
    media: { type: item.type, tmdb_id: item.tmdb_id ?? undefined, title: item.title, year: item.year ?? undefined },
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

// ─── CollectionMediaDetail ────────────────────────────────────────────────────

interface CollectionMediaDetailProps {
  item: MediaItem;
  conn: { nodeUrl: string; adminToken: string };
  onBack: () => void;
  movies: MediaItem[];
  childrenLoading: boolean;
  failedThumbs: Set<string>;
  trackedArtwork: Map<string, TrackedArtwork>;
  onMarkFailed: (id: string) => void;
  onMarkRetry: (id: string) => void;
  onUntrack: (id: string) => void;
  onTrack: (id: string, artwork: TrackedArtwork) => void;
}

export default function CollectionMediaDetail({
  item,
  conn,
  onBack,
  movies,
  childrenLoading,
  failedThumbs,
  trackedArtwork,
  onMarkFailed,
  onMarkRetry,
  onUntrack,
  onTrack,
}: CollectionMediaDetailProps) {
  const t = useTranslations("myMedia");

  // ── TMDB resolution (for collection alt artwork) ───────────────────────────
  const [tmdbRes, setTmdbRes] = useState<TmdbResolution>({ status: "idle" });

  // ── Selection: collection pre-selected by default ─────────────────────────
  const [selectedKind, setSelectedKind] = useState<"collection" | "movie">("collection");
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null);

  // ── Alt artwork ───────────────────────────────────────────────────────────
  const [altPosters, setAltPosters] = useState<PosterEntry[]>([]);
  const [altLoading, setAltLoading] = useState(false);
  const [altLoadedForKey, setAltLoadedForKey] = useState<string | null>(null);
  const altFetchKeyRef = useRef<string | null>(null);

  // ── Apply ─────────────────────────────────────────────────────────────────
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  // Override thumb URLs immediately after applying, keyed by media_item_id.
  const [appliedPreviews, setAppliedPreviews] = useState<Map<string, string>>(new Map());
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false, message: "", severity: "success",
  });

  // ── Creator suggestion state ───────────────────────────────────────────────
  type SuggestionItem = { mediaItem: MediaItem; poster: PosterEntry; isCollection: boolean };
  const [suggestion, setSuggestion] = useState<{
    creatorId: string;
    creatorName: string;
    items: SuggestionItem[];
  } | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);

  // ── Collection tracking ───────────────────────────────────────────────────
  const [trackedItem, setTrackedItem] = useState<TrackedArtwork | null>(null);
  const [failedThumb, setFailedThumb] = useState(false);

  useEffect(() => {
    getArtworkSettings(conn.nodeUrl, conn.adminToken)
      .then((s) => setAutoUpdateEnabled(s.auto_update_artwork));
  }, [conn.nodeUrl, conn.adminToken]);

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

  // ── TMDB resolution: uses movies prop to avoid a duplicate fetch ───────────
  useEffect(() => {
    if (item.tmdb_id != null) {
      setTmdbRes({ status: "confirmed", tmdbId: item.tmdb_id });
      return;
    }
    // Wait until children have loaded from the parent
    if (childrenLoading) return;

    setTmdbRes({ status: "resolving" });
    const first = movies.find((m) => m.tmdb_id != null);
    if (!first) { setTmdbRes({ status: "text-search" }); return; }

    fetch(`/api/tmdb/movie/${first.tmdb_id}`)
      .then(async (r) => {
        if (!r.ok) { setTmdbRes({ status: "text-search" }); return; }
        const d = await r.json() as {
          belongs_to_collection?: { id: number; name: string; poster_path: string | null } | null;
        };
        const btc = d.belongs_to_collection;
        if (!btc) { setTmdbRes({ status: "text-search" }); return; }
        if (normaliseCollectionName(btc.name) === normaliseCollectionName(item.title)) {
          setTmdbRes({ status: "confirmed", tmdbId: btc.id });
        } else {
          const cr = await fetch(`/api/tmdb/collection/${btc.id}`)
            .then((r) => r.ok ? r.json() : null)
            .catch(() => null) as { parts?: { poster_path: string | null }[] } | null;
          const thumbs = (cr?.parts ?? [])
            .filter((p) => p.poster_path)
            .slice(0, 4)
            .map((p) => `https://image.tmdb.org/t/p/w92${p.poster_path}`);
          setTmdbRes({ status: "pending-confirm", tmdbId: btc.id, tmdbName: btc.name, posterPath: btc.poster_path, movieThumbs: thumbs });
        }
      })
      .catch(() => setTmdbRes({ status: "text-search" }));
  }, [item.id, item.tmdb_id, item.title, movies, childrenLoading]);

  // ── Subscriptions ─────────────────────────────────────────────────────────
  const subs = useMemo(() => getSubscriptions(), []);
  const subscribedThemeIds = useMemo(() => new Set(subs.map((s) => s.themeId)), [subs]);
  const subscribedCreatorIds = useMemo(() => new Set(subs.map((s) => s.creatorId)), [subs]);
  const subThemeNames = useMemo(() => new Map(subs.map((s) => [s.themeId, s.themeName])), [subs]);

  // ── Derived selection ─────────────────────────────────────────────────────
  const selectedMovie = useMemo(
    () => movies.find((m) => m.id === selectedMovieId) ?? null,
    [movies, selectedMovieId],
  );
  const selectedKey = selectedKind === "collection" ? "collection" : (selectedMovieId ?? "collection");

  // ── Alt artwork fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    const key = selectedKey;
    altFetchKeyRef.current = key;

    if (selectedKind === "collection") {
      if (tmdbRes.status === "idle" || tmdbRes.status === "resolving" || tmdbRes.status === "pending-confirm") return;
      setAltLoading(true);
      const url = tmdbRes.status === "confirmed"
        ? `/api/search?tmdb_id=${tmdbRes.tmdbId}&type=collection&limit=50`
        : `/api/search?q=${encodeURIComponent(item.title)}&type=collection&limit=50`;
      fetch(url)
        .then((r) => r.json())
        .then((d: { results: PosterEntry[] }) => {
          if (altFetchKeyRef.current !== key) return;
          setAltPosters(d.results.filter((p) => typeof p.assets?.preview?.url === "string" && p.assets.preview.url.length > 0));
          setAltLoadedForKey(key);
        })
        .catch(() => { if (altFetchKeyRef.current === key) { setAltPosters([]); setAltLoadedForKey(key); } })
        .finally(() => { if (altFetchKeyRef.current === key) setAltLoading(false); });
    } else {
      if (!selectedMovie?.tmdb_id) {
        setAltPosters([]);
        setAltLoading(false);
        setAltLoadedForKey(key);
        return;
      }
      setAltLoading(true);
      fetch(`/api/search?tmdb_id=${selectedMovie.tmdb_id}&type=movie&limit=50`)
        .then((r) => r.json())
        .then((d: { results: PosterEntry[] }) => {
          if (altFetchKeyRef.current !== key) return;
          setAltPosters(d.results.filter((p) => typeof p.assets?.preview?.url === "string" && p.assets.preview.url.length > 0));
          setAltLoadedForKey(key);
        })
        .catch(() => { if (altFetchKeyRef.current === key) { setAltPosters([]); setAltLoadedForKey(key); } })
        .finally(() => { if (altFetchKeyRef.current === key) setAltLoading(false); });
    }
  }, [selectedKind, selectedKey, selectedMovie?.tmdb_id, tmdbRes, item.title]);

  // ── Applied poster filtering ──────────────────────────────────────────────
  const appliedPosterId = selectedKind === "collection"
    ? (trackedItem?.poster_id ?? null)
    : (trackedArtwork.get(selectedMovieId ?? "")?.poster_id ?? null);

  const visibleAltPosters = useMemo(
    () => altPosters.filter((p) => p.poster_id !== appliedPosterId),
    [altPosters, appliedPosterId],
  );

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
  const resolvedTmdbId = tmdbRes.status === "confirmed" ? tmdbRes.tmdbId : item.tmdb_id;

  async function handleApply(poster: PosterEntry) {
    setApplyingId(poster.poster_id);
    try {
      if (selectedKind === "collection") {
        const effectiveTmdbId = resolvedTmdbId ?? poster.media.tmdb_id ?? null;
        await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
          imageUrl: poster.assets.full.url,
          tmdbId: effectiveTmdbId ?? undefined,
          plexRatingKey: item.id,
          mediaType: "collection",
          posterId: poster.poster_id,
          assetHash: poster.assets.full.hash,
          creatorId: poster.creator.creator_id,
          creatorDisplayName: poster.creator.display_name,
          themeId: poster.media.theme_id ?? undefined,
          nodeBase: poster.creator.home_node,
          autoUpdate: autoUpdateEnabled,
        });
        setAppliedPreviews((prev) => new Map(prev).set(item.id, poster.assets.preview.url));
        setTrackedItem({
          media_item_id: item.id,
          tmdb_id: effectiveTmdbId,
          media_type: "collection",
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
      } else if (selectedMovie) {
        const movieTmdbId = selectedMovie.tmdb_id ?? poster.media.tmdb_id ?? null;
        await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
          imageUrl: poster.assets.full.url,
          tmdbId: movieTmdbId ?? undefined,
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
        setAppliedPreviews((prev) => new Map(prev).set(selectedMovie.id, poster.assets.preview.url));
        onTrack(selectedMovie.id, {
          media_item_id: selectedMovie.id,
          tmdb_id: movieTmdbId,
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
      }
      setAppliedIds((prev) => new Set([...prev, poster.poster_id]));
      setSnack({ open: true, message: t("applySuccess"), severity: "success" });
      // Fire-and-forget: check if same creator has posters for other collection items
      const targetId = selectedKind === "collection" ? item.id : (selectedMovie?.id ?? item.id);
      const latestTrackedItem = selectedKind === "collection"
        ? { creator_id: poster.creator.creator_id } as typeof trackedItem
        : trackedItem;
      const latestTrackedArtwork = selectedKind === "movie" && selectedMovie
        ? new Map(trackedArtwork).set(selectedMovie.id, { creator_id: poster.creator.creator_id } as TrackedArtwork)
        : trackedArtwork;
      checkCreatorMatches(
        poster.creator.creator_id,
        poster.creator.display_name,
        targetId,
        latestTrackedItem,
        latestTrackedArtwork,
      ).catch(() => {});
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("applyError"), severity: "error" });
    } finally {
      setApplyingId(null);
    }
  }

  // ── Creator suggestion: check for same-creator posters on other items ─────
  async function checkCreatorMatches(
    appliedCreatorId: string,
    appliedCreatorName: string,
    justAppliedItemId: string,
    latestTrackedItem: typeof trackedItem,
    latestTrackedArtwork: typeof trackedArtwork,
  ) {
    type MatchItem = { mediaItem: MediaItem; poster: PosterEntry; isCollection: boolean };
    const checks: Promise<MatchItem | null>[] = [];

    // Check collection (skip if we just applied to it, or it's already by this creator)
    if (justAppliedItemId !== item.id && latestTrackedItem?.creator_id !== appliedCreatorId) {
      const collTmdbId = tmdbRes.status === "confirmed" ? tmdbRes.tmdbId : item.tmdb_id;
      if (collTmdbId != null) {
        const url = tmdbRes.status === "confirmed"
          ? `/api/search?tmdb_id=${collTmdbId}&type=collection&limit=50`
          : `/api/search?q=${encodeURIComponent(item.title)}&type=collection&limit=50`;
        checks.push(
          fetch(url).then((r) => r.json())
            .then((d: { results: PosterEntry[] }) => {
              const match = d.results?.find((p) => p.creator.creator_id === appliedCreatorId) ?? null;
              return match ? { mediaItem: item, poster: match, isCollection: true } : null;
            })
            .catch(() => null),
        );
      }
    }

    // Check each movie (skip just-applied, already-by-this-creator, and no-tmdb-id)
    for (const movie of movies) {
      if (movie.id === justAppliedItemId) continue;
      if (latestTrackedArtwork.get(movie.id)?.creator_id === appliedCreatorId) continue;
      if (!movie.tmdb_id) continue;
      const tmdbId = movie.tmdb_id;
      checks.push(
        fetch(`/api/search?tmdb_id=${tmdbId}&type=movie&limit=50`)
          .then((r) => r.json())
          .then((d: { results: PosterEntry[] }) => {
            const match = d.results?.find((p) => p.creator.creator_id === appliedCreatorId) ?? null;
            return match ? { mediaItem: movie, poster: match, isCollection: false } : null;
          })
          .catch(() => null),
      );
    }

    if (checks.length === 0) return;
    const results = await Promise.all(checks);
    const matches = results.filter(Boolean) as MatchItem[];
    if (matches.length > 0) {
      setSuggestion({ creatorId: appliedCreatorId, creatorName: appliedCreatorName, items: matches });
    }
  }

  // ── Apply-all handler ─────────────────────────────────────────────────────
  async function handleApplyAll() {
    if (!suggestion) return;
    setApplyingAll(true);
    for (const { mediaItem, poster, isCollection } of suggestion.items) {
      try {
        await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
          imageUrl: poster.assets.full.url,
          tmdbId: mediaItem.tmdb_id ?? undefined,
          plexRatingKey: mediaItem.id,
          mediaType: isCollection ? "collection" : "movie",
          posterId: poster.poster_id,
          assetHash: poster.assets.full.hash,
          creatorId: poster.creator.creator_id,
          creatorDisplayName: poster.creator.display_name,
          themeId: poster.media.theme_id ?? undefined,
          nodeBase: poster.creator.home_node,
          autoUpdate: autoUpdateEnabled,
        });
        setAppliedPreviews((prev) => new Map(prev).set(mediaItem.id, poster.assets.preview.url));
        const record = {
          media_item_id: mediaItem.id,
          tmdb_id: mediaItem.tmdb_id,
          media_type: isCollection ? "collection" : "movie",
          poster_id: poster.poster_id,
          asset_hash: poster.assets.full.hash,
          creator_id: poster.creator.creator_id,
          creator_display_name: poster.creator.display_name,
          theme_id: poster.media.theme_id ?? null,
          node_base: poster.creator.home_node,
          applied_at: new Date().toISOString(),
          auto_update: autoUpdateEnabled,
          plex_label: null,
        };
        if (isCollection) {
          setTrackedItem(record);
        } else {
          onTrack(mediaItem.id, record);
        }
      } catch {
        // silent — best-effort per item
      }
    }
    setSuggestion(null);
    setApplyingAll(false);
    setSnack({ open: true, message: t("suggestionApplied"), severity: "success" });
  }

  // ── Reset handler ─────────────────────────────────────────────────────────
  async function handleReset(mediaItemId: string, tmdbId: number | null, mediaType: string) {
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, mediaItemId);
      setAppliedPreviews((prev) => { const next = new Map(prev); next.delete(mediaItemId); return next; });
      setAppliedIds(new Set());
      if (mediaType === "collection") {
        setTrackedItem(null);
      } else {
        onUntrack(mediaItemId);
      }

      // Push the TMDB default poster to Plex directly (no OP tracking).
      if (tmdbId) {
        const endpoint = mediaType === "collection" ? `/api/tmdb/collection/${tmdbId}` : `/api/tmdb/movie/${tmdbId}`;
        try {
          const tmdbData = await fetch(endpoint).then((r) => r.ok ? r.json() : null) as { poster_path?: string } | null;
          if (tmdbData?.poster_path) {
            const tmdbImageUrl = `https://image.tmdb.org/t/p/original${tmdbData.poster_path}`;
            await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
              imageUrl: tmdbImageUrl,
              plexRatingKey: mediaItemId,
              mediaType,
              // No posterId / assetHash — backend will not create a tracking record
            });
            setAppliedPreviews((prev) => new Map(prev).set(mediaItemId, `https://image.tmdb.org/t/p/w342${tmdbData.poster_path}`));
          }
        } catch {
          // TMDB fetch or apply failed — Plex poster may not revert immediately; silent
        }
      }

      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    }
  }

  // ── Derived display values ────────────────────────────────────────────────
  const creatorName = trackedItem?.creator_display_name ?? null;
  const themeId = trackedItem?.theme_id ?? null;
  const themeName = themeId ? (subs.find((s) => s.themeId === themeId)?.themeName ?? themeId) : null;
  const appliedAt = trackedItem?.applied_at
    ? new Date(trackedItem.applied_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;

  const currentThumbSrc = appliedPreviews.get(item.id) ?? thumbUrl(conn.nodeUrl, conn.adminToken, item.id);
  const currentThumbPoster: PosterEntry = {
    poster_id: item.id,
    media: { type: "collection", title: item.title, year: item.year ?? undefined },
    creator: { creator_id: "", display_name: creatorName ?? "", home_node: "" },
    assets: {
      preview: { url: currentThumbSrc, hash: "", mime: "image/jpeg" },
      full: { url: currentThumbSrc, hash: "", mime: "image/jpeg", access: "public" },
    },
  };

  const missingChip = { label: "MISSING", color: "error" as const };
  const altChip = selectedKind === "collection"
    ? { label: "COLLECTION", color: "primary" as const }
    : { label: "MOVIE", color: "success" as const };
  const showAltSpinner = altLoading || altLoadedForKey !== selectedKey;
  const selectedTitle = selectedKind === "collection" ? item.title : (selectedMovie?.title ?? item.title);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box>
      {/* Back */}
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 2 }}>
        <IconButton size="small" onClick={onBack} aria-label={t("backToCollections")}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ cursor: "pointer" }} onClick={onBack}>
          {t("backToCollections")}
        </Typography>
      </Stack>

      <Typography variant="h5" gutterBottom>{item.title}</Typography>

      {/* Collection card + Movies grid */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={3} alignItems="flex-start" sx={{ mb: 4 }}>

        {/* Collection card */}
        <Box sx={{ flexShrink: 0 }}>
          <Typography variant="overline" color="text.secondary"
            sx={{ display: "block", mb: 1, fontSize: "0.65rem", letterSpacing: 1.5 }}>
            {t("currentCollection")}
          </Typography>
          <Box
            sx={{
              width: "var(--op-poster-width, 180px)",
              cursor: "pointer",
              opacity: selectedKind === "movie" ? 0.85 : 1,
              transition: "opacity 0.15s",
            }}
            onClick={() => { setSelectedKind("collection"); setSelectedMovieId(null); }}
          >
            <PosterCard
              poster={currentThumbPoster}
              managed={!!trackedItem}
              selected={selectedKind === "collection"}
              imageFailed={failedThumb}
              menuSlot={trackedItem ? <CardManageMenu onReset={() => handleReset(item.id, trackedItem.tmdb_id ?? item.tmdb_id, "collection")} /> : undefined}
              imageWrapper={trackedItem ? (img) => <ArtworkMetadataTooltip meta={{ creator: creatorName, theme: themeName, appliedAt }}>{img}</ArtworkMetadataTooltip> : undefined}
              onImageError={() => setFailedThumb(true)}
            />
          </Box>
        </Box>

        {/* Movie cards */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary"
            sx={{ display: "block", mb: 1, fontSize: "0.65rem", letterSpacing: 1.5 }}>
            {t("movies")}
          </Typography>
          {childrenLoading ? (
            <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={24} /></Stack>
          ) : movies.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t("noItems")}</Typography>
          ) : (
            <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
              {movies.map((movie) => {
                const failed = failedThumbs.has(movie.id);
                const isSelected = selectedKind === "movie" && movie.id === selectedMovieId;
                const tracked = trackedArtwork.get(movie.id);
                const meta = makeArtworkMeta(tracked, subThemeNames);
                return (
                  <Box key={movie.id} sx={{
                    opacity: selectedKind === "collection" || (selectedKind === "movie" && !isSelected) ? 0.75 : 1,
                    transition: "opacity 0.15s",
                    cursor: "pointer",
                  }}>
                    <PosterCard
                      poster={makePoster(movie, appliedPreviews.get(movie.id) ?? thumbUrl(conn.nodeUrl, conn.adminToken, movie.id), tracked?.creator_display_name ?? undefined)}
                      chip={failed ? missingChip : undefined}
                      imageFailed={failed}
                      managed={!!tracked}
                      selected={isSelected}
                      menuSlot={failed ? <CardRetryMenu onRetry={() => onMarkRetry(movie.id)} /> : (tracked ? <CardManageMenu onReset={() => handleReset(movie.id, movie.tmdb_id, "movie")} onOpen={() => { setSelectedKind("movie"); setSelectedMovieId(movie.id); }} /> : undefined)}
                      imageWrapper={tracked ? (img) => <ArtworkMetadataTooltip meta={meta}>{img}</ArtworkMetadataTooltip> : undefined}
                      onImageError={() => onMarkFailed(movie.id)}
                      onClick={() => { setSelectedKind("movie"); setSelectedMovieId(movie.id); }}
                    />
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Stack>

      {/* Alt artwork */}
      <Typography variant="h6" gutterBottom>
        {t("alternativePostersFor", { title: selectedTitle })}
      </Typography>

      {selectedKind === "collection" && tmdbRes.status === "pending-confirm" && (
        <TmdbConfirmCard
          tmdbName={tmdbRes.tmdbName}
          posterPath={tmdbRes.posterPath}
          movieThumbs={tmdbRes.movieThumbs}
          onConfirm={() => setTmdbRes({ status: "confirmed", tmdbId: tmdbRes.tmdbId })}
          onReject={() => setTmdbRes({ status: "text-search" })}
        />
      )}

      {selectedKind === "collection" && (tmdbRes.status === "resolving" || tmdbRes.status === "pending-confirm") ? (
        <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
      ) : showAltSpinner ? (
        <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
      ) : selectedKind === "movie" && !selectedMovie?.tmdb_id ? (
        <Alert severity="info" sx={{ maxWidth: 500 }}>
          No TMDB ID — artwork lookup unavailable for this movie.
        </Alert>
      ) : visibleAltPosters.length === 0 ? (
        <Typography color="text.secondary">{t("noAlternatives")}</Typography>
      ) : (
        <Stack spacing={3}>
          {fromSubs.length > 0 && (
            <Box>
              <Typography variant="overline" color="text.secondary"
                sx={{ display: "block", mb: 1, fontSize: "0.65rem", letterSpacing: 1.5 }}>
                {t("fromSubscriptions")}
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                {fromSubs.map((p) => (
                  <Box key={p.poster_id}>
                    <AltArtworkCard poster={p} subs={subs} applyingId={applyingId} appliedIds={appliedIds} chip={altChip} onApply={handleApply} />
                  </Box>
                ))}
              </Box>
            </Box>
          )}
          {others.length > 0 && (
            <Box>
              <Typography variant="overline" color="text.secondary"
                sx={{ display: "block", mb: 1, fontSize: "0.65rem", letterSpacing: 1.5 }}>
                {t("otherPosters")}
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                {others.map((p) => (
                  <Box key={p.poster_id}>
                    <AltArtworkCard poster={p} subs={subs} applyingId={applyingId} appliedIds={appliedIds} chip={altChip} onApply={handleApply} />
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
        <Alert severity={snack.severity} onClose={() => setSnack((prev) => ({ ...prev, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>

      {/* Creator suggestion dialog */}
      <Dialog open={!!suggestion} onClose={() => setSuggestion(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("suggestionTitle")}</DialogTitle>
        <DialogContent>
          <Typography>
            There {suggestion?.items.length === 1 ? "is" : "are"}{" "}
            <strong>{suggestion?.items.length}</strong> other poster
            {suggestion?.items.length !== 1 ? "s" : ""} by{" "}
            <strong>{suggestion?.creatorName}</strong> for this collection.
            Would you like to use them?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuggestion(null)} disabled={applyingAll}>
            {t("suggestionDecline")}
          </Button>
          <Button onClick={handleApplyAll} variant="contained" disabled={applyingAll}>
            {applyingAll ? <CircularProgress size={16} /> : t("suggestionApplyAll")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
