"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import Accordion from "@mui/material/Accordion";
import PageHeader from "@/components/PageHeader";
import type { PageCrumb } from "@/components/PageHeader";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Snackbar from "@mui/material/Snackbar";
import CircularProgress from "@mui/material/CircularProgress";


import { POSTER_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";
import LinearProgress from "@mui/material/LinearProgress";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { alpha } from "@mui/material/styles";

import HomeIcon from "@mui/icons-material/Home";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import TvOutlinedIcon from "@mui/icons-material/TvOutlined";

import PlexMark from "@/components/PlexMark";
import ArtworkMetadataTooltip from "@/components/ArtworkMetadataTooltip";
import type { ArtworkMeta } from "@/components/ArtworkMetadataTooltip";
import PosterCard from "@/components/PosterCard";
import CollectionMediaDetail from "./CollectionMediaDetail";
import MovieMediaDetail from "./MovieMediaDetail";
import TvShowMediaDetail from "./TvShowMediaDetail";
import EpisodeMediaDetail from "./EpisodeMediaDetail";
import { CollectionCard, TVShowCard } from "@/components/SectionedPosterView";
import type { CollectionGroup, TVShowGroup } from "@/components/SectionedPosterView";
import type { PosterEntry } from "@/lib/types";
import { loadCreatorConnection } from "@/lib/storage";
import { fetchMediaLibrary, fetchMediaChildren, thumbUrl } from "@/lib/media-server";
import type { MediaItem, MediaLibrary } from "@/lib/media-server";
import { listMediaServers } from "@/lib/media-servers";
import type { MediaServerConfig } from "@/lib/media-servers";
import { applyToPlexPoster } from "@/lib/plex";
import { fetchPosterFromNode, getTrackedArtwork, runArtworkUpdateCheck, untrackArtwork } from "@/lib/artwork-tracking";
import type { TrackedArtwork, UpdateProgress } from "@/lib/artwork-tracking";
import { getSubscriptions } from "@/lib/subscriptions";
import type { ThemeSubscription } from "@/lib/subscriptions";

// ---------------------------------------------------------------------------
// A–Z helpers
// ---------------------------------------------------------------------------

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const RAIL_LETTERS = ["#", ...ALPHABET];
// Must match scrollMarginTop on az-* anchor elements in LetterGroup
const AZ_SCROLL_MARGIN = 80;

function sortKey(title: string): string {
  return title.replace(/^(the|a|an)\s+/i, "").trim().toLowerCase();
}

function firstLetter(title: string): string {
  const ch = sortKey(title)[0]?.toUpperCase() ?? "#";
  return /[A-Z]/.test(ch) ? ch : "#";
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

function sortedByTitle<T extends { title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => sortKey(a.title).localeCompare(sortKey(b.title)));
}

function groupByLetter<T extends { title: string }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const letter = firstLetter(item.title);
    if (!map.has(letter)) map.set(letter, []);
    map.get(letter)!.push(item);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function AZRail({
  available,
  scrollContainerRef,
}: {
  available: Set<string>;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
}) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateCurrent = () => {
      const containerTop = container.getBoundingClientRect().top;
      let found: string | null = null;
      for (const letter of RAIL_LETTERS) {
        if (!available.has(letter)) continue;
        const el = document.getElementById(`az-${letter}`);
        if (!el) continue;
        // Active = last anchor whose content (anchor + scrollMarginTop offset) has reached the top
        if (el.getBoundingClientRect().top <= containerTop + AZ_SCROLL_MARGIN + 8) {
          found = letter;
        }
      }
      setCurrent(found);
    };

    // Throttle via rAF — one update per animation frame, prevents flicker
    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => { rafId = null; updateCurrent(); });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    updateCurrent();
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [available, scrollContainerRef]);

  // Rule 6 Option A: just scroll — let scroll position drive the highlight, no optimistic state
  function jump(letter: string) {
    document.getElementById(`az-${letter}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <Box
      sx={{
        position: "fixed",
        right: 6,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 100,
        display: { xs: "none", md: "flex" },
        flexDirection: "column",
        alignItems: "center",
        userSelect: "none",
      }}
    >
      {RAIL_LETTERS.map((letter) => {
        const active = available.has(letter);
        const isCurrent = letter === current;
        return (
          <Box
            key={letter}
            onClick={() => active && jump(letter)}
            sx={{
              width: 18,
              height: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              fontSize: "0.6rem",
              fontWeight: isCurrent ? 900 : 700,
              bgcolor: isCurrent ? "warning.main" : "transparent",
              color: isCurrent ? "warning.contrastText" : active ? "text.secondary" : "text.disabled",
              cursor: active ? "pointer" : "default",
              "&:hover": active && !isCurrent ? {
                bgcolor: "warning.main",
                color: "warning.contrastText",
                opacity: 0.6,
              } : {},
            }}
          >
            {letter}
          </Box>
        );
      })}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// MediaItem → standard card type adapters
// ---------------------------------------------------------------------------

function makePoster(item: MediaItem, src: string, creatorName = ""): PosterEntry {
  return {
    poster_id: item.id,
    media: {
      type: item.type,
      tmdb_id: item.tmdb_id ?? undefined,
      title: item.title,
      year: item.year ?? undefined,
      season_number: item.type === "season" ? (item.index ?? undefined) : undefined,
      episode_number: item.type === "episode" ? (item.index ?? undefined) : undefined,
    },
    creator: { creator_id: "", display_name: creatorName, home_node: "" },
    assets: {
      preview: { url: src, hash: "", mime: "image/jpeg" },
      full: { url: src, hash: "", mime: "image/jpeg", access: "public" },
    },
  };
}

function makeCollectionGroup(item: MediaItem, src: string, failed = false, creatorName = "", movieCount?: number): CollectionGroup {
  const mc = movieCount ?? item.leaf_count ?? 0;
  const tvShowCount = Math.max(0, (item.leaf_count ?? 0) - mc);
  return {
    key: item.id,
    title: item.title,
    year: item.year ?? undefined,
    collectionTmdbId: item.tmdb_id ?? 0,
    creatorId: "",
    creatorName,
    coverUrls: failed ? [] : [src],
    collectionCount: 1,
    movieCount: mc,
    tvShowCount: tvShowCount > 0 ? tvShowCount : undefined,
  };
}

function makeTVShowGroup(item: MediaItem, src: string, failed = false, creatorName = ""): TVShowGroup {
  return {
    key: item.id,
    title: item.title,
    year: item.year ?? undefined,
    showTmdbId: item.tmdb_id ?? 0,
    creatorId: "",
    creatorName,
    hasBoxSet: true,
    coverPreviews: failed ? [] : [src],
    seasonCount: item.child_count ?? 0,
    episodeCount: item.leaf_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Navigation state
// ---------------------------------------------------------------------------

type Nav =
  | { view: "collections" | "movies" | "shows" }
  | { view: "collection" | "show"; id: string; title: string }
  | { view: "season"; showId: string; showTitle: string; showTmdbId: number | null; seasonId: string; seasonIndex: number | null; title: string }
  | { view: "movie"; item: MediaItem; fromCollectionId?: string; fromCollectionTitle?: string };

// ---------------------------------------------------------------------------
// URL ↔ Nav serialisation (module-level, no hooks)
// ---------------------------------------------------------------------------

type RawSearchParams = ReturnType<typeof useSearchParams>;

function navFromParams(p: RawSearchParams): Nav {
  const view = p.get("view") ?? "movies";
  switch (view) {
    case "collections":        return { view: "collections" };
    case "shows":              return { view: "shows" };
    case "collection":         return { view: "collection", id: p.get("id") ?? "", title: p.get("title") ?? "" };
    case "show":               return { view: "show", id: p.get("id") ?? "", title: p.get("title") ?? "" };
    case "season": {
      const showTmdbStr = p.get("showTmdbId");
      const seasonIdxStr = p.get("seasonIndex");
      return {
        view: "season",
        showId: p.get("showId") ?? "",
        showTitle: p.get("showTitle") ?? "",
        showTmdbId: showTmdbStr ? parseInt(showTmdbStr, 10) : null,
        seasonId: p.get("seasonId") ?? "",
        seasonIndex: seasonIdxStr ? parseInt(seasonIdxStr, 10) : null,
        title: p.get("title") ?? "",
      };
    }
    case "movie": {
      const yearStr = p.get("year");
      const tmdbStr = p.get("tmdbId");
      const idsStr = p.get("collectionIds");
      return {
        view: "movie",
        item: {
          id: p.get("id") ?? "",
          title: p.get("title") ?? "",
          year: yearStr ? parseInt(yearStr, 10) : null,
          tmdb_id: tmdbStr ? parseInt(tmdbStr, 10) : null,
          type: "movie",
          index: null,
          leaf_count: null,
          child_count: null,
          collection_ids: idsStr ? JSON.parse(idsStr) as string[] : undefined,
        },
        fromCollectionId: p.get("fromCollectionId") ?? undefined,
        fromCollectionTitle: p.get("fromCollectionTitle") ?? undefined,
      };
    }
    default: return { view: "movies" };
  }
}

function navToSearch(nav: Nav): string {
  const p = new URLSearchParams();
  switch (nav.view) {
    case "movies": break; // clean default URL
    case "collections":
    case "shows":
      p.set("view", nav.view);
      break;
    case "collection":
    case "show":
      p.set("view", nav.view);
      p.set("id", nav.id);
      p.set("title", nav.title);
      break;
    case "season":
      p.set("view", "season");
      p.set("showId", nav.showId);
      p.set("showTitle", nav.showTitle);
      if (nav.showTmdbId != null) p.set("showTmdbId", String(nav.showTmdbId));
      p.set("seasonId", nav.seasonId);
      if (nav.seasonIndex != null) p.set("seasonIndex", String(nav.seasonIndex));
      p.set("title", nav.title);
      break;
    case "movie":
      p.set("view", "movie");
      p.set("id", nav.item.id);
      p.set("title", nav.item.title);
      if (nav.item.year != null) p.set("year", String(nav.item.year));
      if (nav.item.tmdb_id != null) p.set("tmdbId", String(nav.item.tmdb_id));
      if (nav.item.collection_ids?.length) p.set("collectionIds", JSON.stringify(nav.item.collection_ids));
      if (nav.fromCollectionId) p.set("fromCollectionId", nav.fromCollectionId);
      if (nav.fromCollectionTitle) p.set("fromCollectionTitle", nav.fromCollectionTitle);
      break;
  }
  const str = p.toString();
  return str ? `?${str}` : "";
}

// ---------------------------------------------------------------------------
// Shared sub-components (defined OUTSIDE parent to prevent remount on re-render)
// ---------------------------------------------------------------------------

function LetterGroup<T extends MediaItem>({
  items,
  noItemsText,
  renderItem,
}: {
  items: T[];
  noItemsText: string;
  renderItem: (item: T) => React.ReactNode;
}) {
  if (items.length === 0) return <Typography color="text.secondary">{noItemsText}</Typography>;
  return (
    <Stack spacing={1}>
      {groupByLetter(items).map(([letter, group], idx) => (
        <Box key={letter} sx={{ pt: idx === 0 ? 0 : "20px" }}>
          <Box id={`az-${letter}`} sx={{ scrollMarginTop: AZ_SCROLL_MARGIN }} />
          <Typography variant="overline" color="text.primary" sx={{ fontSize: "1.1rem", fontWeight: 700, lineHeight: 1, display: "block", mb: 2 }}>{letter}</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
            {group.map((item) => (
              <Box key={item.id}>
                {renderItem(item)}
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}


/** "⋮" menu rendered in a card's title strip when its thumbnail has failed. */
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
        <MenuItem
          onClick={() => { setAnchorEl(null); onRetry(); }}
          dense
        >
          Retry download
        </MenuItem>
      </Menu>
    </>
  );
}

/** "⋮" menu on OP-managed cards — offers "Reset artwork". */
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

// ---------------------------------------------------------------------------
// No-servers welcome page
// ---------------------------------------------------------------------------

function NoMediaServersPage() {
  const t = useTranslations("myMedia");
  return (
    <Container maxWidth="sm">
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", py: 12, gap: 3 }}>
        <StorageOutlinedIcon sx={{ fontSize: "5rem", color: "text.disabled" }} />
        <Box>
          <Typography variant="h4" fontWeight={900} gutterBottom>{t("noServersTitle")}</Typography>
          <Typography variant="h6" color="text.secondary" fontWeight={400} sx={{ maxWidth: 480, mx: "auto", mb: 4 }}>
            {t("noServersDescription")}
          </Typography>
          <Button variant="contained" size="large" component={Link} href="/settings">
            {t("goToSettings")}
          </Button>
        </Box>
      </Box>
    </Container>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MyMediaContent() {
  const t = useTranslations("myMedia");

  const router = useRouter();
  const searchParams = useSearchParams();

  const nav = useMemo(() => navFromParams(searchParams), [searchParams]);
  function navigate(next: Nav) {
    router.push(`/my-media${navToSearch(next)}`);
  }

  const scrollContainerRef = useRef<HTMLElement>(null);

  const [library, setLibrary] = useState<MediaLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conn, setConn] = useState<{ nodeUrl: string; adminToken: string } | null>(null);
  const [servers, setServers] = useState<MediaServerConfig[]>([]);

  const [children, setChildren] = useState<MediaItem[]>([]);
  const [childrenForId, setChildrenForId] = useState<string | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [failedThumbs, setFailedThumbs] = useState<Set<string>>(new Set());
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  // media_item_id → TrackedArtwork (loaded in parallel with library)
  const [trackedArtwork, setTrackedArtwork] = useState<Map<string, TrackedArtwork>>(new Map());

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false, message: "", severity: "success",
  });

  const [activeLibrary, setActiveLibrary] = useState<string | null>(null);
  const [collMenuAnchor, setCollMenuAnchor] = useState<null | HTMLElement>(null);

  function markFailed(id: string) {
    setFailedThumbs((prev) => prev.has(id) ? prev : new Set([...prev, id]));
  }

  function markRetry(id: string) {
    setFailedThumbs((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleReset(mediaItemId: string) {
    try {
      await untrackArtwork(conn!.nodeUrl, conn!.adminToken, mediaItemId);
      setTrackedArtwork((prev) => {
        const next = new Map(prev);
        next.delete(mediaItemId);
        return next;
      });
      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    }
  }

  const missingChip = { label: "MISSING", color: "error" as const };

  useEffect(() => {
    const connection = loadCreatorConnection();
    setConn(connection);
    if (!connection) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      fetchMediaLibrary(),
      getTrackedArtwork(connection.nodeUrl, connection.adminToken),
      listMediaServers(connection.nodeUrl, connection.adminToken).catch(() => [] as typeof servers),
    ])
      .then(([lib, tracked, srvList]) => {
        setServers(srvList);
        setLibrary(lib);
        const artworkMap = new Map(tracked.map((t) => [t.media_item_id, t]));
        setTrackedArtwork(artworkMap);

        // Fallback: for legacy records that predate the creator_display_name column,
        // fetch the missing name from the source node (one request per legacy item).
        const legacy = tracked.filter((t) => !t.creator_display_name && t.node_base && t.poster_id);
        if (legacy.length > 0) {
          Promise.all(
            legacy.map((t) =>
              fetchPosterFromNode(t.node_base!, t.poster_id).then((p) => ({
                id: t.media_item_id,
                name: p?.creator.display_name ?? null,
              })),
            ),
          ).then((results) => {
            setTrackedArtwork((prev) => {
              const next = new Map(prev);
              for (const { id, name } of results) {
                const existing = next.get(id);
                if (existing && name) next.set(id, { ...existing, creator_display_name: name });
              }
              return next;
            });
          }).catch(() => {});
        }

        setError(null);
        // Trigger artwork update check after library loads
        runArtworkUpdateCheck(
          connection.nodeUrl,
          connection.adminToken,
          (p) => setUpdateProgress(p),
          async (item, poster) => {
            await applyToPlexPoster(connection.nodeUrl, connection.adminToken, {
              imageUrl: poster.assets.full.url,
              tmdbId: item.tmdb_id ?? undefined,
              plexRatingKey: item.media_item_id,
              mediaType: item.media_type,
              posterId: item.poster_id,
              assetHash: poster.assets.full.hash,
              creatorId: item.creator_id ?? undefined,
              creatorDisplayName: item.creator_display_name ?? undefined,
              themeId: item.theme_id ?? undefined,
              nodeBase: item.node_base ?? undefined,
              autoUpdate: true,
            });
          },
        ).then((count) => {
          setTimeout(() => setUpdateProgress(null), count > 0 ? 3000 : 1500);
        }).catch(() => setUpdateProgress(null));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!conn) return;
    let itemId: string | null = null;
    if (nav.view === "collection" || nav.view === "show") itemId = nav.id;
    else if (nav.view === "season") itemId = nav.seasonId;
    if (!itemId) return;
    const id = itemId;
    setChildrenLoading(true);
    fetchMediaChildren(conn.nodeUrl, conn.adminToken, id)
      .then((items) => { setChildren(items); setChildrenForId(id); })
      .catch(() => { setChildren([]); setChildrenForId(id); })
      .finally(() => setChildrenLoading(false));
  }, [nav, conn]);

  const sortedMovies = useMemo(() => sortedByTitle(library?.movies ?? []), [library]);
  const sortedShows = useMemo(() => sortedByTitle(library?.shows ?? []), [library]);
  const sortedCollections = useMemo(() => sortedByTitle(library?.collections ?? []), [library]);

  type SidebarLibrary = { name: string; type: "movie" | "show"; hasCollections: boolean };

  const sidebarLibraries = useMemo((): SidebarLibrary[] => {
    const srv = servers[0];
    if (!srv || !library) return [];
    // Movie libraries: has collections if any movie in that library has collection_ids.
    // This is reliable even before library_title is populated on collection items.
    const movieLibsWithCollections = new Set<string>();
    for (const movie of library.movies) {
      if (movie.library_title && (movie.collection_ids?.length ?? 0) > 0) {
        movieLibsWithCollections.add(movie.library_title);
      }
    }
    // TV libraries: has collections if any collection item has a matching library_title.
    const tvCollectionLibs = new Set(
      library.collections.map((c) => c.library_title).filter(Boolean) as string[]
    );
    return [
      ...srv.movie_libraries.map((name) => ({
        name,
        type: "movie" as const,
        hasCollections: movieLibsWithCollections.has(name),
      })),
      ...srv.tv_libraries.map((name) => ({
        name,
        type: "show" as const,
        hasCollections: tvCollectionLibs.has(name),
      })),
    ];
  }, [servers, library]);

  const visibleMovies = useMemo(() =>
    activeLibrary ? sortedMovies.filter((m) => m.library_title === activeLibrary) : sortedMovies,
  [sortedMovies, activeLibrary]);
  const visibleShows = useMemo(() =>
    activeLibrary ? sortedShows.filter((s) => s.library_title === activeLibrary) : sortedShows,
  [sortedShows, activeLibrary]);
  const visibleCollections = useMemo(() =>
    activeLibrary ? sortedCollections.filter((c) => c.library_title === activeLibrary) : sortedCollections,
  [sortedCollections, activeLibrary]);

  // Per-collection movie count derived from movies' collection_ids arrays.
  const collectionMovieCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const movie of library?.movies ?? []) {
      for (const cid of movie.collection_ids ?? []) {
        counts.set(cid, (counts.get(cid) ?? 0) + 1);
      }
    }
    return counts;
  }, [library?.movies]);
  const subs = useMemo(() => getSubscriptions(), []);
  const subThemeNames = useMemo(() => new Map(subs.map((s: ThemeSubscription) => [s.themeId, s.themeName])), [subs]);

  const activeLetters = useMemo((): Set<string> => {
    const items =
      nav.view === "movies" ? visibleMovies :
      nav.view === "shows" ? visibleShows :
      nav.view === "collections" ? visibleCollections : [];
    return new Set(items.map((i) => firstLetter(i.title)));
  }, [nav.view, visibleMovies, visibleShows, visibleCollections]);

  const showAZRail = nav.view === "movies" || nav.view === "shows" || nav.view === "collections";

  function goToLibrary(lib: SidebarLibrary) {
    setActiveLibrary(lib.name);
    navigate({ view: lib.type === "movie" ? "movies" : "shows" });
  }

  function goToLibraryCollections(lib: SidebarLibrary) {
    setActiveLibrary(lib.name);
    navigate({ view: "collections" });
  }

  if (!conn) {
    return <Alert severity="info" sx={{ m: 3 }}>{t("noConnection")}</Alert>;
  }
  if (loading) {
    return (
      <Stack alignItems="center" spacing={2} sx={{ py: 8 }}>
        <CircularProgress />
        <Typography color="text.secondary">{t("loading")}</Typography>
      </Stack>
    );
  }
  if (error) return <Alert severity="error" sx={{ m: 3 }}>{error}</Alert>;
  if (servers.length === 0) {
    return <NoMediaServersPage />;
  }
  if (!library) return <Alert severity="warning" sx={{ m: 3 }}>{t("notConfigured")}</Alert>;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function src(item: MediaItem) {
    return thumbUrl(conn!.nodeUrl, conn!.adminToken, item.id);
  }

  const noItems = t("noItems");

  // ---------------------------------------------------------------------------
  // Breadcrumbs + page title
  // ---------------------------------------------------------------------------

  const homePageCrumb: PageCrumb = {
    label: <HomeIcon sx={{ fontSize: "1rem", verticalAlign: "text-bottom" }} />,
    onClick: () => { setActiveLibrary(null); navigate({ view: "movies" }); },
  };

  const mediaBreadcrumbs: PageCrumb[] = (() => {
    const lib = activeLibrary;
    const moviesLabel = lib ?? t("movies");
    const showsLabel = lib ?? t("tvShows");
    const moviesBack: PageCrumb = { label: moviesLabel, onClick: () => navigate({ view: "movies" }) };
    const showsBack: PageCrumb = { label: showsLabel, onClick: () => navigate({ view: "shows" }) };
    const collectionsBack: PageCrumb = { label: t("collections"), onClick: () => navigate({ view: "collections" }) };

    switch (nav.view) {
      case "movies":      return [homePageCrumb, { label: moviesLabel }];
      case "shows":       return [homePageCrumb, { label: showsLabel }];
      case "collections": return lib
        ? [homePageCrumb, { label: lib, onClick: () => navigate({ view: "movies" }) }, { label: t("collections") }]
        : [homePageCrumb, { label: t("collections") }];
      case "collection":  return lib
        ? [homePageCrumb, { label: lib, onClick: () => navigate({ view: "movies" }) }, collectionsBack, { label: nav.title }]
        : [homePageCrumb, collectionsBack, { label: nav.title }];
      case "show":        return [homePageCrumb, showsBack, { label: nav.title }];
      case "season":      return [
        homePageCrumb,
        showsBack,
        { label: nav.showTitle, onClick: () => navigate({ view: "show", id: nav.showId, title: nav.showTitle }) },
        { label: nav.title },
      ];
      case "movie":       return nav.fromCollectionId
        ? [homePageCrumb, moviesBack, collectionsBack, { label: nav.fromCollectionTitle ?? "", onClick: () => navigate({ view: "collection", id: nav.fromCollectionId!, title: nav.fromCollectionTitle ?? "" }) }, { label: nav.item.title }]
        : [homePageCrumb, moviesBack, { label: nav.item.title }];
      default:            return [homePageCrumb];
    }
  })();

  const mediaPageTitle = (() => {
    switch (nav.view) {
      case "movies":      return activeLibrary ?? t("movies");
      case "shows":       return activeLibrary ?? t("tvShows");
      case "collections": return t("collections");
      case "collection":  return nav.title;
      case "show": {
        const s = library?.shows.find((s) => s.id === nav.id);
        return s ? `${s.title}${s.year ? ` (${s.year})` : ""}` : nav.title;
      }
      case "season": {
        const { seasonIndex, title: seasonTitle } = nav;
        return seasonIndex != null
          ? (seasonTitle && !/^season\s+0*\d+$/i.test(seasonTitle.trim())
            ? `Season ${String(seasonIndex).padStart(2, "0")} · ${seasonTitle}`
            : `Season ${String(seasonIndex).padStart(2, "0")}`)
          : (seasonTitle ?? "");
      }
      case "movie":       return `${nav.item.title}${nav.item.year ? ` (${nav.item.year})` : ""}`;
      default:            return null;
    }
  })();

  // Subtitle rendered by PageHeader — keeps subtitle/spacing logic out of detail components.
  const mediaSubtitle = (() => {
    if (nav.view === "movie" && library) {
      const memberColls = (nav.item.collection_ids ?? [])
        .map((id) => sortedCollections.find((c) => c.id === id))
        .filter((c): c is MediaItem => c != null);

      const captionSx = { letterSpacing: "0.05em", textTransform: "uppercase" as const };
      const btnSx = { fontSize: "0.6rem", py: 0.25, lineHeight: 1.5 };

      if (memberColls.length === 0) {
        return <Typography variant="caption" color="text.disabled" sx={captionSx}>{t("movieNotAMember")}</Typography>;
      }
      if (memberColls.length === 1) {
        return (
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="caption" color="text.secondary" sx={captionSx}>
              {t("movieMemberOf", { title: memberColls[0].title })}
            </Typography>
            <Button size="small" variant="outlined" sx={btnSx}
              onClick={() => navigate({ view: "collection", id: memberColls[0].id, title: memberColls[0].title })}>
              {nav.fromCollectionTitle ? t("movieBackToCollection") : t("movieViewCollection")}
            </Button>
          </Stack>
        );
      }
      return (
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="caption" color="text.secondary" sx={captionSx}>
            {t("movieMemberOfMany", { n: memberColls.length })}
          </Typography>
          <Button size="small" variant="outlined" endIcon={<ArrowDropDownIcon />} sx={btnSx}
            onClick={(e) => setCollMenuAnchor(e.currentTarget)}>
            {nav.fromCollectionTitle ? t("movieBackToCollection") : t("movieViewCollection")}
          </Button>
          <Menu anchorEl={collMenuAnchor} open={Boolean(collMenuAnchor)} onClose={() => setCollMenuAnchor(null)}>
            {memberColls.map((c) => (
              <MenuItem key={c.id} dense onClick={() => { setCollMenuAnchor(null); navigate({ view: "collection", id: c.id, title: c.title }); }}>
                {c.title}
              </MenuItem>
            ))}
          </Menu>
        </Stack>
      );
    }

    if (nav.view === "show" && library) {
      const showItem = library.shows.find((s) => s.id === nav.id);
      if (!showItem || (showItem.child_count == null && showItem.leaf_count == null)) return null;
      return (
        <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {t("showLibrarySubheading", {
            seasons: showItem.child_count ?? 0,
            episodes: showItem.leaf_count ?? 0,
            server: servers[0]?.name ?? "",
          })}
        </Typography>
      );
    }

    return null;
  })();

  // ---------------------------------------------------------------------------
  // Main views
  // ---------------------------------------------------------------------------

  function renderContent() {
    // collection and show views handle their own childrenLoading state internally
    if (childrenLoading && nav.view !== "collection" && nav.view !== "show") {
      return <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>;
    }

    switch (nav.view) {
      case "movies":
        return (
          <>
            <LetterGroup
              items={visibleMovies}
              noItemsText={noItems}
              renderItem={(item) => {
                const failed = failedThumbs.has(item.id);
                const tracked = trackedArtwork.get(item.id);
                const meta = makeArtworkMeta(tracked, subThemeNames);
                return (
                  <PosterCard
                    poster={makePoster(item, src(item), tracked?.creator_display_name ?? undefined)}
                    chip={failed ? missingChip : undefined}
                    imageFailed={failed}
                    managed={!!tracked}
                    menuSlot={failed ? <CardRetryMenu onRetry={() => markRetry(item.id)} /> : (tracked ? <CardManageMenu onReset={() => handleReset(item.id)} /> : undefined)}
                    imageWrapper={tracked ? (img) => <ArtworkMetadataTooltip meta={meta}>{img}</ArtworkMetadataTooltip> : undefined}
                    onImageError={() => markFailed(item.id)}
                    onClick={item.tmdb_id != null ? () => navigate({ view: "movie", item }) : undefined}
                  />
                );
              }}
            />
            <Box sx={{ height: "100vh", flexShrink: 0 }} aria-hidden="true" />
          </>
        );

      case "shows":
        return (
          <>
            <LetterGroup
              items={visibleShows}
              noItemsText={noItems}
              renderItem={(item) => {
                const failed = failedThumbs.has(item.id);
                return (
                  <TVShowCard
                    group={makeTVShowGroup(item, src(item), failed, trackedArtwork.get(item.id)?.creator_display_name ?? undefined)}
                    onClick={() => navigate({ view: "show", id: item.id, title: item.title })}
                    chip={failed ? missingChip : undefined}
                    menuSlot={failed ? <CardRetryMenu onRetry={() => markRetry(item.id)} /> : undefined}
                    onImageError={() => markFailed(item.id)}
                  />
                );
              }}
            />
            <Box sx={{ height: "100vh", flexShrink: 0 }} aria-hidden="true" />
          </>
        );

      case "collections":
        return (
          <>
            <LetterGroup
              items={visibleCollections}
              noItemsText={noItems}

              renderItem={(item) => {
                const failed = failedThumbs.has(item.id);
                const tracked = trackedArtwork.get(item.id);
                const meta = makeArtworkMeta(tracked, subThemeNames);
                return (
                  <CollectionCard
                    group={makeCollectionGroup({ ...item, title: item.title.replace(/\s+Collection$/i, "") }, src(item), failed, tracked?.creator_display_name ?? undefined, collectionMovieCounts.get(item.id))}
                    onClick={() => navigate({ view: "collection", id: item.id, title: item.title })}
                    chip={failed ? missingChip : undefined}
                    managed={!!tracked}
                    menuSlot={failed ? <CardRetryMenu onRetry={() => markRetry(item.id)} /> : (tracked ? <CardManageMenu onReset={() => handleReset(item.id)} /> : undefined)}
                    imageWrapper={tracked ? (img) => <ArtworkMetadataTooltip meta={meta}>{img}</ArtworkMetadataTooltip> : undefined}
                    onImageError={() => markFailed(item.id)}
                  />
                );
              }}
            />
            <Box sx={{ height: "100vh", flexShrink: 0 }} aria-hidden="true" />
          </>
        );

      case "movie":
        return (
          <MovieMediaDetail
            item={nav.item}
            conn={conn!}
            serverName={servers[0]?.name}
          />
        );

      case "collection": {
        const collectionItem = library!.collections.find((c) => c.id === nav.id) ?? null;
        return collectionItem ? (
          <CollectionMediaDetail
            item={collectionItem}
            conn={conn!}
            movies={children}
            childrenForId={childrenForId}
            childrenLoading={childrenLoading}
            failedThumbs={failedThumbs}
            trackedArtwork={trackedArtwork}
            onMarkFailed={markFailed}
            onMarkRetry={markRetry}
            onUntrack={(id) => setTrackedArtwork((prev) => { const next = new Map(prev); next.delete(id); return next; })}
            onTrack={(id, artwork) => setTrackedArtwork((prev) => new Map(prev).set(id, artwork))}
            onNavigateToMovie={(movie) => navigate({ view: "movie", item: movie, fromCollectionId: nav.id, fromCollectionTitle: nav.title })}
            serverName={servers[0]?.name}
          />
        ) : <Typography color="text.secondary">{noItems}</Typography>;
      }

      case "show": {
        const showItem = library!.shows.find((s) => s.id === nav.id) ?? null;
        return showItem ? (
          <TvShowMediaDetail
            item={showItem}
            seasons={children}
            seasonsLoading={childrenLoading}
            conn={conn!}
            failedThumbs={failedThumbs}
            trackedArtwork={trackedArtwork}
            onMarkFailed={markFailed}
            onMarkRetry={markRetry}
            onUntrack={(id) => setTrackedArtwork((prev) => { const next = new Map(prev); next.delete(id); return next; })}
            onTrack={(id, artwork) => setTrackedArtwork((prev) => new Map(prev).set(id, artwork))}
            onViewEpisodes={(season) => navigate({ view: "season", showId: nav.id, showTitle: nav.title, showTmdbId: showItem.tmdb_id, seasonId: season.id, seasonIndex: season.index, title: season.title })}
            serverName={servers[0]?.name}
          />
        ) : <Typography color="text.secondary">{noItems}</Typography>;
      }

      case "season":
        return (
          <EpisodeMediaDetail
            episodes={children}
            episodesLoading={childrenLoading}
            seasonTitle={nav.title}
            seasonIndex={nav.seasonIndex}
            showTitle={nav.showTitle}
            showTmdbId={nav.showTmdbId}
            seasonId={nav.seasonId}
            showId={nav.showId}
            conn={conn!}
            failedThumbs={failedThumbs}
            trackedArtwork={trackedArtwork}
            onMarkFailed={markFailed}
            onMarkRetry={markRetry}
            onUntrack={(id) => setTrackedArtwork((prev) => { const next = new Map(prev); next.delete(id); return next; })}
            onTrack={(id, artwork) => setTrackedArtwork((prev) => new Map(prev).set(id, artwork))}
            serverName={servers[0]?.name}
          />
        );
    }
  }

  return (
    <>
    <Box sx={{ position: "relative", height: "calc(100vh - 64px)", overflow: "hidden" }}>
      {/* Sidebar — floats over the content as a frosted glass overlay */}
      <Box
        component="nav"
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: 220,
          display: { xs: "none", md: "block" },
          borderRight: 1,
          borderColor: "divider",
          overflowY: "auto",
          bgcolor: (theme) => alpha(theme.palette.background.default, 0.45),
          backdropFilter: "blur(12px)",
          zIndex: 1,
        }}
      >
        <Box sx={{ pt: "5px" }} />
        {servers.map((srv) => (
          <Accordion
            key={srv.id}
            defaultExpanded
            disableGutters
            elevation={0}
            square
            sx={{
              bgcolor: "transparent",
              "&:before": { display: "none" },
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ fontSize: "1rem" }} />}
              sx={{
                minHeight: 36,
                pl: 2,
                pr: 1,
                "& .MuiAccordionSummary-content": { my: 0.5, alignItems: "center", ml: 0, gap: 0 },
              }}
            >
              {/* minWidth: 36 + justifyContent: center mirrors ListItemIcon exactly */}
              <Box sx={{ minWidth: 36, display: "flex", alignItems: "center" }}>
                {srv.type === "plex" ? (
                  <PlexMark height={20} style={{ marginLeft: 5 }} />
                ) : (
                  <Box
                    sx={{
                      bgcolor: "#00a4dc",
                      color: "#fff",
                      fontWeight: 900,
                      fontSize: "0.55rem",
                      px: 0.6,
                      py: 0.15,
                      borderRadius: 0.5,
                      letterSpacing: "0.05em",
                      lineHeight: 1.4,
                    }}
                  >
                    JF
                  </Box>
                )}
              </Box>
              <Typography noWrap sx={{ fontSize: "0.7rem", fontWeight: 700, color: "text.secondary", letterSpacing: 0.5, textTransform: "uppercase" }}>
                {srv.name}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <List dense disablePadding>
                {sidebarLibraries.map((lib) => {
                  const isActive = activeLibrary === lib.name;
                  const isItemsView = nav.view === "movies" || nav.view === "shows";
                  const icon = lib.type === "movie"
                    ? <MovieOutlinedIcon fontSize="small" />
                    : <TvOutlinedIcon fontSize="small" />;
                  return (
                    <Fragment key={lib.name}>
                      <ListItem disablePadding>
                        <ListItemButton
                          selected={isActive && !lib.hasCollections}
                          onClick={() => goToLibrary(lib)}
                        >
                          <ListItemIcon sx={{ minWidth: 36 }}>{icon}</ListItemIcon>
                          <ListItemText
                            primary={lib.name}
                            slotProps={{ primary: { variant: "body2", color: isActive ? "primary" : "text.primary", fontWeight: isActive ? 600 : 400 } }}
                          />
                        </ListItemButton>
                      </ListItem>
                      {lib.hasCollections && (
                        <>
                          <ListItem disablePadding>
                            <ListItemButton
                              selected={isActive && isItemsView}
                              onClick={() => goToLibrary(lib)}
                              sx={{ pl: 6.5 }}
                            >
                              <ListItemText
                                primary={t("library")}
                                slotProps={{ primary: { variant: "body2", color: isActive && isItemsView ? "primary" : "text.secondary", fontWeight: isActive && isItemsView ? 600 : 400 } }}
                              />
                            </ListItemButton>
                          </ListItem>
                          <ListItem disablePadding>
                            <ListItemButton
                              selected={isActive && nav.view === "collections"}
                              onClick={() => goToLibraryCollections(lib)}
                              sx={{ pl: 6.5 }}
                            >
                              <ListItemText
                                primary={t("collections")}
                                slotProps={{ primary: { variant: "body2", color: isActive && nav.view === "collections" ? "primary" : "text.secondary", fontWeight: isActive && nav.view === "collections" ? 600 : 400 } }}
                              />
                            </ListItemButton>
                          </ListItem>
                        </>
                      )}
                    </Fragment>
                  );
                })}
              </List>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>

      {/* Main content — full width, left padding clears the sidebar */}
      <Box ref={scrollContainerRef} sx={{ height: "100%", overflowY: "auto", p: { xs: 2, md: 3 }, pl: { md: "232px" }, pr: { md: 5 } }}>
        <PageHeader
          crumbs={mediaBreadcrumbs}
          title={mediaPageTitle ?? undefined}
          subtitle={mediaSubtitle ?? undefined}
          compact={nav.view === "collection" || nav.view === "season"}
        />

        {updateProgress && (
          <Box sx={{ mb: 2 }}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {t("checkingArtwork", { checked: updateProgress.checked, total: updateProgress.total })}
              </Typography>
              {updateProgress.updated > 0 && (
                <Typography variant="caption" color="success.main">
                  {t("artworkUpdated", { count: updateProgress.updated })}
                </Typography>
              )}
            </Stack>
            <LinearProgress
              variant="determinate"
              value={updateProgress.total > 0 ? (updateProgress.checked / updateProgress.total) * 100 : 0}
            />
          </Box>
        )}
        {renderContent()}
      </Box>

      {showAZRail && <AZRail available={activeLetters} scrollContainerRef={scrollContainerRef} />}
    </Box>

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
    </>
  );
}
