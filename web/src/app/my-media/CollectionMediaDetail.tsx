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
import InputAdornment from "@mui/material/InputAdornment";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SearchIcon from "@mui/icons-material/Search";
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
import { thumbUrl, artUrl, logoUrl, squareUrl } from "@/lib/media-server";
import type { MediaItem } from "@/lib/media-server";
import { POSTER_GRID_COLS, BACKDROP_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";

// ─── TMDB resolution ──────────────────────────────────────────────────────────

type TmdbResolution =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "confirmed"; tmdbId: number; tmdbName: string; source: "auto" | "confirmed" }
  | { status: "pending-confirm"; itemId: string; tmdbId: number; tmdbName: string; posterPath: string | null; movieThumbs: string[]; openInSearch?: boolean }
  | { status: "text-search" };

/** Strips articles, "Collection" suffix, and non-alphanumeric characters for fuzzy name matching against TMDB. */
function normaliseCollectionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/\s+collection$/i, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

const TMDB_MAP_KEY = "openposter_tmdb_collection_map";
type TmdbMapEntry = { tmdbId: number; tmdbName: string; source?: "auto" | "confirmed" } | { rejected: true };

/** Reads the persisted Plex item-id → TMDB mapping from localStorage. Returns an empty object on parse failure. */
function loadTmdbMap(): Record<string, TmdbMapEntry> {
  try { return JSON.parse(localStorage.getItem(TMDB_MAP_KEY) ?? "{}"); } catch { return {}; }
}

/** Persists a single Plex item-id → TMDB entry to localStorage, merging into the existing map. */
function saveTmdbMapEntry(itemId: string, entry: TmdbMapEntry) {
  try {
    const map = loadTmdbMap();
    map[itemId] = entry;
    localStorage.setItem(TMDB_MAP_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

// ─── TmdbConfirmCard ──────────────────────────────────────────────────────────

type TmdbSearchResult = { id: number; name: string; poster_path: string | null };

/**
 * Inline UI shown when a TMDB candidate has been found but needs user confirmation.
 * Renders in "confirm" mode (show the candidate poster + Accept / Search / Reject buttons) or
 * "search" mode (free-text TMDB search with a results grid the user can pick from).
 */
function TmdbConfirmCard({
  tmdbId, tmdbName, posterPath, movieThumbs, collectionTitle, initialMode = "confirm", onConfirm, onNeverAgain,
}: {
  /** TMDB id of the auto-found candidate. */
  tmdbId: number;
  tmdbName: string;
  posterPath: string | null;
  movieThumbs: string[];
  /** Plex collection name — used to pre-fill the search box. */
  collectionTitle: string;
  initialMode?: "confirm" | "search";
  onConfirm: (tmdbId: number, tmdbName: string) => void;
  onNeverAgain: () => void;
}) {
  const t = useTranslations("myMedia");
  const [mode, setMode] = useState<"confirm" | "search">(initialMode);
  const [query, setQuery] = useState(collectionTitle);
  const [results, setResults] = useState<TmdbSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(false);
    try {
      const r = await fetch(`/api/tmdb/search/collection?q=${encodeURIComponent(query.trim())}`);
      const d = await r.json() as { results?: TmdbSearchResult[] };
      setResults(d.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  if (mode === "confirm") {
    return (
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {t("tmdbFoundMatch", { name: tmdbName })}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 2.5 }}>
          {posterPath && (
            <Box component="img" src={`https://image.tmdb.org/t/p/w342${posterPath}`} alt={tmdbName}
              sx={{ width: 80, borderRadius: 0.5, flexShrink: 0, display: "block" }} />
          )}
          {movieThumbs.map((url, i) => (
            <Box key={i} component="img" src={url} alt={`Movie ${i + 1}`}
              sx={{ width: 46, borderRadius: 0.5, flexShrink: 0, display: "block" }} />
          ))}
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button size="small" variant="contained"
            onClick={() => onConfirm(tmdbId, tmdbName)}>
            {t("tmdbYesThatOne")}
          </Button>
          <Button size="small" variant="outlined"
            onClick={() => { setMode("search"); }}>
            {t("tmdbSearchTmdb")}
          </Button>
          <Button size="small" variant="outlined" color="warning"
            onClick={onNeverAgain}>
            {t("tmdbDontTryAgain")}
          </Button>
        </Stack>
      </Box>
    );
  }

  // Search mode
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField
          size="small"
          fullWidth
          placeholder={t("tmdbSearchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
        <Button variant="contained" size="small" onClick={doSearch} disabled={searching || !query.trim()}>
          {searching ? <CircularProgress size={16} /> : t("tmdbSearchButton")}
        </Button>
      </Stack>

      {searched && results.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("tmdbNoResultsFor", { query })}
        </Typography>
      )}

      {results.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2, maxHeight: 260, overflowY: "auto" }}>
          {results.map((r) => (
            <Box
              key={r.id}
              onClick={() => onConfirm(r.id, r.name)}
              sx={{
                width: 140, cursor: "pointer", borderRadius: 0.5, overflow: "hidden",
                border: "2px solid transparent",
                "&:hover": { borderColor: "primary.main" },
              }}
            >
              {r.poster_path
                ? <Box component="img" src={`https://image.tmdb.org/t/p/w185${r.poster_path}`}
                    alt={r.name} sx={{ width: "100%", display: "block" }} />
                : <Box sx={{ width: "100%", aspectRatio: "2/3", bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", px: 0.5 }}>{r.name}</Typography>
                  </Box>
              }
              <Typography variant="caption" display="block" noWrap sx={{ px: 0.25, pt: 0.25, fontSize: "0.6rem" }}>
                {r.name}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      <Button size="small" variant="outlined" color="warning" onClick={onNeverAgain}>
        {t("tmdbDontTryAgain")}
      </Button>
    </Box>
  );
}

// ─── CollectionMediaDetail ────────────────────────────────────────────────────

interface CollectionMediaDetailProps {
  item: MediaItem;
  conn: { nodeUrl: string; adminToken: string };
  movies: MediaItem[];
  /** The item.id that the current `movies` array was loaded for. Null while loading. */
  childrenForId: string | null;
  childrenLoading: boolean;
  failedThumbs: Set<string>;
  trackedArtwork: Map<string, TrackedArtwork>;
  onMarkFailed: (id: string) => void;
  onMarkRetry: (id: string) => void;
  onUntrack: (id: string) => void;
  onTrack: (id: string, artwork: TrackedArtwork) => void;
  onNavigateToMovie: (movie: MediaItem) => void;
  serverName?: string;
  onHeaderStatusChange?: (status: React.ReactNode | null) => void;
}

/**
 * Detail view for a Plex collection, showing all four artwork types (poster, backdrop, square, logo)
 * for the collection itself and per-movie artwork for every child movie. Handles TMDB resolution,
 * artwork apply/reset, creator subscriptions, and the "apply all from same creator" suggestion flow.
 */
export default function CollectionMediaDetail({
  item,
  conn,
  movies,
  childrenForId,
  childrenLoading,
  failedThumbs,
  trackedArtwork,
  onMarkFailed,
  onMarkRetry,
  onUntrack,
  onTrack,
  onNavigateToMovie,
  serverName,
  onHeaderStatusChange,
}: CollectionMediaDetailProps) {
  const t = useTranslations("myMedia");

  // ── TMDB resolution ────────────────────────────────────────────────────────
  const [tmdbRes, setTmdbRes] = useState<TmdbResolution>({ status: "idle" });
  // Tracks which item.id has already been resolved (from cache or lookup) so the
  // resolution effect doesn't overwrite a cached result when deps re-fire.
  const tmdbResolvedForRef = useRef<string | null>(null);

  // ── Drawer ─────────────────────────────────────────────────────────────────
  const [drawerKind, setDrawerKind] = useState<"collection" | "movie">("collection");
  const [drawerMovieId, setDrawerMovieId] = useState<string | null>(null);
  const [drawerIsBackdrop, setDrawerIsBackdrop] = useState(false);
  const [drawerIsLogo, setDrawerIsLogo] = useState(false);
  const [drawerIsSquare, setDrawerIsSquare] = useState(false);
  const { drawerOpen, drawerPosters, drawerLoading, closeDrawer, openDrawer: openArtworkDrawer } = useArtworkDrawer();

  // ── Apply ──────────────────────────────────────────────────────────────────
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [appliedPreviews, setAppliedPreviews] = useState<Map<string, string>>(new Map());
  // Tracks keys where OP artwork was applied this session — separate from appliedPreviews
  // which is also updated on reset (for cache-busting), so can't be used for badge logic.
  const [opAppliedKeys, setOpAppliedKeys] = useState<Set<string>>(new Set());
  const autoUpdateEnabled = useArtworkAutoUpdate(conn.nodeUrl, conn.adminToken);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const [resettingIds, setResettingIds] = useState<Set<string>>(new Set());

  // ── Collection tracking (local) ────────────────────────────────────────────
  const [trackedItem, setTrackedItem] = useState<TrackedArtwork | null>(null);
  const [trackedBackdrop, setTrackedBackdrop] = useState<TrackedArtwork | null>(null);
  const [trackedLogo, setTrackedLogo] = useState<TrackedArtwork | null>(null);
  const [trackedSquare, setTrackedSquare] = useState<TrackedArtwork | null>(null);

  // ── Failures ──────────────────────────────────────────────────────────────
  const [failedThumb, setFailedThumb] = useState(false);
  const [failedShowBg, setFailedShowBg] = useState(false);
  const [failedLogo, setFailedLogo] = useState(false);
  const [failedSquare, setFailedSquare] = useState(false);
  const [failedMovieBgs, setFailedMovieBgs] = useState<Set<string>>(() => new Set());
  const [failedMovieLogos, setFailedMovieLogos] = useState<Set<string>>(() => new Set());
  const [failedMovieSquares, setFailedMovieSquares] = useState<Set<string>>(() => new Set());

  // ── TMDB default images (greyscale placeholders) ───────────────────────────
  const [tmdbImages, setTmdbImages] = useState<{ posterPath: string | null; backdropPath: string | null } | null>(null);

  // ── Creator subscriptions ──────────────────────────────────────────────────
  const { creatorSubs, toggleCreatorSubscription } = useCreatorSubscriptions();

  // ── Snackbar ──────────────────────────────────────────────────────────────
  const [autoMatchMenuAnchor, setAutoMatchMenuAnchor] = useState<HTMLElement | null>(null);
  const [notMatchedMenuAnchor, setNotMatchedMenuAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!onHeaderStatusChange) return;

    if (tmdbRes.status === "resolving") {
      onHeaderStatusChange(
        <Stack direction="row" alignItems="center" spacing={1}>
          <CircularProgress size="1.1rem" sx={{ flexShrink: 0 }} />
          <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: "0.05em", textTransform: "uppercase" }}>
            {t("tmdbSearchingCollection")}
          </Typography>
        </Stack>,
      );
      return;
    }

    if (tmdbRes.status === "confirmed") {
      const isAuto = tmdbRes.source === "auto";
      const { tmdbId: cTmdbId, tmdbName: cTmdbName } = tmdbRes;
      onHeaderStatusChange(
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <IconButton
            size="small"
            sx={{ p: 0, color: "success.main", flexShrink: 0, lineHeight: 0 }}
            onClick={(e) => setAutoMatchMenuAnchor(e.currentTarget)}
            aria-haspopup="true"
          >
            {isAuto
              ? <CheckCircleOutlineIcon sx={{ fontSize: "1.2rem", display: "block" }} />
              : <CheckCircleIcon sx={{ fontSize: "1.2rem", display: "block" }} />}
          </IconButton>
          <Menu
            anchorEl={autoMatchMenuAnchor}
            open={!!autoMatchMenuAnchor}
            onClose={() => setAutoMatchMenuAnchor(null)}
          >
            {isAuto && (
              <MenuItem onClick={() => {
                setAutoMatchMenuAnchor(null);
                saveTmdbMapEntry(item.id, { tmdbId: cTmdbId, tmdbName: cTmdbName, source: "confirmed" });
                setTmdbRes({ status: "confirmed", tmdbId: cTmdbId, tmdbName: cTmdbName, source: "confirmed" });
              }}>
                {t("tmdbConfirmMatch")}
              </MenuItem>
            )}
            <MenuItem onClick={() => {
              setAutoMatchMenuAnchor(null);
              setTmdbRes({ status: "pending-confirm", itemId: item.id, tmdbId: cTmdbId, tmdbName: cTmdbName, posterPath: null, movieThumbs: [], openInSearch: true });
            }}>
              {t("tmdbIncorrectMatch")}
            </MenuItem>
          </Menu>
          <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: "0.05em", textTransform: "uppercase" }}>
            {isAuto ? t("tmdbAutoMatched", { name: cTmdbName, id: cTmdbId }) : t("tmdbMatched", { name: cTmdbName, id: cTmdbId })}
          </Typography>
          <Button
            component="a"
            href={`https://www.themoviedb.org/collection/${cTmdbId}`}
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            variant="outlined"
            color="info"
            endIcon={<OpenInNewIcon sx={{ fontSize: "0.75rem !important" }} />}
            sx={{ fontSize: "0.65rem", py: 0.25, px: 0.75, minWidth: 0, whiteSpace: "nowrap", flexShrink: 0 }}
          >
            {t("tmdbViewInTmdb")}
          </Button>
        </Stack>,
      );
      return;
    }

    if (tmdbRes.status === "text-search") {
      onHeaderStatusChange(
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton
            size="small"
            sx={{ p: 0, color: "warning.main", flexShrink: 0, lineHeight: 0 }}
            onClick={(e) => setNotMatchedMenuAnchor(e.currentTarget)}
            aria-haspopup="true"
          >
            <CancelOutlinedIcon sx={{ fontSize: "1.2rem", display: "block" }} />
          </IconButton>
          <Menu anchorEl={notMatchedMenuAnchor} open={!!notMatchedMenuAnchor} onClose={() => setNotMatchedMenuAnchor(null)}>
            <MenuItem onClick={() => {
              setNotMatchedMenuAnchor(null);
              setTmdbRes({ status: "pending-confirm", itemId: item.id, tmdbId: 0, tmdbName: "", posterPath: null, movieThumbs: [], openInSearch: true });
            }}>
              {t("tmdbSearchTmdb")}
            </MenuItem>
          </Menu>
          <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: "0.05em", textTransform: "uppercase" }}>
            {t("tmdbNotMatched")}
          </Typography>
        </Stack>,
      );
      return;
    }

    onHeaderStatusChange(null);
  }, [autoMatchMenuAnchor, item.id, notMatchedMenuAnchor, onHeaderStatusChange, t, tmdbRes]);

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false, message: "", severity: "success",
  });

  // ── Creator suggestion ─────────────────────────────────────────────────────
  type SuggestionItem = { mediaItem: MediaItem; poster: PosterEntry; isCollection: boolean };
  const [suggestion, setSuggestion] = useState<{
    creatorId: string;
    creatorName: string;
    items: SuggestionItem[];
  } | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    getTrackedArtwork(conn.nodeUrl, conn.adminToken).then((all) => {
      const found = all.find((r) => r.media_item_id === item.id) ?? null;
      const foundBg = all.find((r) => r.media_item_id === item.id + ":bg") ?? null;
      const foundLogo = all.find((r) => r.media_item_id === item.id + ":logo") ?? null;
      const foundSquare = all.find((r) => r.media_item_id === item.id + ":square") ?? null;
      setTrackedItem(found);
      setTrackedBackdrop(foundBg);
      setTrackedLogo(foundLogo);
      setTrackedSquare(foundSquare);
      if (found && !found.creator_display_name && found.node_base && found.poster_id) {
        fetchPosterFromNode(found.node_base, found.poster_id).then((p) => {
          if (p) setTrackedItem((prev) => prev ? { ...prev, creator_display_name: p.creator.display_name } : prev);
        });
      }
      if (foundBg && !foundBg.creator_display_name && foundBg.node_base && foundBg.poster_id) {
        fetchPosterFromNode(foundBg.node_base, foundBg.poster_id).then((p) => {
          if (p) setTrackedBackdrop((prev) => prev ? { ...prev, creator_display_name: p.creator.display_name } : prev);
        });
      }
    });
  }, [item.id, conn.nodeUrl, conn.adminToken]);

  // Fetch TMDB collection poster/backdrop paths once we have a confirmed tmdbId
  const confirmedTmdbId = tmdbRes.status === "confirmed" ? tmdbRes.tmdbId : null;
  useEffect(() => {
    if (!confirmedTmdbId) { setTmdbImages(null); return; }
    let cancelled = false;
    fetch(`/api/tmdb/collection/${confirmedTmdbId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: { poster_path?: string | null; backdrop_path?: string | null } | null) => {
        if (cancelled || !d) return;
        setTmdbImages({ posterPath: d.poster_path ?? null, backdropPath: d.backdrop_path ?? null });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [confirmedTmdbId]);

  // Load cached TMDB mapping or reset when collection changes
  useEffect(() => {
    tmdbResolvedForRef.current = null;
    const saved = loadTmdbMap()[item.id];
    if (saved) {
      tmdbResolvedForRef.current = item.id;
      if ("rejected" in saved) {
        setTmdbRes({ status: "text-search" });
      } else {
        setTmdbRes({ status: "confirmed", tmdbId: saved.tmdbId, tmdbName: saved.tmdbName, source: saved.source ?? "confirmed" });
      }
    } else {
      setTmdbRes({ status: "idle" });
    }
  }, [item.id]);

  // TMDB resolution: use first movie's belongs_to_collection to find the collection TMDB id
  useEffect(() => {
    if (tmdbResolvedForRef.current === item.id) return; // already resolved from cache
    if (item.tmdb_id != null) {
      tmdbResolvedForRef.current = item.id;
      saveTmdbMapEntry(item.id, { tmdbId: item.tmdb_id, tmdbName: item.title, source: "auto" });
      setTmdbRes({ status: "confirmed", tmdbId: item.tmdb_id, tmdbName: item.title, source: "auto" });
      return;
    }
    if (childrenForId !== item.id || childrenLoading) return;
    setTmdbRes({ status: "resolving" });
    const first = movies.find((m) => m.tmdb_id != null);
    if (!first) { setTmdbRes({ status: "text-search" }); return; }

    let cancelled = false;
    fetch(`/api/tmdb/movie/${first.tmdb_id}`)
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) { setTmdbRes({ status: "text-search" }); return; }
        const d = await r.json() as {
          belongs_to_collection?: { id: number; name: string; poster_path: string | null } | null;
        };
        if (cancelled) return;
        const btc = d.belongs_to_collection;
        if (!btc) { setTmdbRes({ status: "text-search" }); return; }
        if (normaliseCollectionName(btc.name) === normaliseCollectionName(item.title)) {
          tmdbResolvedForRef.current = item.id;
          saveTmdbMapEntry(item.id, { tmdbId: btc.id, tmdbName: btc.name, source: "auto" });
          setTmdbRes({ status: "confirmed", tmdbId: btc.id, tmdbName: btc.name, source: "auto" });
        } else {
          const cr = await fetch(`/api/tmdb/collection/${btc.id}`)
            .then((r) => r.ok ? r.json() : null)
            .catch(() => null) as { parts?: { poster_path: string | null }[] } | null;
          if (cancelled) return;
          const thumbs = (cr?.parts ?? [])
            .filter((p) => p.poster_path)
            .slice(0, 4)
            .map((p) => `https://image.tmdb.org/t/p/w92${p.poster_path}`);
          setTmdbRes({ status: "pending-confirm", itemId: item.id, tmdbId: btc.id, tmdbName: btc.name, posterPath: btc.poster_path, movieThumbs: thumbs });
        }
      })
      .catch(() => { if (!cancelled) setTmdbRes({ status: "text-search" }); });
    return () => { cancelled = true; };
  }, [item.id, item.tmdb_id, item.title, movies, childrenForId, childrenLoading]);

  // ── Subscriptions ──────────────────────────────────────────────────────────
  const [subs, setSubs] = useState<ThemeSubscription[]>([]);
  useEffect(() => {
    const token = loadIssuerToken();
    if (!token) return;
    getThemeSubscriptions(token).then(setSubs).catch(() => {});
  }, []);

  // ── Collection child counts ────────────────────────────────────────────────
  const collMovieCount = movies.filter((m) => m.type === "movie").length;
  const collShowCount = movies.filter((m) => m.type === "show").length;
  const collCountLabel = childrenLoading
    ? ""
    : collMovieCount > 0 && collShowCount > 0
    ? t("cardCollectionMixed", { movieCount: collMovieCount, showCount: collShowCount })
    : collMovieCount > 0
    ? t("cardCollectionMovies", { count: collMovieCount })
    : collShowCount > 0
    ? t("cardCollectionShows", { count: collShowCount })
    : "";

  // ── Derived ────────────────────────────────────────────────────────────────

  const isCollCreatorSubscribed = trackedItem?.creator_id ? creatorSubs.has(trackedItem.creator_id) : false;
  const isCollPosterResetting = resettingIds.has(item.id);
  const isCollBackdropResetting = resettingIds.has(item.id + ":bg");
  const isCollLogoResetting = resettingIds.has(item.id + ":logo");
  const isCollSquareResetting = resettingIds.has(item.id + ":square");

  const heroBackdropUrl = failedShowBg
    ? null
    : (appliedPreviews.get(item.id + ":bg") ?? artUrl(conn.nodeUrl, conn.adminToken, item.id));

  const collPosterSrc = appliedPreviews.get(item.id) ?? thumbUrl(conn.nodeUrl, conn.adminToken, item.id);
  const collBackdropSrc = appliedPreviews.get(item.id + ":bg") ?? artUrl(conn.nodeUrl, conn.adminToken, item.id);
  const collLogoSrc = appliedPreviews.get(item.id + ":logo") ?? logoUrl(conn.nodeUrl, conn.adminToken, item.id);
  const collSquareSrc = appliedPreviews.get(item.id + ":square") ?? squareUrl(conn.nodeUrl, conn.adminToken, item.id);

  const drawerAppliedPosterId = (() => {
    if (drawerKind === "collection") {
      if (drawerIsLogo) return trackedLogo?.poster_id ?? null;
      if (drawerIsSquare) return trackedSquare?.poster_id ?? null;
      return drawerIsBackdrop
        ? (trackedBackdrop?.poster_id ?? null)
        : (trackedItem?.poster_id ?? null);
    }
    if (!drawerMovieId) return null;
    if (drawerIsSquare) return trackedArtwork.get(drawerMovieId + ":square")?.poster_id ?? null;
    return drawerIsBackdrop
      ? (trackedArtwork.get(drawerMovieId + ":bg")?.poster_id ?? null)
      : (trackedArtwork.get(drawerMovieId)?.poster_id ?? null);
  })();

  const visibleDrawerPosters = useMemo(
    () => drawerPosters.filter((p) => p.poster_id !== drawerAppliedPosterId),
    [drawerPosters, drawerAppliedPosterId],
  );

  const drawerMovie = drawerMovieId ? movies.find((m) => m.id === drawerMovieId) ?? null : null;
  const drawerTitle = drawerKind === "collection" ? item.title : (drawerMovie?.title ?? item.title);
  const drawerSubtitle = drawerIsLogo ? t("logos").toUpperCase() : drawerIsSquare ? t("square").toUpperCase() : drawerIsBackdrop ? t("backdrops").toUpperCase() : t("posters").toUpperCase();
  const drawerChip = drawerIsBackdrop
    ? { label: "BACKDROP", color: "warning" as const }
    : drawerKind === "collection"
      ? { label: "COLLECTION", color: "error" as const }
      : { label: "MOVIE", color: "success" as const };
  const drawerHasTmdbId = drawerKind === "collection"
    ? (tmdbRes.status === "confirmed" || tmdbRes.status === "text-search" || item.tmdb_id != null)
    : !!(drawerMovie?.tmdb_id);
  const drawerOthersLabel = drawerIsLogo
    ? (drawerKind === "collection" ? t("othersLabelLogosCollection") : t("othersLabelLogos"))
    : drawerIsSquare
    ? (drawerKind === "collection" ? t("othersLabelSquareCollection") : t("othersLabelSquare"))
    : drawerIsBackdrop
    ? (drawerKind === "collection" ? t("othersLabelBackdropsCollection") : t("othersLabelBackdrops"))
    : (drawerKind === "collection" ? t("othersLabelPostersCollection") : t("othersLabelPosters"));

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

  // ── Handlers ───────────────────────────────────────────────────────────────

  /** Opens the artwork browse drawer for the given context (collection or movie, poster/backdrop/logo/square). Fetches matching posters from the search API immediately. */
  function openDrawer(kind: "collection" | "movie", movieId: string | null, isBackdrop: boolean, isLogo = false, isSquare = false) {
    setDrawerKind(kind);
    setDrawerMovieId(movieId);
    setDrawerIsBackdrop(isBackdrop);
    setDrawerIsLogo(isLogo);
    setDrawerIsSquare(isSquare);

    const baseType = isBackdrop ? "backdrop" : (kind === "collection" ? "collection" : "movie");
    const kindParam = isLogo ? "&kind=logo" : isSquare ? "&kind=square" : "";
    let searchUrl: string | null = null;

    if (kind === "collection") {
      if (tmdbRes.status === "confirmed") {
        searchUrl = `/api/search?tmdb_id=${tmdbRes.tmdbId}&type=${baseType}${kindParam}&limit=200`;
      } else if (item.tmdb_id != null) {
        searchUrl = `/api/search?tmdb_id=${item.tmdb_id}&type=${baseType}${kindParam}&limit=200`;
      } else if (tmdbRes.status === "text-search") {
        searchUrl = `/api/search?q=${encodeURIComponent(item.title)}&type=${baseType}${kindParam}&limit=200`;
      }
    } else {
      const movieTmdbId = movies.find((m) => m.id === movieId)?.tmdb_id ?? null;
      if (movieTmdbId) searchUrl = `/api/search?tmdb_id=${movieTmdbId}&type=${baseType}${kindParam}&limit=200`;
    }

    openArtworkDrawer(searchUrl);
  }

  /** Applies the chosen poster to Plex via the node, updates local tracked/applied state, and triggers the same-creator match check. */
  async function handleApply(poster: PosterEntry) {
    setApplyingId(poster.poster_id);
    const movie = drawerMovieId ? movies.find((m) => m.id === drawerMovieId) ?? null : null;
    const isCollection = drawerKind === "collection";
    const key = isCollection
      ? (drawerIsLogo ? item.id + ":logo" : drawerIsSquare ? item.id + ":square" : drawerIsBackdrop ? item.id + ":bg" : item.id)
      : (drawerIsSquare ? drawerMovieId! + ":square" : drawerIsBackdrop ? drawerMovieId! + ":bg" : drawerMovieId!);
    const plexRatingKey = isCollection ? item.id : drawerMovieId!;
    const tmdbId = isCollection
      ? ((tmdbRes.status === "confirmed" ? tmdbRes.tmdbId : item.tmdb_id) ?? poster.media.tmdb_id ?? null)
      : (movie?.tmdb_id ?? poster.media.tmdb_id ?? null);
    const mediaType = isCollection ? "collection" : "movie";
    try {
      await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
        imageUrl: poster.assets.full.url,
        tmdbId: tmdbId ?? undefined,
        plexRatingKey,
        mediaType,
        isBackdrop: drawerIsBackdrop,
        isLogo: drawerIsLogo,
        isSquare: drawerIsSquare,
        posterId: poster.poster_id,
        assetHash: poster.assets.full.hash,
        creatorId: poster.creator.creator_id,
        creatorDisplayName: poster.creator.display_name,
        themeId: poster.media.theme_id ?? undefined,
        nodeBase: poster.creator.home_node,
        autoUpdate: autoUpdateEnabled,
      });
      setAppliedIds((prev) => new Set([...prev, poster.poster_id]));
      setAppliedPreviews((prev) => new Map(prev).set(key, poster.assets.preview.url));
      setOpAppliedKeys((prev) => new Set([...prev, key]));
      const record: TrackedArtwork = {
        media_item_id: key,
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
      };
      if (isCollection && drawerIsLogo) setTrackedLogo(record);
      else if (isCollection && drawerIsSquare) setTrackedSquare(record);
      else if (isCollection && !drawerIsBackdrop) setTrackedItem(record);
      else if (isCollection && drawerIsBackdrop) setTrackedBackdrop(record);
      else onTrack(key, record);
      setSnack({ open: true, message: t("applySuccess"), severity: "success" });
      if (!drawerIsBackdrop && !drawerIsLogo) {
        const updatedTrackedItem = isCollection ? record : trackedItem;
        const updatedTrackedArtwork = !isCollection && drawerMovieId
          ? new Map(trackedArtwork).set(drawerMovieId, { creator_id: poster.creator.creator_id } as TrackedArtwork)
          : trackedArtwork;
        checkCreatorMatches(
          poster.creator.creator_id,
          poster.creator.display_name,
          key,
          updatedTrackedItem,
          updatedTrackedArtwork,
        ).catch(() => {});
      }
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("applyError"), severity: "error" });
    } finally {
      setApplyingId(null);
    }
  }

  /** Resets the collection poster: untracks OP artwork, then restores the TMDB collection poster via Plex. */
  async function handleResetCollectionPoster() {
    setResettingIds((prev) => new Set([...prev, item.id]));
    let newPreviewUrl: string | null = null;
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, item.id);
      setTrackedItem(null);
      setAppliedPreviews((prev) => { const m = new Map(prev); m.delete(item.id); return m; });
      setOpAppliedKeys((prev) => { const s = new Set(prev); s.delete(item.id); return s; });
      setAppliedIds(new Set());
      const tmdbId = tmdbRes.status === "confirmed" ? tmdbRes.tmdbId : item.tmdb_id;
      if (tmdbId) {
        const tmdbData = await fetch(`/api/tmdb/collection/${tmdbId}`)
          .then((r) => r.ok ? r.json() : null) as { poster_path?: string } | null;
        if (tmdbData?.poster_path) {
          await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
            imageUrl: `https://image.tmdb.org/t/p/original${tmdbData.poster_path}`,
            plexRatingKey: item.id,
            mediaType: "collection",
          });
          newPreviewUrl = `https://image.tmdb.org/t/p/w342${tmdbData.poster_path}`;
        }
      }
      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    } finally {
      setResettingIds((prev) => { const s = new Set(prev); s.delete(item.id); return s; });
      if (newPreviewUrl) {
        setAppliedPreviews((prev) => new Map(prev).set(item.id, newPreviewUrl!));
      } else {
        setAppliedPreviews((prev) => new Map(prev).set(item.id, `${thumbUrl(conn.nodeUrl, conn.adminToken, item.id)}&v=${Date.now()}`));
      }
    }
  }

  /** Resets the collection backdrop: untracks OP artwork, then restores the TMDB collection backdrop via Plex. */
  async function handleResetCollectionBackdrop() {
    const bgKey = item.id + ":bg";
    setResettingIds((prev) => new Set([...prev, bgKey]));
    let newPreviewUrl: string | null = null;
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, bgKey).catch(() => {});
      setTrackedBackdrop(null);
      setAppliedPreviews((prev) => { const m = new Map(prev); m.delete(bgKey); return m; });
      setOpAppliedKeys((prev) => { const s = new Set(prev); s.delete(bgKey); return s; });
      setAppliedIds(new Set());
      const tmdbId = tmdbRes.status === "confirmed" ? tmdbRes.tmdbId : item.tmdb_id;
      if (tmdbId) {
        const tmdbData = await fetch(`/api/tmdb/collection/${tmdbId}`)
          .then((r) => r.ok ? r.json() : null) as { backdrop_path?: string } | null;
        if (tmdbData?.backdrop_path) {
          await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
            imageUrl: `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}`,
            plexRatingKey: item.id,
            mediaType: "collection",
            isBackdrop: true,
          });
          newPreviewUrl = `https://image.tmdb.org/t/p/w780${tmdbData.backdrop_path}`;
        }
      }
      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    } finally {
      setResettingIds((prev) => { const s = new Set(prev); s.delete(bgKey); return s; });
      if (newPreviewUrl) {
        setAppliedPreviews((prev) => new Map(prev).set(bgKey, newPreviewUrl!));
      } else {
        setAppliedPreviews((prev) => new Map(prev).set(bgKey, `${artUrl(conn.nodeUrl, conn.adminToken, item.id)}&v=${Date.now()}`));
      }
    }
  }

  /** Resets the collection logo: untracks OP artwork and busts the node's logo proxy cache so Plex's original logo is shown again. */
  async function handleResetCollectionLogo() {
    const logoKey = item.id + ":logo";
    setResettingIds((prev) => new Set([...prev, logoKey]));
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, logoKey).catch(() => {});
      await fetch(
        `${conn.nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/logo/${encodeURIComponent(item.id)}/cache`,
        { method: "DELETE", headers: { Authorization: `Bearer ${conn.adminToken}` } },
      ).catch(() => {});
      setTrackedLogo(null);
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

  /** Resets the logo for a child movie: untracks OP artwork and busts the node's logo proxy cache. */
  async function handleResetMovieLogo(movie: MediaItem) {
    const logoKey = movie.id + ":logo";
    setResettingIds((prev) => new Set([...prev, logoKey]));
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, logoKey).catch(() => {});
      await fetch(
        `${conn.nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/logo/${encodeURIComponent(movie.id)}/cache`,
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
      setAppliedPreviews((prev) => new Map(prev).set(logoKey, `${logoUrl(conn.nodeUrl, conn.adminToken, movie.id)}&v=${Date.now()}`));
    }
  }

  /** Resets the collection square artwork: untracks OP artwork and busts the node's square proxy cache. */
  async function handleResetCollectionSquare() {
    const squareKey = item.id + ":square";
    setResettingIds((prev) => new Set([...prev, squareKey]));
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, squareKey).catch(() => {});
      await fetch(
        `${conn.nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/square/${encodeURIComponent(item.id)}/cache`,
        { method: "DELETE", headers: { Authorization: `Bearer ${conn.adminToken}` } },
      ).catch(() => {});
      setTrackedSquare(null);
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

  /** Resets the square artwork for a child movie: untracks OP artwork and busts the node's square proxy cache. */
  async function handleResetMovieSquare(movie: MediaItem) {
    const squareKey = movie.id + ":square";
    setResettingIds((prev) => new Set([...prev, squareKey]));
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, squareKey).catch(() => {});
      await fetch(
        `${conn.nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/square/${encodeURIComponent(movie.id)}/cache`,
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
      setAppliedPreviews((prev) => new Map(prev).set(squareKey, `${squareUrl(conn.nodeUrl, conn.adminToken, movie.id)}&v=${Date.now()}`));
    }
  }

  /** Resets the poster for a child movie: untracks OP artwork, then restores the TMDB movie poster via Plex. */
  async function handleResetMoviePoster(movie: MediaItem) {
    setResettingIds((prev) => new Set([...prev, movie.id]));
    let newPreviewUrl: string | null = null;
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, movie.id);
      onUntrack(movie.id);
      setAppliedPreviews((prev) => { const m = new Map(prev); m.delete(movie.id); return m; });
      setOpAppliedKeys((prev) => { const s = new Set(prev); s.delete(movie.id); return s; });
      setAppliedIds(new Set());
      if (movie.tmdb_id) {
        const tmdbData = await fetch(`/api/tmdb/movie/${movie.tmdb_id}`)
          .then((r) => r.ok ? r.json() : null) as { poster_path?: string } | null;
        if (tmdbData?.poster_path) {
          await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
            imageUrl: `https://image.tmdb.org/t/p/original${tmdbData.poster_path}`,
            plexRatingKey: movie.id,
            mediaType: "movie",
          });
          newPreviewUrl = `https://image.tmdb.org/t/p/w342${tmdbData.poster_path}`;
        }
      }
      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    } finally {
      setResettingIds((prev) => { const s = new Set(prev); s.delete(movie.id); return s; });
      if (newPreviewUrl) {
        setAppliedPreviews((prev) => new Map(prev).set(movie.id, newPreviewUrl!));
      } else {
        setAppliedPreviews((prev) => new Map(prev).set(movie.id, `${thumbUrl(conn.nodeUrl, conn.adminToken, movie.id)}&v=${Date.now()}`));
      }
    }
  }

  /** Resets the backdrop for a child movie: untracks OP artwork, then restores the TMDB movie backdrop via Plex. */
  async function handleResetMovieBackdrop(movie: MediaItem) {
    const bgKey = movie.id + ":bg";
    setResettingIds((prev) => new Set([...prev, bgKey]));
    let newPreviewUrl: string | null = null;
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, bgKey).catch(() => {});
      onUntrack(bgKey);
      setAppliedPreviews((prev) => { const m = new Map(prev); m.delete(bgKey); return m; });
      setOpAppliedKeys((prev) => { const s = new Set(prev); s.delete(bgKey); return s; });
      setAppliedIds(new Set());
      if (movie.tmdb_id) {
        const tmdbData = await fetch(`/api/tmdb/movie/${movie.tmdb_id}`)
          .then((r) => r.ok ? r.json() : null) as { backdrop_path?: string } | null;
        if (tmdbData?.backdrop_path) {
          await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
            imageUrl: `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}`,
            plexRatingKey: movie.id,
            mediaType: "movie",
            isBackdrop: true,
          });
          newPreviewUrl = `https://image.tmdb.org/t/p/w780${tmdbData.backdrop_path}`;
        }
      }
      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    } finally {
      setResettingIds((prev) => { const s = new Set(prev); s.delete(bgKey); return s; });
      if (newPreviewUrl) {
        setAppliedPreviews((prev) => new Map(prev).set(bgKey, newPreviewUrl!));
      } else {
        setAppliedPreviews((prev) => new Map(prev).set(bgKey, `${artUrl(conn.nodeUrl, conn.adminToken, movie.id)}&v=${Date.now()}`));
      }
    }
  }

  /**
   * After applying artwork, searches for other posters by the same creator across the collection
   * and all child movies. Populates the `suggestion` state if any matches are found, prompting
   * the user to apply them all at once.
   */
  async function checkCreatorMatches(
    appliedCreatorId: string,
    appliedCreatorName: string,
    justAppliedKey: string,
    latestTrackedItem: TrackedArtwork | null,
    latestTrackedArtwork: Map<string, TrackedArtwork>,
  ) {
    type MatchItem = { mediaItem: MediaItem; poster: PosterEntry; isCollection: boolean };
    const checks: Promise<MatchItem | null>[] = [];

    if (justAppliedKey !== item.id && latestTrackedItem?.creator_id !== appliedCreatorId) {
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

    for (const movie of movies) {
      if (movie.id === justAppliedKey) continue;
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

  /** Applies all items in the current creator suggestion to Plex in sequence, then dismisses the suggestion. */
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
        setOpAppliedKeys((prev) => new Set([...prev, mediaItem.id]));
        const record: TrackedArtwork = {
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
        if (isCollection) setTrackedItem(record);
        else onTrack(mediaItem.id, record);
      } catch { /* best-effort per item */ }
    }
    setSuggestion(null);
    setApplyingAll(false);
    setSnack({ open: true, message: t("suggestionApplied"), severity: "success" });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Hero backdrop */}
      {heroBackdropUrl && (
        <Box sx={{ position: "fixed", top: 64, left: 0, right: 0, height: "75vh", zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
          <Box
            component="img"
            src={heroBackdropUrl}
            alt=""
            sx={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", opacity: 0.2, filter: "grayscale(0.75)" }}
            onError={() => setFailedShowBg(true)}
          />
          <Box sx={{ position: "absolute", inset: 0, background: (theme) => `linear-gradient(to bottom, transparent 40%, ${theme.palette.background.default} 95%)` }} />
        </Box>
      )}

      {/* Page content above hero */}
      <Box sx={{ position: "relative", zIndex: 1 }}>

        {/* ── Posters section ── */}
        <Typography variant="h6" sx={{ mb: 2 }}>{t("posters")}</Typography>

        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP, mb: 5 }}>

          {/* Collection poster card */}
          <Box>
          <MediaCard
            image={failedThumb ? (tmdbImages?.posterPath ? `https://image.tmdb.org/t/p/w342${tmdbImages.posterPath}` : null) : collPosterSrc}
            alt={item.title}
            title={item.title}
            subtitle={collCountLabel || undefined}
            aspectRatio="2 / 3"
            resetting={isCollPosterResetting}
            placeholder={failedThumb && !!tmdbImages?.posterPath}
            imageFailed={failedThumb && !tmdbImages?.posterPath}
            onImageError={() => setFailedThumb(true)}
            creatorName={trackedItem?.creator_display_name}
            badge={<ArtworkSourceBadge source={trackedItem ? "openposter" : failedThumb ? null : "plex"} creatorName={trackedItem?.creator_display_name} mediaServer={serverName} />}
            menuSlot={
              <CardMenuButton
                items={[
                  subscribeMenuItem(trackedItem, isCollCreatorSubscribed),
                  { label: t("tooltipResetToDefault"), kind: "reset", disabled: !trackedItem, onClick: handleResetCollectionPoster },
                  { label: t("tooltipUploadOwnPoster"), kind: "upload", onClick: () => {} },
                  {
                    label: tmdbRes.status === "resolving" || tmdbRes.status === "pending-confirm"
                      ? t("tooltipResolvingTmdb")
                      : (tmdbRes.status === "text-search" || tmdbRes.status === "idle")
                      ? t("tooltipNoTmdbMatch")
                      : t("menuChoosePosterFromOpenPoster"),
                    kind: tmdbRes.status === "confirmed" ? "select" : undefined,
                    disabled: tmdbRes.status === "resolving" || tmdbRes.status === "pending-confirm" || tmdbRes.status === "text-search" || tmdbRes.status === "idle",
                    onClick: () => openDrawer("collection", null, false),
                  },
                ]}
                ariaLabel={`${item.title} poster options`}
              />
            }
          />
          </Box>

          {/* Movie poster cards */}
          {childrenLoading
            ? Array.from({ length: item.child_count ?? 3 }).map((_, i) => (
                <Skeleton key={i} variant="rectangular" sx={{ aspectRatio: "2/3", width: "var(--op-backdrop-width, 340px)", height: "auto", borderRadius: 1 }} />
              ))
            : movies.map((movie) => {
                const failed = failedThumbs.has(movie.id);
                const tracked = trackedArtwork.get(movie.id);
                const isCreatorSubscribed = tracked?.creator_id ? creatorSubs.has(tracked.creator_id) : false;
                const isResetting = resettingIds.has(movie.id);
                return (
                  <Box key={movie.id}>
                  <MediaCard
                    image={failed ? null : (appliedPreviews.get(movie.id) ?? thumbUrl(conn.nodeUrl, conn.adminToken, movie.id))}
                    alt={movie.title}
                    title={movie.title}
                    subtitle={movie.year ? String(movie.year) : undefined}
                    aspectRatio="2 / 3"
                    resetting={isResetting}
                    imageFailed={failed}
                    onImageError={() => onMarkFailed(movie.id)}
                    creatorName={tracked?.creator_display_name}
                    badge={<ArtworkSourceBadge source={tracked ? "openposter" : failed ? null : "plex"} creatorName={tracked?.creator_display_name} mediaServer={serverName} />}
                    menuSlot={
                      <CardMenuButton
                        items={[
                          ...(failed ? [{ label: t("tooltipRetryDownload"), kind: "retry" as const, onClick: () => onMarkRetry(movie.id) }] : [subscribeMenuItem(tracked ?? null, isCreatorSubscribed)]),
                          { label: t("tooltipResetToDefault"), kind: "reset", disabled: failed || !tracked, onClick: () => handleResetMoviePoster(movie) },
                          { label: t("tooltipUploadOwnPoster"), kind: "upload", onClick: () => {} },
                          { label: movie.tmdb_id ? t("menuChoosePosterFromOpenPoster") : t("tooltipNoTmdbIdArtwork"), kind: movie.tmdb_id ? "select" : undefined, disabled: !movie.tmdb_id, onClick: () => openDrawer("movie", movie.id, false) },
                        ]}
                        ariaLabel={`${movie.title} poster options`}
                      />
                    }
                  />
                  </Box>
                );
              })}
        </Box>

        {/* ── Backdrops section ── */}
        <Typography variant="h6" sx={{ mb: 2 }}>{t("backdrops")}</Typography>

        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP, mb: 4 }}>

          {/* Collection backdrop card */}
          <Box>
            <MediaCard
              image={failedShowBg ? (tmdbImages?.backdropPath ? `https://image.tmdb.org/t/p/w780${tmdbImages.backdropPath}` : null) : collBackdropSrc}
              alt={`${item.title} backdrop`}
              title={item.title}
              subtitle={collCountLabel || undefined}
              aspectRatio="16 / 9"
              resetting={isCollBackdropResetting}
              placeholder={failedShowBg && !!tmdbImages?.backdropPath}
              imageFailed={failedShowBg && !tmdbImages?.backdropPath}
              onImageError={() => setFailedShowBg(true)}
              creatorName={trackedBackdrop?.creator_display_name}
              badge={<ArtworkSourceBadge source={(trackedBackdrop || opAppliedKeys.has(item.id + ":bg")) ? "openposter" : failedShowBg ? null : "plex"} creatorName={trackedBackdrop?.creator_display_name} mediaServer={serverName} />}
              menuSlot={
                <CardMenuButton
                items={[
                    subscribeMenuItem(trackedBackdrop, !!(trackedBackdrop?.creator_id && creatorSubs.has(trackedBackdrop.creator_id))),
                    { label: t("tooltipResetToDefaultBackdrop"), kind: "reset", disabled: !trackedBackdrop, onClick: handleResetCollectionBackdrop },
                    { label: t("tooltipUploadOwnBackdrop"), kind: "upload", onClick: () => {} },
                    {
                      label: tmdbRes.status === "resolving" || tmdbRes.status === "pending-confirm"
                        ? t("tooltipResolvingTmdb")
                        : (tmdbRes.status === "text-search" || tmdbRes.status === "idle")
                        ? t("tooltipNoTmdbMatch")
                        : t("menuChooseBackdropFromOpenPoster"),
                      kind: tmdbRes.status === "confirmed" ? "select" : undefined,
                      disabled: tmdbRes.status === "resolving" || tmdbRes.status === "pending-confirm" || tmdbRes.status === "text-search" || tmdbRes.status === "idle",
                      onClick: () => openDrawer("collection", null, true),
                    },
                  ]}
                  ariaLabel={`${item.title} backdrop options`}
                />
              }
            />
          </Box>

          {/* Movie backdrop cards */}
          {childrenLoading
            ? Array.from({ length: item.child_count ?? 3 }).map((_, i) => (
                <Skeleton key={i} variant="rectangular" sx={{ aspectRatio: "16/9", width: "100%", height: "auto", borderRadius: 1 }} />
              ))
            : movies.map((movie) => {
                const bgKey = movie.id + ":bg";
                const backdropSrc = appliedPreviews.get(bgKey) ?? artUrl(conn.nodeUrl, conn.adminToken, movie.id);
                const trackedBg = trackedArtwork.get(bgKey);
                const isBgResetting = resettingIds.has(bgKey);
                return (
                  <Box key={bgKey}>
                    <MediaCard
                      image={backdropSrc}
                      alt={`${movie.title} backdrop`}
                      title={movie.title}
                      subtitle={movie.year ? String(movie.year) : undefined}
                      aspectRatio="16 / 9"
                      resetting={isBgResetting}
                      onImageError={() => setFailedMovieBgs((prev) => new Set(prev).add(movie.id))}
                      creatorName={trackedBg?.creator_display_name}
                      badge={<ArtworkSourceBadge source={(trackedBg || opAppliedKeys.has(bgKey)) ? "openposter" : failedMovieBgs.has(movie.id) ? null : "plex"} creatorName={trackedBg?.creator_display_name} mediaServer={serverName} />}
                      menuSlot={
                        <CardMenuButton
                        items={[
                            subscribeMenuItem(trackedBg ?? null, !!(trackedBg?.creator_id && creatorSubs.has(trackedBg.creator_id))),
                            { label: t("tooltipResetToDefaultBackdrop"), kind: "reset", disabled: !trackedBg, onClick: () => handleResetMovieBackdrop(movie) },
                            { label: t("tooltipUploadOwnBackdrop"), kind: "upload", onClick: () => {} },
                            { label: movie.tmdb_id ? t("menuChooseBackdropFromOpenPoster") : t("tooltipNoTmdbIdArtwork"), kind: movie.tmdb_id ? "select" : undefined, disabled: !movie.tmdb_id, onClick: () => openDrawer("movie", movie.id, true) },
                          ]}
                          ariaLabel={`${movie.title} backdrop options`}
                        />
                      }
                    />
                  </Box>
                );
              })}
        </Box>

        {/* ── Square section ── */}
        <Typography variant="h6" sx={{ mt: 2, mb: 2 }}>{t("squareArtwork")}</Typography>

        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP, mb: 4 }}>

          {/* Collection square card */}
          <Box>
            <MediaCard
              image={failedSquare ? null : collSquareSrc}
              alt={`${item.title} square`}
              title={item.title}
              subtitle={collCountLabel || undefined}
              aspectRatio="1 / 1"
              resetting={isCollSquareResetting}
              imageFailed={failedSquare}
              onImageError={() => setFailedSquare(true)}
              imageBackground="repeating-conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%) 0 0 / 20px 20px"
              creatorName={trackedSquare?.creator_display_name}
              badge={<ArtworkSourceBadge source={(trackedSquare || opAppliedKeys.has(item.id + ":square")) ? "openposter" : failedSquare ? null : "plex"} creatorName={trackedSquare?.creator_display_name} mediaServer={serverName} />}
              menuSlot={
                <CardMenuButton
                items={[
                    subscribeMenuItem(trackedSquare, !!(trackedSquare?.creator_id && creatorSubs.has(trackedSquare.creator_id))),
                    { label: t("tooltipResetSquare"), kind: "reset", disabled: !trackedSquare, onClick: handleResetCollectionSquare },
                    { label: t("tooltipUploadOwnSquare"), kind: "upload", onClick: () => {} },
                    {
                      label: tmdbRes.status === "resolving" || tmdbRes.status === "pending-confirm"
                        ? t("tooltipResolvingTmdb")
                        : (tmdbRes.status === "text-search" || tmdbRes.status === "idle")
                        ? t("tooltipNoTmdbMatch")
                        : t("menuChooseSquareFromOpenPoster"),
                      kind: tmdbRes.status === "confirmed" ? "select" : undefined,
                      disabled: tmdbRes.status === "resolving" || tmdbRes.status === "pending-confirm" || tmdbRes.status === "text-search" || tmdbRes.status === "idle",
                      onClick: () => openDrawer("collection", null, false, false, true),
                    },
                  ]}
                  ariaLabel={`${item.title} square options`}
                />
              }
            />
          </Box>

          {/* Movie square cards */}
          {childrenLoading
            ? Array.from({ length: item.child_count ?? 3 }).map((_, i) => (
                <Skeleton key={i} variant="rectangular" sx={{ aspectRatio: "1/1", width: "100%", height: "auto", borderRadius: 1 }} />
              ))
            : movies.map((movie) => {
                const squareKey = movie.id + ":square";
                const movieSquareSrc = appliedPreviews.get(squareKey) ?? squareUrl(conn.nodeUrl, conn.adminToken, movie.id);
                const trackedMovieSquare = trackedArtwork.get(squareKey);
                const isMovieSquareResetting = resettingIds.has(squareKey);
                return (
                  <Box key={squareKey}>
                    <MediaCard
                      image={failedMovieSquares.has(movie.id) ? null : movieSquareSrc}
                      alt={`${movie.title} square`}
                      title={movie.title}
                      subtitle={movie.year ? String(movie.year) : undefined}
                      aspectRatio="1 / 1"
                      resetting={isMovieSquareResetting}
                      imageFailed={failedMovieSquares.has(movie.id)}
                      onImageError={() => setFailedMovieSquares((prev) => new Set(prev).add(movie.id))}
                      imageBackground="repeating-conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%) 0 0 / 20px 20px"
                      creatorName={trackedMovieSquare?.creator_display_name}
                      badge={<ArtworkSourceBadge source={(trackedMovieSquare || opAppliedKeys.has(squareKey)) ? "openposter" : failedMovieSquares.has(movie.id) ? null : "plex"} creatorName={trackedMovieSquare?.creator_display_name} mediaServer={serverName} />}
                      menuSlot={
                        <CardMenuButton
                        items={[
                            subscribeMenuItem(trackedMovieSquare ?? null, !!(trackedMovieSquare?.creator_id && creatorSubs.has(trackedMovieSquare.creator_id))),
                            { label: t("tooltipResetSquare"), kind: "reset", disabled: !trackedMovieSquare, onClick: () => handleResetMovieSquare(movie) },
                            { label: t("tooltipUploadOwnSquare"), kind: "upload", onClick: () => {} },
                            { label: movie.tmdb_id ? t("menuChooseSquareFromOpenPoster") : t("tooltipNoTmdbIdArtwork"), kind: movie.tmdb_id ? "select" : undefined, disabled: !movie.tmdb_id, onClick: () => openDrawer("movie", movie.id, false, false, true) },
                          ]}
                          ariaLabel={`${movie.title} square options`}
                        />
                      }
                    />
                  </Box>
                );
              })}
        </Box>

        {/* ── Logo section ── */}
        <Typography variant="h6" sx={{ mt: 2, mb: 2 }}>{t("logos")}</Typography>

        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP, mb: 4 }}>

          {/* Collection logo card */}
          <Box>
            <MediaCard
              image={failedLogo ? null : collLogoSrc}
              alt={`${item.title} logo`}
              title={item.title}
              subtitle={collCountLabel || undefined}
              aspectRatio="16 / 9"
              resetting={isCollLogoResetting}
              imageFailed={failedLogo}
              onImageError={() => setFailedLogo(true)}
              imageBackground="repeating-conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%) 0 0 / 20px 20px"
              creatorName={trackedLogo?.creator_display_name}
              badge={<ArtworkSourceBadge source={(trackedLogo || opAppliedKeys.has(item.id + ":logo")) ? "openposter" : failedLogo ? null : "plex"} creatorName={trackedLogo?.creator_display_name} mediaServer={serverName} />}
              menuSlot={
                <CardMenuButton
                items={[
                    subscribeMenuItem(trackedLogo, !!(trackedLogo?.creator_id && creatorSubs.has(trackedLogo.creator_id))),
                    { label: t("tooltipResetLogo"), kind: "reset", disabled: !trackedLogo, onClick: handleResetCollectionLogo },
                    { label: t("tooltipUploadOwnLogo"), kind: "upload", onClick: () => {} },
                    {
                      label: tmdbRes.status === "resolving" || tmdbRes.status === "pending-confirm"
                        ? t("tooltipResolvingTmdb")
                        : (tmdbRes.status === "text-search" || tmdbRes.status === "idle")
                        ? t("tooltipNoTmdbMatch")
                        : t("menuChooseLogoFromOpenPoster"),
                      kind: tmdbRes.status === "confirmed" ? "select" : undefined,
                      disabled: tmdbRes.status === "resolving" || tmdbRes.status === "pending-confirm" || tmdbRes.status === "text-search" || tmdbRes.status === "idle",
                      onClick: () => openDrawer("collection", null, false, true),
                    },
                  ]}
                  ariaLabel={`${item.title} logo options`}
                />
              }
            />
          </Box>

          {/* Movie logo cards */}
          {childrenLoading
            ? Array.from({ length: item.child_count ?? 3 }).map((_, i) => (
                <Skeleton key={i} variant="rectangular" sx={{ aspectRatio: "16/9", width: "100%", height: "auto", borderRadius: 1 }} />
              ))
            : movies.map((movie) => {
                const logoKey = movie.id + ":logo";
                const movieLogoSrc = appliedPreviews.get(logoKey) ?? logoUrl(conn.nodeUrl, conn.adminToken, movie.id);
                const trackedMovieLogo = trackedArtwork.get(logoKey);
                const isMovieLogoResetting = resettingIds.has(logoKey);
                return (
                  <Box key={logoKey}>
                    <MediaCard
                      image={failedMovieLogos.has(movie.id) ? null : movieLogoSrc}
                      alt={`${movie.title} logo`}
                      title={movie.title}
                      subtitle={movie.year ? String(movie.year) : undefined}
                      aspectRatio="16 / 9"
                      resetting={isMovieLogoResetting}
                      imageFailed={failedMovieLogos.has(movie.id)}
                      onImageError={() => setFailedMovieLogos((prev) => new Set(prev).add(movie.id))}
                      imageBackground="repeating-conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%) 0 0 / 20px 20px"
                      creatorName={trackedMovieLogo?.creator_display_name}
                      badge={<ArtworkSourceBadge source={(trackedMovieLogo || opAppliedKeys.has(logoKey)) ? "openposter" : failedMovieLogos.has(movie.id) ? null : "plex"} creatorName={trackedMovieLogo?.creator_display_name} mediaServer={serverName} />}
                      menuSlot={
                        <CardMenuButton
                        items={[
                            subscribeMenuItem(trackedMovieLogo ?? null, !!(trackedMovieLogo?.creator_id && creatorSubs.has(trackedMovieLogo.creator_id))),
                            { label: t("tooltipResetLogo"), kind: "reset", disabled: !trackedMovieLogo, onClick: () => handleResetMovieLogo(movie) },
                            { label: t("tooltipUploadOwnLogo"), kind: "upload", onClick: () => {} },
                            { label: movie.tmdb_id ? t("menuChooseLogoFromOpenPoster") : t("tooltipNoTmdbIdArtwork"), kind: movie.tmdb_id ? "select" : undefined, disabled: !movie.tmdb_id, onClick: () => openDrawer("movie", movie.id, false, true) },
                          ]}
                          ariaLabel={`${movie.title} logo options`}
                        />
                      }
                    />
                  </Box>
                );
              })}
        </Box>

      </Box>

      {/* ── Drawer ── */}
      <AltArtworkDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={drawerTitle}
        subtitle={drawerSubtitle}
        posters={visibleDrawerPosters}
        loading={drawerLoading}
        hasTmdbId={drawerHasTmdbId}
        isBackdrop={drawerIsBackdrop}
        aspectRatio={drawerIsLogo ? "16 / 9" : drawerIsSquare ? "1 / 1" : undefined}
        gridCols={drawerIsBackdrop || drawerIsLogo ? BACKDROP_GRID_COLS : POSTER_GRID_COLS}
        chip={drawerChip}
        subs={subs}
        appliedIds={appliedIds}
        applyingId={applyingId}
        othersLabel={drawerOthersLabel}
        onApply={handleApply}
      />

      {/* ── TMDB confirm dialog ── */}
      <Dialog
        open={tmdbRes.status === "pending-confirm" && tmdbRes.itemId === item.id}
        onClose={() => setTmdbRes({ status: "text-search" })}
        maxWidth="sm"
        fullWidth
        disableRestoreFocus
      >
        <DialogTitle>{t("tmdbConfirmDialogTitle")}</DialogTitle>
        <DialogContent>
          {tmdbRes.status === "pending-confirm" && (
            <TmdbConfirmCard
              tmdbId={tmdbRes.tmdbId}
              tmdbName={tmdbRes.tmdbName}
              posterPath={tmdbRes.posterPath}
              movieThumbs={tmdbRes.movieThumbs}
              collectionTitle={item.title}
              initialMode={tmdbRes.openInSearch ? "search" : "confirm"}
              onConfirm={(confirmedId, confirmedName) => {
                tmdbResolvedForRef.current = item.id;
                saveTmdbMapEntry(item.id, { tmdbId: confirmedId, tmdbName: confirmedName, source: "confirmed" });
                setTmdbRes({ status: "confirmed", tmdbId: confirmedId, tmdbName: confirmedName, source: "confirmed" });
              }}
              onNeverAgain={() => {
                saveTmdbMapEntry(item.id, { rejected: true });
                setTmdbRes({ status: "text-search" });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Snackbar ── */}
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

      {/* ── Creator suggestion dialog ── */}
      <Dialog open={!!suggestion} onClose={() => setSuggestion(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("suggestionTitle")}</DialogTitle>
        <DialogContent>
          <Typography>
            {t("suggestionCollectionBody", { isAre: suggestion?.items.length === 1 ? "is" : "are", count: suggestion?.items.length ?? 0, creatorName: suggestion?.creatorName ?? "" })}
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
