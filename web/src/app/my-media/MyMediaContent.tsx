"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Snackbar from "@mui/material/Snackbar";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";

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

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CollectionsOutlinedIcon from "@mui/icons-material/CollectionsOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import TvOutlinedIcon from "@mui/icons-material/TvOutlined";

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
        // A letter is "current" if its anchor has reached within 8px of the container top
        if (el.getBoundingClientRect().top <= containerTop + 8) {
          found = letter;
        }
      }
      setCurrent(found);
    };

    container.addEventListener("scroll", updateCurrent, { passive: true });
    updateCurrent();
    return () => container.removeEventListener("scroll", updateCurrent);
  }, [available, scrollContainerRef]);

  function jump(letter: string) {
    // Optimistically set current so the highlight is immediate on click
    setCurrent(letter);
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

function makeCollectionGroup(item: MediaItem, src: string, failed = false, creatorName = ""): CollectionGroup {
  return {
    key: item.id,
    title: item.title,
    year: item.year ?? undefined,
    collectionTmdbId: item.tmdb_id ?? 0,
    creatorId: "",
    creatorName,
    coverUrls: failed ? [] : [src],
    collectionCount: 1,
    movieCount: item.leaf_count ?? 0,
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
  | { view: "movie"; item: MediaItem };

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
        },
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
      {groupByLetter(items).map(([letter, group]) => (
        <Box key={letter}>
          <Box id={`az-${letter}`} sx={{ scrollMarginTop: 80 }} />
          <Typography variant="overline" color="text.disabled" sx={{ fontSize: "0.65rem" }}>{letter}</Typography>
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

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 2 }}>
      <IconButton size="small" onClick={onClick} aria-label={label}>
        <ArrowBackIcon fontSize="small" />
      </IconButton>
      <Typography variant="body2" color="text.secondary" sx={{ cursor: "pointer" }} onClick={onClick}>
        {label}
      </Typography>
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

  const [children, setChildren] = useState<MediaItem[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [failedThumbs, setFailedThumbs] = useState<Set<string>>(new Set());
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  // media_item_id → TrackedArtwork (loaded in parallel with library)
  const [trackedArtwork, setTrackedArtwork] = useState<Map<string, TrackedArtwork>>(new Map());

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false, message: "", severity: "success",
  });

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
    ])
      .then(([lib, tracked]) => {
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
      .then(setChildren)
      .catch(() => setChildren([]))
      .finally(() => setChildrenLoading(false));
  }, [nav, conn]);

  const sortedMovies = useMemo(() => sortedByTitle(library?.movies ?? []), [library]);
  const sortedShows = useMemo(() => sortedByTitle(library?.shows ?? []), [library]);
  const sortedCollections = useMemo(() => sortedByTitle(library?.collections ?? []), [library]);
  const subs = useMemo(() => getSubscriptions(), []);
  const subThemeNames = useMemo(() => new Map(subs.map((s: ThemeSubscription) => [s.themeId, s.themeName])), [subs]);

  const activeLetters = useMemo((): Set<string> => {
    const items =
      nav.view === "movies" ? sortedMovies :
      nav.view === "shows" ? sortedShows :
      nav.view === "collections" ? sortedCollections : [];
    return new Set(items.map((i) => firstLetter(i.title)));
  }, [nav.view, sortedMovies, sortedShows, sortedCollections]);

  const showAZRail = nav.view === "movies" || nav.view === "shows" || nav.view === "collections";

  const sidebarActive =
    nav.view === "collections" || nav.view === "collection" ? "collections" :
    nav.view === "movies" || nav.view === "movie" ? "movies" : "shows";

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
  if (!library) return <Alert severity="warning" sx={{ m: 3 }}>{t("notConfigured")}</Alert>;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function src(item: MediaItem) {
    return thumbUrl(conn!.nodeUrl, conn!.adminToken, item.id);
  }

  const noItems = t("noItems");

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
            <Typography variant="h5" gutterBottom>{t("movies")}</Typography>
            <LetterGroup
              items={sortedMovies}
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
          </>
        );

      case "shows":
        return (
          <>
            <Typography variant="h5" gutterBottom>{t("tvShows")}</Typography>
            <LetterGroup
              items={sortedShows}
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
          </>
        );

      case "collections":
        return (
          <>
            <Typography variant="h5" gutterBottom>{t("collections")}</Typography>
            <LetterGroup
              items={sortedCollections}
              noItemsText={noItems}

              renderItem={(item) => {
                const failed = failedThumbs.has(item.id);
                const tracked = trackedArtwork.get(item.id);
                const meta = makeArtworkMeta(tracked, subThemeNames);
                return (
                  <CollectionCard
                    group={makeCollectionGroup(item, src(item), failed, tracked?.creator_display_name ?? undefined)}
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
          </>
        );

      case "movie":
        return (
          <MovieMediaDetail
            item={nav.item}
            conn={conn!}
            onBack={() => navigate({ view: "movies" })}
          />
        );

      case "collection": {
        const collectionItem = library!.collections.find((c) => c.id === nav.id) ?? null;
        return collectionItem ? (
          <CollectionMediaDetail
            item={collectionItem}
            conn={conn!}
            onBack={() => navigate({ view: "collections" })}
            movies={children}
            childrenLoading={childrenLoading}
            failedThumbs={failedThumbs}
            trackedArtwork={trackedArtwork}
            onMarkFailed={markFailed}
            onMarkRetry={markRetry}
            onUntrack={(id) => setTrackedArtwork((prev) => { const next = new Map(prev); next.delete(id); return next; })}
            onTrack={(id, artwork) => setTrackedArtwork((prev) => new Map(prev).set(id, artwork))}
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
            onBack={() => navigate({ view: "shows" })}
            onMarkFailed={markFailed}
            onMarkRetry={markRetry}
            onUntrack={(id) => setTrackedArtwork((prev) => { const next = new Map(prev); next.delete(id); return next; })}
            onTrack={(id, artwork) => setTrackedArtwork((prev) => new Map(prev).set(id, artwork))}
            onViewEpisodes={(season) => navigate({ view: "season", showId: nav.id, showTitle: nav.title, showTmdbId: showItem.tmdb_id, seasonId: season.id, seasonIndex: season.index, title: season.title })}
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
            showId={nav.showId}
            showTitle={nav.showTitle}
            showTmdbId={nav.showTmdbId}
            conn={conn!}
            failedThumbs={failedThumbs}
            trackedArtwork={trackedArtwork}
            onBack={() => navigate({ view: "show", id: nav.showId, title: nav.showTitle })}
            onMarkFailed={markFailed}
            onMarkRetry={markRetry}
            onUntrack={(id) => setTrackedArtwork((prev) => { const next = new Map(prev); next.delete(id); return next; })}
            onTrack={(id, artwork) => setTrackedArtwork((prev) => new Map(prev).set(id, artwork))}
          />
        );
    }
  }

  return (
    <>
    <Box sx={{ display: "flex", height: "calc(100vh - 64px)", overflow: "hidden" }}>
      {/* Sidebar */}
      <Box
        component="nav"
        sx={{
          width: 220,
          flexShrink: 0,
          display: { xs: "none", md: "block" },
          borderRight: 1,
          borderColor: "divider",
          pt: 2,
          overflowY: "auto",
        }}
      >
        <Typography variant="overline" sx={{ px: 2, display: "block", color: "text.secondary", letterSpacing: 1.5 }}>
          {t("byType")}
        </Typography>
        <List dense disablePadding>
          {[
            { key: "collections", label: t("collections"), icon: <CollectionsOutlinedIcon fontSize="small" /> },
            { key: "movies",      label: t("movies"),      icon: <MovieOutlinedIcon fontSize="small" /> },
            { key: "shows",       label: t("tvShows"),     icon: <TvOutlinedIcon fontSize="small" /> },
          ].map(({ key, label, icon }) => (
            <ListItem key={key} disablePadding>
              <ListItemButton
                selected={sidebarActive === key}
                onClick={() => navigate({ view: key as "collections" | "movies" | "shows" })}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {icon}
                </ListItemIcon>
                <ListItemText
                  primary={label}
                  slotProps={{
                    primary: {
                      variant: "body2",
                      color: sidebarActive === key ? "primary" : "text.primary",
                      fontWeight: sidebarActive === key ? 600 : 400,
                    },
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        <Divider sx={{ mt: 1 }} />
      </Box>

      {/* Main content */}
      <Box ref={scrollContainerRef} sx={{ flex: 1, p: { xs: 2, md: 3 }, pr: { md: 5 }, overflowY: "auto" }}>
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
