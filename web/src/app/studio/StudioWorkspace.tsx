"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardMedia from "@mui/material/CardMedia";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Checkbox from "@mui/material/Checkbox";
import Container from "@mui/material/Container";
import Collapse from "@mui/material/Collapse";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Slide from "@mui/material/Slide";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import TvOutlinedIcon from "@mui/icons-material/TvOutlined";

import { POSTER_GRID_COLS, EPISODE_GRID_COLS, BACKDROP_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";
import { loadCreatorConnection } from "@/lib/storage";
import { fetchSetting, saveSetting } from "@/lib/settings";
import { adminListThemes, adminCreateTheme, adminDeleteTheme, adminSetPosterTheme } from "@/lib/themes";
import { fetchTmdbCollection, fetchTmdbTvShow, fetchTmdbTvSeason, fetchTmdbSearchCollection, fetchTmdbSearchTv, fetchTmdbMovie, fetchTmdbSearchMovie, tmdbImageUrl, tmdbStillUrl, type TmdbCollection, type TmdbMovie, type TmdbTvShow, type TmdbEpisode, type TmdbTvSeason, type TmdbSearchResult } from "@/lib/tmdb";
import type { CreatorTheme, PosterEntry } from "@/lib/types";
import PosterCard from "@/components/PosterCard";
import { CollectionCard, CountBadge, TVShowCard, type CollectionGroup, type TVShowGroup } from "@/components/SectionedPosterView";
import ThemeModal from "./ThemeModal";
import PosterActionsMenu from "./PosterActionsMenu";
import UploadDrawer, { type UploadPreFill } from "./UploadDrawer";

// ─── Navigation state ────────────────────────────────────────────────────────

type NavState =
  | { view: "root" }
  | { view: "theme"; themeId: string }
  | { view: "media"; mediaKey: string };

// ─── Media group helpers ───────────────────────────────────────────────────

type MediaGroup = {
  key: string;
  title: string;
  type: string; // collection | show | movie | season | episode | backdrop
  tmdbId: number;
  previewUrls: string[];
  posterCount: number;
};

function groupByMedia(posters: PosterEntry[]): MediaGroup[] {
  const map = new Map<string, { title: string; type: string; tmdbId: number; previews: string[]; count: number; hasShowPoster: boolean }>();

  function upsert(key: string, type: string, tmdbId: number, p: PosterEntry, isShowPoster: boolean) {
    const baseTitle = p.media.title ?? String(tmdbId);
    const titleWithYear = (type === "show" && p.media.year) ? `${baseTitle} (${p.media.year})` : baseTitle;
    if (!map.has(key)) {
      map.set(key, { title: titleWithYear, type, tmdbId, previews: [], count: 0, hasShowPoster: false });
    }
    const g = map.get(key)!;
    g.count++;
    if (g.previews.length < 4) g.previews.push(p.assets.preview.url);
    // Prefer the title from a show-type poster so the group is labelled by show name, not episode title
    if (isShowPoster || !g.hasShowPoster) {
      if (isShowPoster) { g.title = titleWithYear; g.hasShowPoster = true; }
      else if (!g.hasShowPoster) { g.title = titleWithYear; }
    }
  }

  for (const p of posters) {
    const tmdbId = p.media.tmdb_id ?? 0;
    const showId = p.media.show_tmdb_id || null; // treat 0 as absent
    const type = p.media.type;

    if (type === "show") {
      upsert(`show:${tmdbId}`, "show", tmdbId, p, true);
    } else if (type === "season" || type === "episode") {
      const id = showId ?? tmdbId;
      upsert(`show:${id}`, "show", id, p, false);
    } else if (type === "backdrop") {
      if (showId != null) {
        upsert(`show:${showId}`, "show", showId, p, false);
      } else if (p.media.collection_tmdb_id != null) {
        upsert(`collection:${p.media.collection_tmdb_id}`, "collection", p.media.collection_tmdb_id, p, false);
      } else {
        upsert(`movie:${tmdbId}`, "movie", tmdbId, p, false);
      }
    } else if (type === "collection") {
      upsert(`collection:${tmdbId}`, "collection", tmdbId, p, true); // collection poster is authoritative title source
    } else if (type === "movie") {
      if (p.media.collection_tmdb_id != null) {
        upsert(`collection:${p.media.collection_tmdb_id}`, "collection", p.media.collection_tmdb_id, p, false);
      } else {
        upsert(`movie:${tmdbId}`, "movie", tmdbId, p, false);
      }
    } else {
      upsert(`movie:${tmdbId}`, "movie", tmdbId, p, false);
    }
  }

  return Array.from(map.entries()).map(([key, v]) => ({
    key,
    title: v.title,
    type: v.type,
    tmdbId: v.tmdbId,
    previewUrls: v.previews,
    posterCount: v.count,
  }));
}

// ─── Mosaic thumbnail ─────────────────────────────────────────────────────────

function MosaicThumb({ urls, alt }: { urls: string[]; alt: string }) {
  const n = Math.min(urls.length, 4);
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: n >= 2 ? "1fr 1fr" : "1fr", gridTemplateRows: n >= 3 ? "1fr 1fr" : "1fr", aspectRatio: "2 / 3", overflow: "hidden", bgcolor: "action.hover" }}>
      {urls.slice(0, 4).map((url, i) => (
        <Box key={i} component="img" src={url} alt={n === 1 ? alt : `${alt} (${i + 1})`} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ))}
    </Box>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StudioWorkspace() {
  const t = useTranslations("studio");
  const tc = useTranslations("common");

  const [conn, setConn] = useState<{ nodeUrl: string; adminToken: string; creatorId: string; creatorDisplayName: string } | null>(null);
  const [themes, setThemes] = useState<CreatorTheme[]>([]);
  const [allPosters, setAllPosters] = useState<PosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [nav, setNav] = useState<NavState>({ view: "root" });
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<CreatorTheme | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set(["themes", "movies", "tv"]));
  const [tmdbCollectionData, setTmdbCollectionData] = useState<TmdbCollection | null>(null);
  const [tmdbCollectionState, setTmdbCollectionState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [tmdbTvShowData, setTmdbTvShowData] = useState<TmdbTvShow | null>(null);
  const [tmdbTvShowState, setTmdbTvShowState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [tmdbMovieData, setTmdbMovieData] = useState<import("@/lib/tmdb").TmdbMovieDetail | null>(null);
  const [tmdbMovieState, setTmdbMovieState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
  const [uploadPreFill, setUploadPreFill] = useState<UploadPreFill | undefined>(undefined);
  const [activeThemeId, setActiveThemeId] = useState<string>(""); // "" = Default theme

  // Pinned collections — persisted on the node so they're available on any device
  const [pinnedCollections, setPinnedCollections] = useState<{ tmdbId: number; title: string }[]>([]);
  function savePinnedCollections(next: { tmdbId: number; title: string }[], c = conn) {
    setPinnedCollections(next);
    if (c) void saveSetting(c.nodeUrl, c.adminToken, c.creatorId, "studio_pinned_collections", next);
  }

  // Pinned TV shows — persisted on the node so they're available on any device
  const [pinnedTvShows, setPinnedTvShows] = useState<{ tmdbId: number; title: string }[]>([]);
  const pinnedTvShowsRef = { current: pinnedTvShows };
  pinnedTvShowsRef.current = pinnedTvShows;
  function savePinnedTvShows(next: { tmdbId: number; title: string }[], c = conn) {
    setPinnedTvShows(next);
    if (c) void saveSetting(c.nodeUrl, c.adminToken, c.creatorId, "studio_pinned_tv_shows", next);
  }

  const [pinnedMovies, setPinnedMovies] = useState<{ tmdbId: number; title: string }[]>([]);
  function savePinnedMovies(next: { tmdbId: number; title: string }[], c = conn) {
    setPinnedMovies(next);
    if (c) void saveSetting(c.nodeUrl, c.adminToken, c.creatorId, "studio_pinned_movies", next);
  }

  // Delete media group confirmation
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<{ group: MediaGroup } | null>(null);

  async function handleDeleteMediaGroup(group: MediaGroup) {
    if (!conn) return;
    const posters = postersForMedia(group.key);
    await Promise.all(
      posters.map((p) =>
        fetch(`${conn.nodeUrl}/v1/admin/posters/${encodeURIComponent(p.poster_id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${conn.adminToken}` },
        }).catch(() => undefined)
      )
    );
    if (group.type === "collection") {
      savePinnedCollections(pinnedCollections.filter((pc) => pc.tmdbId !== group.tmdbId));
    } else if (group.type === "show") {
      savePinnedTvShows(pinnedTvShows.filter((ps) => ps.tmdbId !== group.tmdbId));
    } else if (group.type === "movie") {
      savePinnedMovies(pinnedMovies.filter((pm) => pm.tmdbId !== group.tmdbId));
    }
    if (nav.view === "media" && nav.mediaKey === group.key) setNav({ view: "root" });
    setDeleteGroupConfirm(null);
    await loadData();
  }

  // Add TV show dialog
  const [addShowOpen, setAddShowOpen] = useState(false);
  const [addShowInput, setAddShowInput] = useState("");
  const [addShowLookup, setAddShowLookup] = useState<{ tmdbId: number; title: string } | null>(null);
  const [addShowState, setAddShowState] = useState<"idle" | "loading" | "found" | "results" | "error">("idle");
  const [addShowResults, setAddShowResults] = useState<TmdbSearchResult[]>([]);

  async function handleLookupShow() {
    const raw = addShowInput.trim();
    if (!raw) return;
    setAddShowState("loading");
    setAddShowLookup(null);
    setAddShowResults([]);
    const numId = Number(raw);
    if (numId) {
      const data = await fetchTmdbTvShow(numId);
      if (data) {
        const year = data.first_air_date?.slice(0, 4);
        setAddShowLookup({ tmdbId: numId, title: year ? `${data.name} (${year})` : data.name });
        setAddShowState("found");
        return;
      }
    }
    const results = await fetchTmdbSearchTv(raw);
    if (results.length === 1) {
      const year = results[0].first_air_date?.slice(0, 4);
      setAddShowLookup({ tmdbId: results[0].id, title: year ? `${results[0].name} (${year})` : results[0].name });
      setAddShowState("found");
    } else if (results.length > 1) {
      setAddShowResults(results.slice(0, 8));
      setAddShowState("results");
    } else {
      setAddShowState("error");
    }
  }

  function handleAddShow() {
    if (!addShowLookup) return;
    const next = pinnedTvShows.filter((s) => s.tmdbId !== addShowLookup.tmdbId);
    next.push(addShowLookup);
    savePinnedTvShows(next);
    setAddShowOpen(false);
    setAddShowInput("");
    setAddShowLookup(null);
    setAddShowState("idle");
    setAddShowResults([]);
    setNav({ view: "media", mediaKey: `show:${addShowLookup.tmdbId}` });
  }

  function closeAddShow() {
    setAddShowOpen(false);
    setAddShowInput("");
    setAddShowLookup(null);
    setAddShowState("idle");
    setAddShowResults([]);
  }

  // Add movie dialog — accepts a movie ID or title, branches on belongs_to_collection
  type AddMovieResult =
    | { kind: "collection"; collectionId: number; collectionName: string; movieTitle: string }
    | { kind: "standalone"; movieId: number; movieTitle: string; year: string };

  const [addMovieOpen, setAddMovieOpen] = useState(false);
  const [addMovieInput, setAddMovieInput] = useState("");
  const [addMovieState, setAddMovieState] = useState<"idle" | "loading" | "found" | "results" | "error">("idle");
  const [addMovieResult, setAddMovieResult] = useState<AddMovieResult | null>(null);
  const [addMovieResults, setAddMovieResults] = useState<TmdbSearchResult[]>([]);

  async function lookupMovieById(id: number) {
    const data = await fetchTmdbMovie(id);
    if (!data) return false;
    const year = data.release_date?.slice(0, 4) ?? "";
    if (data.belongs_to_collection) {
      setAddMovieResult({ kind: "collection", collectionId: data.belongs_to_collection.id, collectionName: data.belongs_to_collection.name, movieTitle: data.title });
    } else {
      setAddMovieResult({ kind: "standalone", movieId: data.id, movieTitle: data.title, year });
    }
    setAddMovieState("found");
    return true;
  }

  async function handleLookupMovie() {
    const raw = addMovieInput.trim();
    if (!raw) return;
    setAddMovieState("loading");
    setAddMovieResult(null);
    setAddMovieResults([]);
    const numId = Number(raw);
    if (numId) {
      const ok = await lookupMovieById(numId);
      if (ok) return;
    }
    const results = await fetchTmdbSearchMovie(raw);
    if (results.length === 1) {
      await lookupMovieById(results[0].id);
    } else if (results.length > 1) {
      setAddMovieResults(results.slice(0, 8));
      setAddMovieState("results");
    } else {
      setAddMovieState("error");
    }
  }

  function handleAddMovie() {
    if (!addMovieResult) return;
    if (addMovieResult.kind === "collection") {
      const next = pinnedCollections.filter((c) => c.tmdbId !== addMovieResult.collectionId);
      next.push({ tmdbId: addMovieResult.collectionId, title: addMovieResult.collectionName });
      savePinnedCollections(next);
      setNav({ view: "media", mediaKey: `collection:${addMovieResult.collectionId}` });
    } else {
      const next = pinnedMovies.filter((m) => m.tmdbId !== addMovieResult.movieId);
      const title = addMovieResult.year ? `${addMovieResult.movieTitle} (${addMovieResult.year})` : addMovieResult.movieTitle;
      next.push({ tmdbId: addMovieResult.movieId, title });
      savePinnedMovies(next);
      setNav({ view: "media", mediaKey: `movie:${addMovieResult.movieId}` });
    }
    closeAddMovie();
  }

  function closeAddMovie() {
    setAddMovieOpen(false);
    setAddMovieInput("");
    setAddMovieState("idle");
    setAddMovieResult(null);
    setAddMovieResults([]);
  }

  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // Load connection + data
  const loadData = useCallback(async () => {
    const c = loadCreatorConnection();
    if (!c) { setLoading(false); return; }
    // Try to get creator_id from node
    const connWithId = { ...c, creatorId: "", creatorDisplayName: "" };

    setConn(connWithId);

    try {
      // Load all posters from node
      const postersRes = await fetch(`${c.nodeUrl}/v1/posters?limit=200`, {
        headers: { Authorization: `Bearer ${c.adminToken}` },
      });
      const postersJson = postersRes.ok ? (await postersRes.json()) as { results: PosterEntry[] } : { results: [] };
      const posters = postersJson.results;
      setAllPosters(posters);

      // Derive creator_id and display name from first poster
      const cid = posters[0]?.creator.creator_id ?? "";
      const displayName = posters[0]?.creator.display_name ?? "";
      const fullConn = { ...c, creatorId: cid, creatorDisplayName: displayName };
      setConn(fullConn);

      // Load pinned collections, TV shows, and standalone movies from node
      const [pinnedColsFromNode, pinnedShowsFromNode, pinnedMoviesFromNode] = await Promise.all([
        fetchSetting<{ tmdbId: number; title: string }[]>(c.nodeUrl, c.adminToken, cid, "studio_pinned_collections"),
        fetchSetting<{ tmdbId: number; title: string }[]>(c.nodeUrl, c.adminToken, cid, "studio_pinned_tv_shows"),
        fetchSetting<{ tmdbId: number; title: string }[]>(c.nodeUrl, c.adminToken, cid, "studio_pinned_movies"),
      ]);
      // Compute media groups from posters so we can auto-pin any untracked ones
      const derivedGroups = groupByMedia(posters);

      // Start from whatever is already pinned on the node (or empty on first use)
      let currentPinnedCols: { tmdbId: number; title: string }[] = pinnedColsFromNode ?? [];
      let currentPinnedShows: { tmdbId: number; title: string }[] = pinnedShowsFromNode ?? [];
      let currentPinnedMovies: { tmdbId: number; title: string }[] = pinnedMoviesFromNode ?? [];

      // Migrate any legacy localStorage entries
      if (pinnedColsFromNode === null) {
        try {
          const local = JSON.parse(localStorage.getItem("studio_pinned_collections") ?? "[]") as { tmdbId: number; title: string }[];
          if (Array.isArray(local) && local.length > 0) {
            currentPinnedCols = local;
            localStorage.removeItem("studio_pinned_collections");
          }
        } catch { /* ignore */ }
      }
      if (pinnedShowsFromNode === null) {
        try {
          const local = JSON.parse(localStorage.getItem("studio_pinned_tv_shows") ?? "[]") as { tmdbId: number; title: string }[];
          if (Array.isArray(local) && local.length > 0) {
            currentPinnedShows = local;
            localStorage.removeItem("studio_pinned_tv_shows");
          }
        } catch { /* ignore */ }
      }

      // Strip any years accidentally baked into collection titles
      const strippedCols = currentPinnedCols.map((pc) => ({
        ...pc,
        title: pc.title.replace(/\s*\(\d{4}\)$/, ""),
      }));
      if (strippedCols.some((pc, i) => pc.title !== currentPinnedCols[i].title)) {
        currentPinnedCols = strippedCols;
      }

      // Auto-pin any poster-derived groups not already tracked
      let colsChanged = false;
      let showsChanged = false;
      let moviesChanged = false;
      for (const g of derivedGroups) {
        if (g.type === "collection" && !currentPinnedCols.some((pc) => pc.tmdbId === g.tmdbId)) {
          currentPinnedCols = [...currentPinnedCols, { tmdbId: g.tmdbId, title: g.title }];
          colsChanged = true;
        }
        if (g.type === "show" && !currentPinnedShows.some((ps) => ps.tmdbId === g.tmdbId)) {
          currentPinnedShows = [...currentPinnedShows, { tmdbId: g.tmdbId, title: g.title }];
          showsChanged = true;
        }
        if (g.type === "movie" && !currentPinnedMovies.some((pm) => pm.tmdbId === g.tmdbId)) {
          currentPinnedMovies = [...currentPinnedMovies, { tmdbId: g.tmdbId, title: g.title }];
          moviesChanged = true;
        }
      }

      setPinnedCollections(currentPinnedCols);
      setPinnedTvShows(currentPinnedShows);
      setPinnedMovies(currentPinnedMovies);

      // Persist to node if anything changed
      if (colsChanged || pinnedColsFromNode === null) {
        void saveSetting(c.nodeUrl, c.adminToken, cid, "studio_pinned_collections", currentPinnedCols);
      }
      if (showsChanged || pinnedShowsFromNode === null) {
        void saveSetting(c.nodeUrl, c.adminToken, cid, "studio_pinned_tv_shows", currentPinnedShows);
      }
      if (moviesChanged || pinnedMoviesFromNode === null) {
        void saveSetting(c.nodeUrl, c.adminToken, cid, "studio_pinned_movies", currentPinnedMovies);
      }

      // Load themes — auto-create "Default theme" for new creators
      let ts = await adminListThemes(c.nodeUrl, c.adminToken, cid);
      if (ts.length === 0 && cid) {
        const defaultTheme = await adminCreateTheme(c.nodeUrl, c.adminToken, cid, "Default theme").catch(() => null);
        if (defaultTheme) ts = [defaultTheme];
      }
      setThemes(ts);
    } catch {
      // node unreachable — show connection error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // Auto-select first theme once themes are loaded
  useEffect(() => {
    if (activeThemeId === "" && themes.length > 0) setActiveThemeId(themes[0].theme_id);
  }, [themes, activeThemeId]);

  // Sync theme switcher when navigating into a theme view
  useEffect(() => {
    if (nav.view === "theme") setActiveThemeId(nav.themeId);
  }, [nav]);

  const refreshThemes = useCallback(async () => {
    if (!conn?.creatorId) return;
    const ts = await adminListThemes(conn.nodeUrl, conn.adminToken, conn.creatorId).catch(() => []);
    setThemes(ts);
  }, [conn]);

  const handleDeleteTheme = useCallback(async (themeId: string) => {
    if (!conn) return;
    await adminDeleteTheme(conn.nodeUrl, conn.adminToken, conn.creatorId, themeId).catch(() => undefined);
    await refreshThemes();
    setNav({ view: "root" });
  }, [conn, refreshThemes]);

  const handleMovePoster = useCallback(async (posterId: string, themeId: string | null) => {
    if (!conn) return;
    await adminSetPosterTheme(conn.nodeUrl, conn.adminToken, posterId, themeId).catch(() => undefined);
    await loadData();
  }, [conn, loadData]);

  const handleMoveAllPosters = useCallback(async (posterIds: string[], themeId: string | null) => {
    if (!conn || posterIds.length === 0) return;
    await Promise.all(posterIds.map((id) => adminSetPosterTheme(conn.nodeUrl, conn.adminToken, id, themeId).catch(() => undefined)));
    await loadData();
  }, [conn, loadData]);

  const handleTogglePublished = useCallback(async (posterId: string, currentlyPublished: boolean) => {
    if (!conn) return;
    await fetch(`${conn.nodeUrl}/v1/admin/posters/${encodeURIComponent(posterId)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${conn.adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ published: !currentlyPublished }),
    }).catch(() => undefined);
    await loadData();
  }, [conn, loadData]);

  const handleDeletePoster = useCallback(async (posterId: string) => {
    if (!conn) return;
    await fetch(`${conn.nodeUrl}/v1/admin/posters/${encodeURIComponent(posterId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${conn.adminToken}` },
    }).catch(() => undefined);
    await loadData();
  }, [conn, loadData]);

  // ─── Derived views ──────────────────────────────────────────────────────────

  const mediaGroups = useMemo(() => groupByMedia(allPosters), [allPosters]);

  // Fetch TMDB collection data when navigating into a collection view — lifted
  // here so it survives re-renders of the inner CollectionDetailView function.
  useEffect(() => {
    if (nav.view !== "media" || !nav.mediaKey.startsWith("collection:")) {
      setTmdbCollectionData(null);
      setTmdbCollectionState("idle");
      return;
    }
    const collId = Number(nav.mediaKey.split(":")[1]);
    setTmdbCollectionData(null);
    setTmdbCollectionState("loading");
    let cancelled = false;
    void fetchTmdbCollection(collId).then((data) => {
      if (!cancelled) {
        setTmdbCollectionData(data);
        setTmdbCollectionState(data ? "ok" : "error");
      }
    });
    return () => { cancelled = true; };
  }, [nav]);

  // Fetch TMDB TV show data when navigating into a show view
  useEffect(() => {
    if (nav.view !== "media" || !nav.mediaKey.startsWith("show:")) {
      setTmdbTvShowData(null);
      setTmdbTvShowState("idle");
      return;
    }
    const showId = Number(nav.mediaKey.split(":")[1]);
    setTmdbTvShowData(null);
    setTmdbTvShowState("loading");
    let cancelled = false;
    void fetchTmdbTvShow(showId).then((data) => {
      if (!cancelled) {
        setTmdbTvShowData(data);
        setTmdbTvShowState(data ? "ok" : "error");
        if (data) {
          // Upsert pinned entry with year-enriched title so sidebar reflects it
          const year = data.first_air_date?.slice(0, 4);
          const enrichedTitle = year ? `${data.name} (${year})` : data.name;
          const prev = pinnedTvShowsRef.current;
          const exists = prev.some((ps) => ps.tmdbId === showId);
          const next = exists
            ? prev.map((ps) => ps.tmdbId === showId ? { ...ps, title: enrichedTitle } : ps)
            : [...prev, { tmdbId: showId, title: enrichedTitle }];
          savePinnedTvShows(next);
        }
      }
    });
    return () => { cancelled = true; };
  }, [nav]);

  // Fetch TMDB movie data when navigating into a standalone movie view
  useEffect(() => {
    if (nav.view !== "media" || !nav.mediaKey.startsWith("movie:")) {
      setTmdbMovieData(null);
      setTmdbMovieState("idle");
      return;
    }
    const movieId = Number(nav.mediaKey.split(":")[1]);
    setTmdbMovieData(null);
    setTmdbMovieState("loading");
    let cancelled = false;
    void fetchTmdbMovie(movieId).then((data) => {
      if (!cancelled) {
        setTmdbMovieData(data);
        setTmdbMovieState(data ? "ok" : "error");
      }
    });
    return () => { cancelled = true; };
  }, [nav]);

  // Sidebar is purely the pinned list — poster counts + previews merged in from actual poster data
  const sidebarCollections: MediaGroup[] = pinnedCollections.map((pc) => {
    const derived = mediaGroups.find((g) => g.key === `collection:${pc.tmdbId}`);
    return {
      key: `collection:${pc.tmdbId}`,
      title: pc.title,
      type: "collection",
      tmdbId: pc.tmdbId,
      previewUrls: derived?.previewUrls ?? [],
      posterCount: derived?.posterCount ?? 0,
    };
  }).sort((a, b) => a.title.localeCompare(b.title));

  const sidebarTvShows: MediaGroup[] = pinnedTvShows.map((ps) => {
    const derived = mediaGroups.find((g) => g.key === `show:${ps.tmdbId}`);
    return {
      key: `show:${ps.tmdbId}`,
      title: ps.title,
      type: "show",
      tmdbId: ps.tmdbId,
      previewUrls: derived?.previewUrls ?? [],
      posterCount: derived?.posterCount ?? 0,
    };
  }).sort((a, b) => a.title.localeCompare(b.title));

  const sidebarMovies: MediaGroup[] = pinnedMovies.map((pm) => {
    const derived = mediaGroups.find((g) => g.key === `movie:${pm.tmdbId}`);
    return {
      key: `movie:${pm.tmdbId}`,
      title: pm.title,
      type: "movie",
      tmdbId: pm.tmdbId,
      previewUrls: derived?.previewUrls ?? [],
      posterCount: derived?.posterCount ?? 0,
    };
  }).sort((a, b) => a.title.localeCompare(b.title));

  const standaloneMovieCount = allPosters.filter((p) => p.media.type === "movie" && !p.media.collection_tmdb_id).length;
  const orphanedTvCount = allPosters.filter(
    (p) => (p.media.type === "season" || p.media.type === "episode") && !p.media.show_tmdb_id
  ).length;

  function postersForTheme(themeId: string) {
    return allPosters.filter((p) => p.media.theme_id === themeId);
  }

  function postersForMedia(mediaKey: string) {
    const [type, id] = mediaKey.split(":");
    if (type === "show") {
      const showId = Number(id);
      return allPosters.filter((p) =>
        (p.media.type === "show" && p.media.tmdb_id === showId) ||
        ((p.media.type === "season" || p.media.type === "episode") && p.media.show_tmdb_id === showId) ||
        (p.media.type === "backdrop" && (p.media.show_tmdb_id || null) === showId)
      );
    }
    if (type === "collection") {
      const collId = Number(id);
      return allPosters.filter((p) =>
        (p.media.type === "collection" && p.media.tmdb_id === collId) ||
        (p.media.type === "movie" && p.media.collection_tmdb_id === collId) ||
        (p.media.type === "backdrop" && p.media.collection_tmdb_id === collId)
      );
    }
    return allPosters.filter(
      (p) => p.media.type === type && String(p.media.tmdb_id) === id
    );
  }

  function mediaGroupsForTheme(themeId: string): MediaGroup[] {
    return groupByMedia(postersForTheme(themeId));
  }

  function toCollectionGroup(g: MediaGroup): CollectionGroup {
    const posters = postersForMedia(g.key);
    const collPoster = posters.find((p) => p.media.type === "collection");
    const moviePosters = posters.filter((p) => p.media.type === "movie");
    const coverUrls = collPoster
      ? [collPoster.assets.preview.url]
      : moviePosters.slice(0, 4).map((p) => p.assets.preview.url);
    return { key: g.key, title: g.title, collectionTmdbId: g.tmdbId, creatorId: "", creatorName: "", coverUrls, collectionCount: collPoster ? 1 : 0, movieCount: moviePosters.length };
  }

  function toTVShowGroup(g: MediaGroup): TVShowGroup {
    const posters = postersForMedia(g.key);
    const showPoster = posters.find((p) => p.media.type === "show");
    const seasonPosters = posters
      .filter((p) => p.media.type === "season")
      .sort((a, b) => (b.media.season_number ?? 0) - (a.media.season_number ?? 0));
    const episodePosters = posters.filter((p) => p.media.type === "episode");
    let coverPreviews: string[];
    if (showPoster) {
      coverPreviews = [showPoster.assets.preview.url];
    } else if (seasonPosters.length >= 4) {
      coverPreviews = seasonPosters.slice(0, 4).map((p) => p.assets.preview.url);
    } else {
      coverPreviews = seasonPosters.length > 0 ? [seasonPosters[0].assets.preview.url] : [];
    }
    return { key: g.key, title: g.title, showTmdbId: g.tmdbId, creatorId: "", creatorName: "", hasBoxSet: !!(showPoster && seasonPosters.length > 0), coverPreviews, seasonCount: seasonPosters.length, episodeCount: episodePosters.length };
  }

  // ─── Breadcrumb ──────────────────────────────────────────────────────────────

  function Breadcrumb() {
    const crumbs: Array<{ label: string; nav: NavState }> = [{ label: conn?.creatorDisplayName || t("title"), nav: { view: "root" } }];
    if (nav.view === "theme") {
      const theme = themes.find((t) => t.theme_id === nav.themeId);
      crumbs.push({ label: theme?.name ?? nav.themeId, nav: { view: "theme", themeId: nav.themeId } });
    }
    if (nav.view === "media") {
      const group = sidebarCollections.find((g) => g.key === nav.mediaKey) ?? sidebarTvShows.find((g) => g.key === nav.mediaKey) ?? sidebarMovies.find((g) => g.key === nav.mediaKey) ?? mediaGroups.find((g) => g.key === nav.mediaKey);
      const label = group?.title ?? tmdbCollectionData?.name ?? tmdbTvShowData?.name ?? nav.mediaKey;
      crumbs.push({ label, nav: { view: "media", mediaKey: nav.mediaKey } });
    }
    return (
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 2 }}>
        {crumbs.map((c, i) => (
          <Stack key={i} direction="row" spacing={0.5} alignItems="center">
            {i > 0 && <Typography color="text.disabled">/</Typography>}
            {i < crumbs.length - 1 ? (
              <Typography
                variant="body2"
                color="primary"
                sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                onClick={() => setNav(c.nav)}
              >
                {c.label}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">{c.label}</Typography>
            )}
          </Stack>
        ))}
      </Stack>
    );
  }

  // ─── Main content panels ──────────────────────────────────────────────────

  function PosterGrid({ posters, showThemeLabel }: { posters: PosterEntry[]; showThemeLabel?: boolean }) {
    return (
      <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
        {posters.map((p) => {
          const themeName = showThemeLabel
            ? (themes.find((t) => t.theme_id === p.media.theme_id)?.name ?? t("unthemed"))
            : null;
          return (
            <Box key={p.poster_id}>
              <Card sx={{ height: "100%", position: "relative" }}>
                <Link href={`/p/${encodeURIComponent(p.poster_id)}`} style={{ display: "block" }}>
                  <CardMedia
                    component="img"
                    image={p.assets.preview.url}
                    alt={p.media.title ?? p.poster_id}
                    sx={{ aspectRatio: p.media.type === "episode" || p.media.type === "backdrop" ? "16 / 9" : "2 / 3", objectFit: "contain" }}
                  />
                </Link>
                {themeName && (
                  <Box sx={{ px: 1.5, pt: 0.5, pb: 0.5 }}>
                    <Typography variant="caption" color="text.disabled" noWrap sx={{ display: "block", fontSize: "0.6rem" }}>
                      {themeName}
                    </Typography>
                  </Box>
                )}
                <Box sx={{ position: "absolute", top: 4, right: 4 }}>
                  <PosterActionsMenu
                    poster={p}
                    themes={themes}
                    onMove={(themeId) => void handleMovePoster(p.poster_id, themeId)}
                    onDelete={() => void handleDeletePoster(p.poster_id)}
                  />
                </Box>
              </Card>
            </Box>
          );
        })}
      </Box>
    );
  }

  function TvShowDetailView({ showTmdbId, posters, tmdbData, tmdbState }: {
    showTmdbId: number;
    posters: PosterEntry[];
    tmdbData: TmdbTvShow | null;
    tmdbState: "idle" | "loading" | "ok" | "error";
  }) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [seasonEpisodes, setSeasonEpisodes] = useState<Map<number, { state: "loading" | "ok" | "error"; episodes: TmdbEpisode[] }>>(() => new Map());
    const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());

    function toggleSelect(posterId: string) {
      setSelected((prev) => {
        const next = new Set(prev);
        next.has(posterId) ? next.delete(posterId) : next.add(posterId);
        return next;
      });
    }

    const existingPosters = posters.filter((p) => p.media.type !== undefined && (activeThemeId === "" || p.media.theme_id === activeThemeId));
    const allIds = existingPosters.map((p) => p.poster_id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
    function selectAll() { setSelected(new Set(allIds)); }
    function selectNone() { setSelected(new Set()); }

    async function batchSetPublished(publish: boolean) {
      if (!conn || selected.size === 0) return;
      await Promise.all(
        [...selected].map((id) =>
          fetch(`${conn.nodeUrl}/v1/admin/posters/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${conn.adminToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ published: publish }),
          }).catch(() => undefined)
        )
      );
      setSelected(new Set());
      void loadData();
    }

    function matchesTheme(p: PosterEntry) {
      return activeThemeId === "" || p.media.theme_id === activeThemeId;
    }

    // Index uploaded posters by slot
    const showPosters = posters.filter((p) => p.media.type === "show" && matchesTheme(p));
    const backdropPosters = posters.filter(
      (p) => p.media.type === "backdrop" && p.media.show_tmdb_id === showTmdbId && !p.media.collection_tmdb_id && matchesTheme(p)
    );
    const uploadedSeasonPosters = new Map<number, PosterEntry[]>();
    const uploadedEpisodePosters = new Map<string, PosterEntry>(); // "S:E"
    for (const p of posters.filter(matchesTheme)) {
      if (p.media.type === "season" && p.media.season_number != null) {
        const sn = p.media.season_number;
        if (!uploadedSeasonPosters.has(sn)) uploadedSeasonPosters.set(sn, []);
        uploadedSeasonPosters.get(sn)!.push(p);
      }
      if (p.media.type === "episode" && p.media.season_number != null && p.media.episode_number != null) {
        uploadedEpisodePosters.set(`${p.media.season_number}:${p.media.episode_number}`, p);
      }
    }

    // Seasons list — TMDB first (skip season 0 = Specials), fallback to creator's data
    const tmdbSeasons: TmdbTvSeason[] = (tmdbData?.seasons ?? []).filter((s) => s.season_number > 0);
    const fallbackSeasonNums = [...new Set(
      posters.filter((p) => p.media.season_number != null).map((p) => p.media.season_number!)
    )].sort((a, b) => a - b);
    const seasons: TmdbTvSeason[] = (tmdbSeasons.length > 0
      ? tmdbSeasons
      : fallbackSeasonNums.map((n) => ({ id: n, season_number: n, name: `Season ${n}`, episode_count: 0, poster_path: null }))
    ).slice().reverse();

    async function loadSeasonEpisodes(sn: number) {
      if (seasonEpisodes.has(sn)) return;
      setSeasonEpisodes((prev) => new Map(prev).set(sn, { state: "loading", episodes: [] }));
      const data = await fetchTmdbTvSeason(showTmdbId, sn);
      setSeasonEpisodes((prev) => {
        const m = new Map(prev);
        m.set(sn, data ? { state: "ok", episodes: data.episodes ?? [] } : { state: "error", episodes: [] });
        return m;
      });
    }

    function toggleSeason(sn: number) {
      if (!expandedSeasons.has(sn)) void loadSeasonEpisodes(sn);
      setExpandedSeasons((prev) => {
        const next = new Set(prev);
        next.has(sn) ? next.delete(sn) : next.add(sn);
        return next;
      });
    }

    function ExistingPosterCard({ p }: { p: PosterEntry }) {
      const published = p.published !== false;
      const isSelected = selected.has(p.poster_id);
      const statusChip = published
        ? { label: t("published"), color: "success" as const }
        : { label: t("draft"), color: "warning" as const };
      return (
        <Box sx={{ position: "relative" }}>
          <Box
            sx={{
              outline: isSelected ? "2px solid" : "none",
              outlineColor: "primary.main",
              borderRadius: 1,
              "& .select-checkbox": { opacity: isSelected ? 1 : 0 },
              "&:hover .select-checkbox": { opacity: 1 },
            }}
          >
            <PosterCard
              poster={p}
              actions={[{ label: tc("details"), href: `/p/${encodeURIComponent(p.poster_id)}` }]}
              aspectRatio={(p.media.type === "backdrop" || p.media.type === "episode") ? "16 / 9" : "2 / 3"}
              chip={statusChip}
            />
          </Box>
          <Box className="select-checkbox" sx={{ position: "absolute", bottom: 4, right: 4, transition: "opacity 0.15s" }}>
            <Checkbox size="small" checked={isSelected} onChange={() => toggleSelect(p.poster_id)} onClick={(e) => e.stopPropagation()} sx={{ p: 0.25 }} />
          </Box>
          <Box sx={{ position: "absolute", top: 4, right: 4 }}>
            <PosterActionsMenu
              poster={p}
              themes={themes}
              onMove={(themeId) => void handleMovePoster(p.poster_id, themeId)}
              onDelete={() => void handleDeletePoster(p.poster_id)}
              onTogglePublished={() => void handleTogglePublished(p.poster_id, published)}
            />
          </Box>
        </Box>
      );
    }

    function TvPlaceholderCard({ label, imagePath, aspectRatio = "2 / 3", onUpload }: {
      label: string;
      imagePath?: string | null;
      aspectRatio?: string;
      onUpload: () => void;
    }) {
      const isLandscape = aspectRatio !== "2 / 3";
      const imgUrl = isLandscape ? tmdbStillUrl(imagePath) : tmdbImageUrl(imagePath);
      return (
        <Card sx={{ height: "100%", border: "1px dashed", borderColor: "divider" }}>
          <Box sx={{ position: "relative" }}>
            {imgUrl ? (
              <CardMedia component="img" image={imgUrl} alt={label} sx={{ aspectRatio, objectFit: "cover", display: "block", filter: "grayscale(1)", opacity: 0.3 }} />
            ) : (
              <Box sx={{ aspectRatio, bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.55 }}>
                <Typography variant="caption" color="text.disabled">{label}</Typography>
              </Box>
            )}
            <Chip label={t("missing")} size="small" color="error" sx={{ position: "absolute", top: 10, left: 0, fontWeight: 700, fontSize: "0.6rem", height: 20, borderRadius: "0 6px 6px 0", pointerEvents: "none" }} />
            <Box sx={{ position: "absolute", top: 4, right: 4 }}>
              <IconButton size="small" sx={{ bgcolor: "rgba(0,0,0,0.6)", color: "white", "&:hover": { bgcolor: "rgba(0,0,0,0.8)" } }} onClick={onUpload}>
                <FileUploadOutlinedIcon sx={{ fontSize: "0.85rem" }} />
              </IconButton>
            </Box>
          </Box>
          <Box sx={{ px: 1.5, pt: 0.75, pb: 0.5 }}>
            <Typography variant="caption" color="text.disabled" noWrap sx={{ display: "block" }}>{label}</Typography>
          </Box>
        </Card>
      );
    }

    function SectionHeading({ label }: { label: string }) {
      return (
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1, fontSize: "0.65rem", display: "block" }}>
          {label}
        </Typography>
      );
    }

    function CardGrid({ children }: { children: React.ReactNode }) {
      return <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>{children}</Box>;
    }

    function BackdropCardGrid({ children }: { children: React.ReactNode }) {
      return <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>{children}</Box>;
    }

    function EpisodeCardGrid({ children }: { children: React.ReactNode }) {
      return <Box sx={{ display: "grid", gridTemplateColumns: EPISODE_GRID_COLS, gap: GRID_GAP }}>{children}</Box>;
    }

    return (
      <Stack spacing={3}>
        {/* Select all row */}
        {allIds.length > 0 && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Checkbox
              size="small"
              checked={allSelected}
              indeterminate={selected.size > 0 && !allSelected}
              onChange={() => allSelected ? selectNone() : selectAll()}
              sx={{ p: 0 }}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ cursor: "pointer", "&:hover": { color: "text.primary" } }}
              onClick={() => allSelected ? selectNone() : selectAll()}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </Typography>
            {selected.size > 0 && (
              <Typography variant="caption" color="text.disabled">· {selected.size} selected</Typography>
            )}
          </Stack>
        )}

        {tmdbState === "error" && (
          <Alert severity="warning">
            TMDB data couldn&apos;t be loaded for show ID <strong>{showTmdbId}</strong> — placeholders won&apos;t be shown.
          </Alert>
        )}

        {/* Show poster */}
        <Stack spacing={1}>
          <SectionHeading label={t("sectionPosters")} />
          <CardGrid>
            {showPosters.length > 0
              ? showPosters.map((p) => (
                  <Box key={p.poster_id}>
                    <ExistingPosterCard p={p} />
                  </Box>
                ))
              : (
                  <Box>
                    <TvPlaceholderCard
                      label={tmdbData?.name ?? "Show"}
                      imagePath={tmdbData?.poster_path}
                      onUpload={() => {
                        setUploadPreFill({ mediaType: "show", tmdbId: String(showTmdbId), title: tmdbData?.name ?? "", themeId: activeThemeId });
                        setUploadDrawerOpen(true);
                      }}
                    />
                  </Box>
                )
            }
          </CardGrid>
        </Stack>

        {/* Show backdrop */}
        <Stack spacing={1}>
          <SectionHeading label={t("sectionBackdrop")} />
          <BackdropCardGrid>
            {backdropPosters.length > 0
              ? backdropPosters.map((p) => (
                  <Box key={p.poster_id}>
                    <ExistingPosterCard p={p} />
                  </Box>
                ))
              : (
                  <Box>
                    <TvPlaceholderCard
                      label={tmdbData?.name ?? "Show"}
                      imagePath={tmdbData?.backdrop_path}
                      aspectRatio="16 / 9"
                      onUpload={() => {
                        setUploadPreFill({ mediaType: "backdrop", showTmdbId: String(showTmdbId), tmdbId: String(showTmdbId), title: tmdbData?.name ?? "", themeId: activeThemeId });
                        setUploadDrawerOpen(true);
                      }}
                    />
                  </Box>
                )
            }
          </BackdropCardGrid>
        </Stack>

        {/* Seasons */}
        {seasons.map((season) => {
          const sn = season.season_number;
          const isOpen = expandedSeasons.has(sn);
          const seasonPostersHere = uploadedSeasonPosters.get(sn) ?? [];
          const epData = seasonEpisodes.get(sn);
          const tmdbEps = epData?.state === "ok" ? epData.episodes : [];
          const uploadedEpCount = [...uploadedEpisodePosters.keys()].filter((k) => k.startsWith(`${sn}:`)).length;
          const seasonPosterIds = [
            ...seasonPostersHere.map((p) => p.poster_id),
            ...[...uploadedEpisodePosters.entries()].filter(([k]) => k.startsWith(`${sn}:`)).map(([, p]) => p.poster_id),
          ];
          const allSeasonSelected = seasonPosterIds.length > 0 && seasonPosterIds.every((id) => selected.has(id));
          const someSeasonSelected = seasonPosterIds.some((id) => selected.has(id));
          return (
            <Box key={sn}>
              <Box
                sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", py: 0.5, borderBottom: 1, borderColor: "divider" }}
                onClick={() => toggleSeason(sn)}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  {seasonPosterIds.length > 0 && (
                    <Checkbox
                      size="small"
                      checked={allSeasonSelected}
                      indeterminate={someSeasonSelected && !allSeasonSelected}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (allSeasonSelected) seasonPosterIds.forEach((id) => next.delete(id));
                          else seasonPosterIds.forEach((id) => next.add(id));
                          return next;
                        });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      sx={{ p: 0 }}
                    />
                  )}
                  <Typography variant="subtitle2">{season.name}</Typography>
                  {(uploadedEpCount > 0 || season.episode_count > 0) && (
                    <Chip
                      label={season.episode_count > 0 ? `${uploadedEpCount} / ${season.episode_count} episodes` : `${uploadedEpCount} episodes`}
                      size="small"
                      color={season.episode_count > 0 && uploadedEpCount === season.episode_count ? "success" : "default"}
                      sx={{ height: 18, fontSize: "0.6rem" }}
                    />
                  )}
                </Stack>
                <ExpandMoreIcon sx={{ fontSize: "1rem", transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
              </Box>
              <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <Stack spacing={2} sx={{ pt: 2 }}>
                  {/* Season poster */}
                  <Stack spacing={1}>
                    <SectionHeading label={t("sectionPosters")} />
                    <CardGrid>
                      {seasonPostersHere.length > 0
                        ? seasonPostersHere.map((p) => (
                            <Box key={p.poster_id}>
                              <ExistingPosterCard p={p} />
                            </Box>
                          ))
                        : (
                            <Box>
                              <TvPlaceholderCard
                                label={season.name}
                                imagePath={season.poster_path}
                                onUpload={() => {
                                  setUploadPreFill({ mediaType: "season", showTmdbId: String(showTmdbId), tmdbId: String(showTmdbId), seasonNumber: String(sn), title: tmdbData?.name ?? "", themeId: activeThemeId });
                                  setUploadDrawerOpen(true);
                                }}
                              />
                            </Box>
                          )
                      }
                    </CardGrid>
                  </Stack>

                  {/* Episode cards */}
                  {epData?.state === "loading" && (
                    <Typography variant="caption" color="text.disabled">Loading episodes…</Typography>
                  )}
                  {tmdbEps.length > 0 && (
                    <Stack spacing={1}>
                      <SectionHeading label={t("episodesLabel")} />
                      <EpisodeCardGrid>
                        {tmdbEps.map((ep: TmdbEpisode) => {
                          const existing = uploadedEpisodePosters.get(`${sn}:${ep.episode_number}`);
                          const epLabel = `E${String(ep.episode_number).padStart(2, "0")} · ${ep.name}`;
                          return (
                            <Box key={ep.episode_number}>
                              {existing
                                ? <ExistingPosterCard p={existing} />
                                : <TvPlaceholderCard
                                    label={epLabel}
                                    imagePath={ep.still_path}
                                    aspectRatio="16 / 9"
                                    onUpload={() => {
                                      setUploadPreFill({ mediaType: "episode", showTmdbId: String(showTmdbId), tmdbId: String(showTmdbId), seasonNumber: String(sn), episodeNumber: String(ep.episode_number), title: ep.name, themeId: activeThemeId });
                                      setUploadDrawerOpen(true);
                                    }}
                                  />
                              }
                            </Box>
                          );
                        })}
                      </EpisodeCardGrid>
                    </Stack>
                  )}
                  {/* Fallback: show existing episodes when TMDB data not yet loaded */}
                  {tmdbEps.length === 0 && !epData && (() => {
                    const existingEps = posters
                      .filter((p) => p.media.season_number === sn && p.media.type === "episode" && matchesTheme(p))
                      .sort((a, b) => (a.media.episode_number ?? 0) - (b.media.episode_number ?? 0));
                    if (existingEps.length === 0) return null;
                    return (
                      <Stack spacing={1}>
                        <SectionHeading label={t("episodesLabel")} />
                        <EpisodeCardGrid>
                          {existingEps.map((p) => (
                            <Box key={p.poster_id}>
                              <ExistingPosterCard p={p} />
                            </Box>
                          ))}
                        </EpisodeCardGrid>
                      </Stack>
                    );
                  })()}
                </Stack>
              </Collapse>
            </Box>
          );
        })}

        {/* Bottom action bar */}
        {(() => {
          const selectedPosters = existingPosters.filter((p) => selected.has(p.poster_id));
          const allPublished = selectedPosters.length > 0 && selectedPosters.every((p) => p.published !== false);
          const allDraft = selectedPosters.length > 0 && selectedPosters.every((p) => p.published === false);
          const currentThemeId = selectedPosters.length > 0 && selectedPosters.every((p) => p.media.theme_id === selectedPosters[0].media.theme_id)
            ? (selectedPosters[0].media.theme_id ?? null)
            : null;
          const selectableThemes = themes.filter((th) => th.theme_id !== currentThemeId);
          return (
            <Slide direction="up" in={selected.size > 0} mountOnEnter unmountOnExit>
              <Box sx={{ position: "fixed", bottom: 24, left: { xs: 0, md: 220 }, right: 0, zIndex: 1200, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <Paper
                elevation={8}
                sx={{
                  px: 2,
                  py: 1,
                  borderRadius: 3,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  pointerEvents: "auto",
                }}
              >
                <Typography variant="body2" sx={{ flex: 1, fontWeight: 700 }}>{selected.size} selected</Typography>
                {selectableThemes.length > 0 && (
                  <Select
                    size="small"
                    displayEmpty
                    value=""
                    onChange={(e) => { void handleMoveAllPosters([...selected], e.target.value || null); selectNone(); }}
                    sx={{ fontSize: "0.75rem", minWidth: 140 }}
                    renderValue={() => t("changeTheme")}
                  >
                    {selectableThemes.map((th) => <MenuItem key={th.theme_id} value={th.theme_id}>{th.name}</MenuItem>)}
                  </Select>
                )}
                <Button size="small" variant="outlined" color="warning" disabled={allDraft} onClick={() => void batchSetPublished(false)}>{t("setDraft")}</Button>
                <Button size="small" variant="contained" color="success" disabled={allPublished} onClick={() => void batchSetPublished(true)}>{t("publish")}</Button>
                <Button size="small" onClick={selectNone} sx={{ minWidth: 0, px: 1 }}>{tc("clear")}</Button>
              </Paper>
              </Box>
            </Slide>
          );
        })()}
      </Stack>
    );
  }

  function CollectionDetailView({ collectionTmdbId, posters, tmdbData, tmdbState }: { collectionTmdbId: number; posters: PosterEntry[]; tmdbData: TmdbCollection | null; tmdbState: "idle" | "loading" | "ok" | "error" }) {
    const [selected, setSelected] = useState<Set<string>>(new Set());

    function toggleSelect(posterId: string) {
      setSelected((prev) => {
        const next = new Set(prev);
        next.has(posterId) ? next.delete(posterId) : next.add(posterId);
        return next;
      });
    }

    // All poster IDs that exist (not placeholders) in this view, filtered to active theme
    const existingPosters = posters.filter((p) => p.media.type !== undefined && (activeThemeId === "" || p.media.theme_id === activeThemeId));
    const allIds = existingPosters.map((p) => p.poster_id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

    function selectAll() { setSelected(new Set(allIds)); }
    function selectNone() { setSelected(new Set()); }

    async function batchSetPublished(publish: boolean) {
      if (!conn || selected.size === 0) return;
      await Promise.all(
        [...selected].map((id) =>
          fetch(`${conn.nodeUrl}/v1/admin/posters/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${conn.adminToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ published: publish }),
          }).catch(() => undefined)
        )
      );
      setSelected(new Set());
      void loadData();
    }

    // Helper: does this poster belong to the active theme?
    // "" (Default theme) = posters with no theme_id; otherwise exact match.
    function matchesTheme(p: PosterEntry) {
      return activeThemeId === "" || p.media.theme_id === activeThemeId;
    }

    const collectionPosters = posters.filter((p) => p.media.type === "collection" && matchesTheme(p));

    // Backdrops: prefer those with collection_tmdb_id set, fall back to any backdrop
    // in allPosters whose tmdb_id matches the collection (legacy uploads).
    const backdropPosters = allPosters.filter(
      (p) => p.media.type === "backdrop" && !p.media.show_tmdb_id && matchesTheme(p) &&
        (p.media.collection_tmdb_id === collectionTmdbId || p.media.tmdb_id === collectionTmdbId)
    );

    // Cross-reference creator movie posters for the active theme only.
    const uploadedMoviesByTmdbId = new Map(
      allPosters
        .filter((p) => p.media.type === "movie" && p.media.tmdb_id != null && matchesTheme(p))
        .map((p) => [p.media.tmdb_id!, p])
    );

    const tmdbMovies = (tmdbData?.parts ?? []).sort((a, b) =>
      (a.release_date ?? "").localeCompare(b.release_date ?? "")
    );

    // Fallback when TMDB data unavailable: show creator movies that either belong
    // to this collection (via collection_tmdb_id) or have no collection set yet.
    const fallbackMoviePosters = allPosters
      .filter((p) => p.media.type === "movie" &&
        (p.media.collection_tmdb_id === collectionTmdbId || !p.media.collection_tmdb_id))
      .sort((a, b) => (a.media.year ?? 9999) - (b.media.year ?? 9999));

    function ExistingPosterCard({ p }: { p: PosterEntry }) {
      const published = p.published !== false;
      const isSelected = selected.has(p.poster_id);
      const statusChip = published
        ? { label: t("published"), color: "success" as const }
        : { label: t("draft"), color: "warning" as const };
      return (
        <Box sx={{ position: "relative" }}>
          <Box
            sx={{
              outline: isSelected ? "2px solid" : "none",
              outlineColor: "primary.main",
              borderRadius: 1,
              "& .select-checkbox": { opacity: isSelected ? 1 : 0 },
              "&:hover .select-checkbox": { opacity: 1 },
            }}
          >
            <PosterCard
              poster={p}
              actions={[{ label: tc("details"), href: `/p/${encodeURIComponent(p.poster_id)}` }]}
              aspectRatio={p.media.type === "backdrop" ? "16 / 9" : "2 / 3"}
              chip={statusChip}
            />
          </Box>
          {/* Checkbox — bottom-right, in the title strip area */}
          <Box className="select-checkbox" sx={{ position: "absolute", bottom: 4, right: 4, transition: "opacity 0.15s" }}>
            <Checkbox
              size="small"
              checked={isSelected}
              onChange={() => toggleSelect(p.poster_id)}
              onClick={(e) => e.stopPropagation()}
              sx={{ p: 0.25 }}
            />
          </Box>
          <Box sx={{ position: "absolute", top: 4, right: 4 }}>
            <PosterActionsMenu
              poster={p}
              themes={themes}
              onMove={(themeId) => void handleMovePoster(p.poster_id, themeId)}
              onDelete={() => void handleDeletePoster(p.poster_id)}
              onTogglePublished={() => void handleTogglePublished(p.poster_id, published)}
            />
          </Box>
        </Box>
      );
    }

    function PlaceholderCard({ movie, aspectRatio = "2 / 3", uploadMediaType = "movie" }: { movie: TmdbMovie; aspectRatio?: string; uploadMediaType?: string }) {
      const year = movie.release_date?.slice(0, 4) ?? "";
      const imgUrl = tmdbImageUrl(movie.poster_path);
      return (
        <Card sx={{ height: "100%", border: "1px dashed", borderColor: "divider" }}>
          <Box sx={{ position: "relative" }}>
            {imgUrl ? (
              <CardMedia component="img" image={imgUrl} alt={movie.title} sx={{ aspectRatio, objectFit: "cover", display: "block", filter: "grayscale(1)", opacity: 0.3 }} />
            ) : (
              <Box sx={{ aspectRatio, bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.55 }}>
                <Typography variant="caption" color="text.disabled">{movie.title}</Typography>
              </Box>
            )}
            <Chip
              label={t("missing")}
              size="small"
              color="error"
              sx={{ position: "absolute", top: 10, left: 0, fontWeight: 700, fontSize: "0.6rem", height: 20, borderRadius: "0 6px 6px 0", pointerEvents: "none" }}
            />
            <Box sx={{ position: "absolute", top: 4, right: 4 }}>
              <IconButton
                size="small"
                sx={{ bgcolor: "rgba(0,0,0,0.6)", color: "white", "&:hover": { bgcolor: "rgba(0,0,0,0.8)" } }}
                onClick={() => {
                  setUploadPreFill({ mediaType: uploadMediaType, tmdbId: String(movie.id), title: movie.title, year, collectionTmdbId: String(collectionTmdbId), themeId: activeThemeId });
                  setUploadDrawerOpen(true);
                }}
              >
                <FileUploadOutlinedIcon sx={{ fontSize: "0.85rem" }} />
              </IconButton>
            </Box>
          </Box>
          <Box sx={{ px: 1.5, pt: 0.75, pb: 0.5 }}>
            <Typography variant="caption" color="text.disabled" noWrap sx={{ display: "block" }}>
              {movie.title}{year ? ` (${year})` : ""}
            </Typography>
          </Box>
        </Card>
      );
    }

    function SectionHeading({ label }: { label: string }) {
      return (
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1, fontSize: "0.65rem", display: "block" }}>
          {label}
        </Typography>
      );
    }

    function CardGrid({ children }: { children: React.ReactNode }) {
      return (
        <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
          {children}
        </Box>
      );
    }

    function BackdropCardGrid({ children }: { children: React.ReactNode }) {
      return (
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {children}
        </Box>
      );
    }

    return (
      <Stack spacing={3}>
        {/* Select all / none row */}
        {allIds.length > 0 && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Checkbox
              size="small"
              checked={allSelected}
              indeterminate={selected.size > 0 && !allSelected}
              onChange={() => allSelected ? selectNone() : selectAll()}
              sx={{ p: 0 }}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ cursor: "pointer", "&:hover": { color: "text.primary" } }}
              onClick={() => allSelected ? selectNone() : selectAll()}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </Typography>
            {selected.size > 0 && (
              <Typography variant="caption" color="text.disabled">
                · {selected.size} selected
              </Typography>
            )}
          </Stack>
        )}

        {tmdbState === "error" && (
          <Alert severity="warning">
            TMDB data couldn&apos;t be loaded for collection ID <strong>{collectionTmdbId}</strong> — the ID on this poster may be wrong.
            Check <strong>themoviedb.org/collection/{collectionTmdbId}</strong> to verify, then re-upload with the correct ID.
          </Alert>
        )}

        {/* Collection poster */}
        <Stack spacing={1}>
          <SectionHeading label={t("sectionCollection")} />
          <CardGrid>
            {collectionPosters.length > 0
              ? collectionPosters.map((p) => (
                  <Box key={p.poster_id}>
                    <ExistingPosterCard p={p} />
                  </Box>
                ))
              : (
                  <Box>
                    <PlaceholderCard
                      movie={{
                        id: collectionTmdbId,
                        title: tmdbData?.name ?? "",
                        poster_path: tmdbData?.poster_path ?? null,
                      }}
                      uploadMediaType="collection"
                    />
                  </Box>
                )
            }
          </CardGrid>
        </Stack>

        {/* Movies — TMDB order with placeholders */}
        <Stack spacing={1}>
          {(() => {
            const movieIds = tmdbMovies.length > 0
              ? tmdbMovies.filter((m) => uploadedMoviesByTmdbId.has(m.id)).map((m) => uploadedMoviesByTmdbId.get(m.id)!.poster_id)
              : fallbackMoviePosters.map((p) => p.poster_id);
            const allMoviesSelected = movieIds.length > 0 && movieIds.every((id) => selected.has(id));
            const someMoviesSelected = movieIds.some((id) => selected.has(id));
            function toggleMovies() {
              setSelected((prev) => {
                const next = new Set(prev);
                if (allMoviesSelected) { movieIds.forEach((id) => next.delete(id)); }
                else { movieIds.forEach((id) => next.add(id)); }
                return next;
              });
            }
            return (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <SectionHeading label={t("movies")} />
                {movieIds.length > 0 && (
                  <Checkbox
                    size="small"
                    checked={allMoviesSelected}
                    indeterminate={someMoviesSelected && !allMoviesSelected}
                    onChange={toggleMovies}
                    sx={{ p: 0, ml: 0.5 }}
                  />
                )}
              </Stack>
            );
          })()}
          <CardGrid>
            {tmdbMovies.length > 0
              ? tmdbMovies.map((m) => (
                  <Box key={m.id}>
                    {uploadedMoviesByTmdbId.has(m.id)
                      ? <ExistingPosterCard p={uploadedMoviesByTmdbId.get(m.id)!} />
                      : <PlaceholderCard movie={m} />
                    }
                  </Box>
                ))
              : fallbackMoviePosters.map((p) => (
                  <Box key={p.poster_id}>
                    <ExistingPosterCard p={p} />
                  </Box>
                ))
            }
          </CardGrid>
        </Stack>

        {/* Backdrop — always shown so creators know it's a missing slot */}
        <Stack spacing={1}>
          <SectionHeading label={t("sectionBackdrop")} />
          <BackdropCardGrid>
            {backdropPosters.length > 0
              ? backdropPosters.map((p) => (
                  <Box key={p.poster_id}>
                    <ExistingPosterCard p={p} />
                  </Box>
                ))
              : (
                  <Box>
                    <PlaceholderCard
                      movie={{
                        id: collectionTmdbId,
                        title: tmdbData?.name ?? collectionPosters[0]?.media.title ?? "",
                        poster_path: tmdbData?.backdrop_path ?? null,
                      }}
                      aspectRatio="16 / 9"
                      uploadMediaType="backdrop"
                    />
                  </Box>
                )
            }
          </BackdropCardGrid>
        </Stack>

        {/* Bottom action bar — slides up when items are selected */}
        {(() => {
          const selectedPosters = existingPosters.filter((p) => selected.has(p.poster_id));
          const allPublished = selectedPosters.length > 0 && selectedPosters.every((p) => p.published !== false);
          const allDraft = selectedPosters.length > 0 && selectedPosters.every((p) => p.published === false);
          const currentThemeId = selectedPosters.length > 0 && selectedPosters.every((p) => p.media.theme_id === selectedPosters[0].media.theme_id)
            ? (selectedPosters[0].media.theme_id ?? null)
            : null;
          const selectableThemes = themes.filter((th) => th.theme_id !== currentThemeId);
          return (
            <Slide direction="up" in={selected.size > 0} mountOnEnter unmountOnExit>
              <Box sx={{ position: "fixed", bottom: 24, left: { xs: 0, md: 220 }, right: 0, zIndex: 1200, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <Paper
                elevation={8}
                sx={{
                  px: 2,
                  py: 1,
                  borderRadius: 3,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  pointerEvents: "auto",
                }}
              >
                <Typography variant="body2" sx={{ flex: 1, fontWeight: 700 }}>
                  {selected.size} selected
                </Typography>
                {selectableThemes.length > 0 && (
                  <Select
                    size="small"
                    displayEmpty
                    value=""
                    onChange={(e) => { void handleMoveAllPosters([...selected], e.target.value || null); selectNone(); }}
                    sx={{ fontSize: "0.75rem", minWidth: 140 }}
                    renderValue={() => t("changeTheme")}
                  >
                    {selectableThemes.map((th) => <MenuItem key={th.theme_id} value={th.theme_id}>{th.name}</MenuItem>)}
                  </Select>
                )}
                <Button size="small" variant="outlined" color="warning" disabled={allDraft} onClick={() => void batchSetPublished(false)}>
                  {t("setDraft")}
                </Button>
                <Button size="small" variant="contained" color="success" disabled={allPublished} onClick={() => void batchSetPublished(true)}>
                  {t("publish")}
                </Button>
                <Button size="small" onClick={selectNone} sx={{ minWidth: 0, px: 1 }}>
                  {tc("clear")}
                </Button>
              </Paper>
              </Box>
            </Slide>
          );
        })()}
      </Stack>
    );
  }

  function MovieDetailView({ movieTmdbId, title, posters, tmdbData, tmdbState }: {
    movieTmdbId: number;
    title: string;
    posters: PosterEntry[];
    tmdbData: import("@/lib/tmdb").TmdbMovieDetail | null;
    tmdbState: "idle" | "loading" | "ok" | "error";
  }) {
    const [selected, setSelected] = useState<Set<string>>(new Set());

    function toggleSelect(posterId: string) {
      setSelected((prev) => {
        const next = new Set(prev);
        next.has(posterId) ? next.delete(posterId) : next.add(posterId);
        return next;
      });
    }

    const existingPosters = posters.filter((p) => p.media.type !== undefined && (activeThemeId === "" || p.media.theme_id === activeThemeId));
    const allIds = existingPosters.map((p) => p.poster_id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

    function selectAll() { setSelected(new Set(allIds)); }
    function selectNone() { setSelected(new Set()); }

    const selectableThemes = themes.filter((th) => {
      if (selected.size === 0) return false;
      const selectedPosters = existingPosters.filter((p) => selected.has(p.poster_id));
      const currentThemeId = selectedPosters[0]?.media.theme_id ?? "";
      return selectedPosters.every((p) => (p.media.theme_id ?? "") === currentThemeId) ? th.theme_id !== currentThemeId : true;
    });

    const moviePosters = posters.filter((p) => p.media.type === "movie" && (activeThemeId === "" || p.media.theme_id === activeThemeId));
    const backdropPosters = allPosters.filter(
      (p) => p.media.type === "backdrop" && !p.media.show_tmdb_id && !p.media.collection_tmdb_id &&
        p.media.tmdb_id === movieTmdbId && (activeThemeId === "" || p.media.theme_id === activeThemeId)
    );

    const year = title.match(/\((\d{4})\)$/)?.[1] ?? "";
    const cleanTitle = title.replace(/\s*\(\d{4}\)$/, "");

    function MoviePlaceholder({ aspectRatio = "2 / 3", uploadType = "movie" }: { aspectRatio?: string; uploadType?: string }) {
      const imgUrl = tmdbData?.poster_path ? tmdbImageUrl(tmdbData.poster_path) : null;
      return (
        <Card sx={{ height: "100%", border: "1px dashed", borderColor: "divider" }}>
          <Box sx={{ position: "relative" }}>
            {imgUrl ? (
              <CardMedia component="img" image={imgUrl} alt={cleanTitle} sx={{ aspectRatio, objectFit: "cover", display: "block", filter: "grayscale(1)", opacity: 0.3 }} />
            ) : (
              <Box sx={{ aspectRatio, bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.55 }}>
                <Typography variant="caption" color="text.disabled">{cleanTitle}</Typography>
              </Box>
            )}
            <Chip
              label={t("missing")}
              size="small"
              color="error"
              sx={{ position: "absolute", top: 10, left: 0, fontWeight: 700, fontSize: "0.6rem", height: 20, borderRadius: "0 6px 6px 0", pointerEvents: "none" }}
            />
            <Box sx={{ position: "absolute", top: 4, right: 4 }}>
              <IconButton
                size="small"
                sx={{ bgcolor: "rgba(0,0,0,0.6)", color: "white", "&:hover": { bgcolor: "rgba(0,0,0,0.8)" } }}
                onClick={() => {
                  setUploadPreFill({ mediaType: uploadType, tmdbId: String(movieTmdbId), title: cleanTitle, year, themeId: activeThemeId });
                  setUploadDrawerOpen(true);
                }}
              >
                <FileUploadOutlinedIcon sx={{ fontSize: "0.85rem" }} />
              </IconButton>
            </Box>
          </Box>
          <Box sx={{ px: 1.5, pt: 0.75, pb: 0.5 }}>
            <Typography variant="caption" color="text.disabled" noWrap sx={{ display: "block" }}>
              {cleanTitle}{year ? ` (${year})` : ""}
            </Typography>
          </Box>
        </Card>
      );
    }

    return (
      <Stack spacing={3}>
        {/* Select all row — only when there are existing posters */}
        {existingPosters.length > 0 && (
          <Stack direction="row" alignItems="center" spacing={1}>
            <Checkbox
              size="small"
              checked={allSelected}
              indeterminate={selected.size > 0 && !allSelected}
              onChange={() => allSelected ? selectNone() : selectAll()}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ cursor: "pointer", "&:hover": { color: "text.primary" } }}
              onClick={() => allSelected ? selectNone() : selectAll()}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </Typography>
            {selected.size > 0 && (
              <Typography variant="caption" color="text.disabled">· {selected.size} selected</Typography>
            )}
          </Stack>
        )}

        {/* Movie poster */}
        <Stack spacing={1}>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1, fontSize: "0.65rem", display: "block" }}>{t("sectionPosters")}</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
            {moviePosters.length > 0
              ? moviePosters.map((p) => (
                  <Box key={p.poster_id}>
                    <Box sx={{ position: "relative" }}>
                      <Box sx={{ outline: selected.has(p.poster_id) ? "2px solid" : "none", outlineColor: "primary.main", borderRadius: 1, "& .select-checkbox": { opacity: selected.has(p.poster_id) ? 1 : 0 }, "&:hover .select-checkbox": { opacity: 1 } }}>
                        <PosterCard
                          poster={p}
                          actions={[{ label: tc("details"), href: `/p/${encodeURIComponent(p.poster_id)}` }]}
                          chip={p.published !== false ? { label: t("published"), color: "success" } : { label: t("draft"), color: "warning" }}
                        />
                      </Box>
                      <Box className="select-checkbox" sx={{ position: "absolute", bottom: 4, right: 4, transition: "opacity 0.15s" }}>
                        <Checkbox size="small" checked={selected.has(p.poster_id)} onChange={() => toggleSelect(p.poster_id)} onClick={(e) => e.stopPropagation()} sx={{ p: 0.25 }} />
                      </Box>
                      <Box sx={{ position: "absolute", top: 4, right: 4 }}>
                        <PosterActionsMenu poster={p} themes={themes} onMove={(themeId) => void handleMovePoster(p.poster_id, themeId)} onDelete={() => void handleDeletePoster(p.poster_id)} />
                      </Box>
                    </Box>
                  </Box>
                ))
              : tmdbState !== "loading" && (
                  <Box>
                    <MoviePlaceholder aspectRatio="2 / 3" uploadType="movie" />
                  </Box>
                )
            }
          </Box>
        </Stack>

        {/* Backdrop */}
        <Stack spacing={1}>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1, fontSize: "0.65rem", display: "block" }}>{t("sectionBackdrop")}</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
            {backdropPosters.length > 0
              ? backdropPosters.map((p) => (
                  <Box key={p.poster_id}>
                    <Box sx={{ position: "relative" }}>
                      <Box sx={{ outline: selected.has(p.poster_id) ? "2px solid" : "none", outlineColor: "primary.main", borderRadius: 1, "& .select-checkbox": { opacity: selected.has(p.poster_id) ? 1 : 0 }, "&:hover .select-checkbox": { opacity: 1 } }}>
                        <PosterCard
                          poster={p}
                          aspectRatio="16 / 9"
                          actions={[{ label: tc("details"), href: `/p/${encodeURIComponent(p.poster_id)}` }]}
                          chip={p.published !== false ? { label: t("published"), color: "success" } : { label: t("draft"), color: "warning" }}
                        />
                      </Box>
                      <Box className="select-checkbox" sx={{ position: "absolute", bottom: 4, right: 4, transition: "opacity 0.15s" }}>
                        <Checkbox size="small" checked={selected.has(p.poster_id)} onChange={() => toggleSelect(p.poster_id)} onClick={(e) => e.stopPropagation()} sx={{ p: 0.25 }} />
                      </Box>
                      <Box sx={{ position: "absolute", top: 4, right: 4 }}>
                        <PosterActionsMenu poster={p} themes={themes} onMove={(themeId) => void handleMovePoster(p.poster_id, themeId)} onDelete={() => void handleDeletePoster(p.poster_id)} />
                      </Box>
                    </Box>
                  </Box>
                ))
              : tmdbState !== "loading" && (
                  <Box>
                    <MoviePlaceholder aspectRatio="16 / 9" uploadType="backdrop" />
                  </Box>
                )
            }
          </Box>
        </Stack>

        {/* Bottom bar */}
        <Slide direction="up" in={selected.size > 0} mountOnEnter unmountOnExit>
          <Box sx={{ position: "fixed", bottom: 24, left: { xs: 0, md: 220 }, right: 0, zIndex: 1200, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
            <Paper elevation={8} sx={{ px: 2, py: 1, borderRadius: 3, display: "flex", alignItems: "center", gap: 1, pointerEvents: "auto" }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{selected.size} selected</Typography>
              {selectableThemes.length > 0 && (
                <Select
                  size="small"
                  value=""
                  displayEmpty
                  renderValue={() => t("changeTheme")}
                  onChange={(e) => { void handleMoveAllPosters([...selected], e.target.value as string); selectNone(); }}
                  sx={{ minWidth: 140 }}
                >
                  {selectableThemes.map((th) => (
                    <MenuItem key={th.theme_id} value={th.theme_id}>{th.name}</MenuItem>
                  ))}
                </Select>
              )}
              <Button size="small" variant="outlined" color="error" onClick={() => void Promise.all([...selected].map((id) => handleDeletePoster(id))).then(() => { selectNone(); void loadData(); })}>
                Delete selected
              </Button>
              <Button size="small" onClick={selectNone} sx={{ minWidth: 0, px: 1 }}>{tc("clear")}</Button>
            </Paper>
          </Box>
        </Slide>
      </Stack>
    );
  }

  function ThemeDetailView({ theme, collectionGroups, showGroups }: {
    theme: CreatorTheme | null;
    collectionGroups: MediaGroup[];
    showGroups: MediaGroup[];
  }) {

    return (
      <Stack spacing={3}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>{theme?.name}</Typography>
          <Tooltip title={t("editTheme")}>
            <IconButton size="small" onClick={() => { setEditingTheme(theme ?? null); setThemeModalOpen(true); }}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("deleteTheme")}>
            <IconButton size="small" color="error" onClick={() => theme && void handleDeleteTheme(theme.theme_id)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        {collectionGroups.length === 0 && showGroups.length === 0 && (
          <Typography color="text.secondary">{t("noPostersInTheme")}</Typography>
        )}
        {collectionGroups.length > 0 && (
          <Box>
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1, fontSize: "0.65rem", display: "block", mb: 1.5 }}>
              {t("movies")}
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
              {collectionGroups.map((g) => (
                <Box key={g.key}>
                  <CollectionCard group={toCollectionGroup(g)} onClick={() => setNav({ view: "media", mediaKey: g.key })} />
                </Box>
              ))}
            </Box>
          </Box>
        )}
        {showGroups.length > 0 && (
          <Box>
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1, fontSize: "0.65rem", display: "block", mb: 1.5 }}>
              {t("tv")}
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
              {showGroups.map((g) => (
                <Box key={g.key}>
                  <TVShowCard group={toTVShowGroup(g)} onClick={() => setNav({ view: "media", mediaKey: g.key })} />
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Stack>
    );
  }

  function ThemeCard({ theme, onClick }: { theme: CreatorTheme; onClick: () => void }) {
    const themePosters = postersForTheme(theme.theme_id);
    // One representative image per collection/show — no duplicates, no episode cards
    const groups = mediaGroupsForTheme(theme.theme_id);
    const previews: string[] = [];
    for (const g of groups) {
      if (previews.length >= 4) break;
      const gPosters = themePosters.filter((p) => {
        if (g.type === "collection") return p.media.collection_tmdb_id === g.tmdbId || (p.media.type === "collection" && p.media.tmdb_id === g.tmdbId);
        return p.media.show_tmdb_id === g.tmdbId || (p.media.type === "show" && p.media.tmdb_id === g.tmdbId);
      });
      const rep =
        gPosters.find((p) => p.media.type === "collection" || p.media.type === "show") ??
        (g.type === "collection"
          ? gPosters.find((p) => p.media.type === "movie")
          : gPosters.filter((p) => p.media.type === "season").sort((a, b) => (b.media.season_number ?? 0) - (a.media.season_number ?? 0))[0]);
      if (rep) previews.push(rep.assets.preview.url);
    }
    return (
      <Card sx={{ height: "100%" }}>
        <Box sx={{ position: "relative", cursor: "pointer" }} onClick={onClick}>
          {theme.cover_url ? (
            <Box component="img" src={theme.cover_url} alt={theme.name} sx={{ width: "100%", aspectRatio: "2 / 3", objectFit: "cover", display: "block" }} />
          ) : (
            <MosaicThumb urls={previews.length > 0 ? previews : []} alt={theme.name} />
          )}
          {(groups.some((g) => g.type === "collection") || groups.some((g) => g.type === "show")) && (
            <Box sx={{ position: "absolute", bottom: 8, right: 8, display: "flex", gap: 0.5, pointerEvents: "none" }}>
              {groups.filter((g) => g.type === "collection").length > 0 && (
                <CountBadge icon={<MovieOutlinedIcon sx={{ fontSize: "1rem" }} />} count={groups.filter((g) => g.type === "collection").length} tooltip={t("collectionCount", { count: groups.filter((g) => g.type === "collection").length })} />
              )}
              {groups.filter((g) => g.type === "show").length > 0 && (
                <CountBadge icon={<TvOutlinedIcon sx={{ fontSize: "1rem" }} />} count={groups.filter((g) => g.type === "show").length} tooltip={t("showCount", { count: groups.filter((g) => g.type === "show").length })} />
              )}
            </Box>
          )}
        </Box>
        <Box sx={{ px: 1.5, pt: 0.75, pb: 0.5, display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", fontWeight: 700 }}>{theme.name}</Typography>
          </Box>
          <Tooltip title={t("editTheme")}>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setEditingTheme(theme); setThemeModalOpen(true); }}>
              <EditOutlinedIcon sx={{ fontSize: "0.85rem" }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Card>
    );
  }

  function renderMain() {
    if (nav.view === "root") {
      return (
        <Stack spacing={3}>
          {themes.length === 0 && allPosters.length === 0 && (
            <Typography color="text.secondary">{t("noThemes")}</Typography>
          )}
          {themes.length > 0 && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>{t("byTheme")}</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                {themes.map((theme) => (
                  <Box key={theme.theme_id}>
                    <ThemeCard theme={theme} onClick={() => setNav({ view: "theme", themeId: theme.theme_id })} />
                  </Box>
                ))}
              </Box>
            </Box>
          )}
          {(sidebarCollections.length > 0 || sidebarMovies.length > 0) && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>{t("movies")}</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                {sidebarCollections.map((g) => (
                  <Box key={g.key}>
                    <CollectionCard group={toCollectionGroup(g)} onClick={() => setNav({ view: "media", mediaKey: g.key })} />
                  </Box>
                ))}
                {sidebarMovies.map((g) => {
                  const moviePoster = postersForMedia(g.key)[0];
                  const previewUrl = moviePoster?.assets.preview.url ?? null;
                  return (
                    <Box key={g.key}>
                      <Card sx={{ height: "100%", cursor: "pointer" }} onClick={() => setNav({ view: "media", mediaKey: g.key })}>
                        <Box sx={{ position: "relative", bgcolor: "action.hover" }}>
                          {previewUrl ? (
                            <Box component="img" src={previewUrl} alt={g.title} sx={{ width: "100%", aspectRatio: "2 / 3", objectFit: "cover", display: "block" }} />
                          ) : (
                            <Box sx={{ width: "100%", aspectRatio: "2 / 3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <MovieOutlinedIcon sx={{ fontSize: "3rem", color: "text.disabled" }} />
                            </Box>
                          )}
                        </Box>
                        <Box sx={{ px: 1.5, pt: 0.75, pb: 0.5 }}>
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{g.title}</Typography>
                        </Box>
                      </Card>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}
          {sidebarTvShows.length > 0 && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>{t("tv")}</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                {sidebarTvShows.map((g) => (
                  <Box key={g.key}>
                    <TVShowCard group={toTVShowGroup(g)} onClick={() => setNav({ view: "media", mediaKey: g.key })} />
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Stack>
      );
    }

    if (nav.view === "theme") {
      const theme = themes.find((th) => th.theme_id === nav.themeId);
      const groups = mediaGroupsForTheme(nav.themeId);
      const collectionGroups = groups.filter((g) => g.type === "collection");
      const showGroups = groups.filter((g) => g.type === "show");
      return <ThemeDetailView theme={theme ?? null} collectionGroups={collectionGroups} showGroups={showGroups} />;
    }

    if (nav.view === "media") {
      const posters = postersForMedia(nav.mediaKey);
      const group = sidebarCollections.find((g) => g.key === nav.mediaKey) ?? sidebarTvShows.find((g) => g.key === nav.mediaKey) ?? sidebarMovies.find((g) => g.key === nav.mediaKey) ?? mediaGroups.find((g) => g.key === nav.mediaKey);
      const heading = (
        <Typography variant="body2" color="text.secondary">
          {t("posterCount", { count: posters.length })}
          {group?.title ? ` · ${group.title}` : ""}
        </Typography>
      );
      if (group?.type === "show") {
        const showId = Number(nav.mediaKey.split(":")[1]);
        return (
          <TvShowDetailView showTmdbId={showId} posters={posters} tmdbData={tmdbTvShowData} tmdbState={tmdbTvShowState} />
        );
      }
      if (nav.mediaKey.startsWith("collection:")) {
        const collId = Number(nav.mediaKey.split(":")[1]);
        return (
          <CollectionDetailView collectionTmdbId={collId} posters={posters} tmdbData={tmdbCollectionData} tmdbState={tmdbCollectionState} />
        );
      }
      if (nav.mediaKey.startsWith("movie:")) {
        const movieId = Number(nav.mediaKey.split(":")[1]);
        return (
          <MovieDetailView movieTmdbId={movieId} title={group?.title ?? ""} posters={posters} tmdbData={tmdbMovieData} tmdbState={tmdbMovieState} />
        );
      }
      return (
        <Stack spacing={2}>
          {heading}
          <PosterGrid posters={posters} showThemeLabel />
        </Stack>
      );
    }

    return null;
  }

  // ─── No connection state ─────────────────────────────────────────────────

  if (!loading && !conn) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Alert severity="info">
          {tc("loading")} — Connect your node in{" "}
          <Link href="/settings">Settings</Link> to use the Studio.
        </Alert>
      </Container>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 64px)", overflow: "hidden" }}>
      {/* Sidebar */}
      <Box
        sx={{
          width: 220,
          flexShrink: 0,
          borderRight: 1,
          borderColor: "divider",
          pt: 2,
          display: { xs: "none", md: "block" },
          overflowY: "auto",
        }}
      >
        <List dense disablePadding>

          {/* ── Themes ── */}
          <ListItemButton onClick={() => toggleSection("themes")} sx={{ py: 0.5 }}>
            <ListItemText
              primary={t("themes")}
              slotProps={{ primary: { variant: "body2", fontWeight: 700, noWrap: true } }}
            />
            <IconButton
              size="small"
              edge="end"
              onClick={(e) => { e.stopPropagation(); setEditingTheme(null); setThemeModalOpen(true); }}
              sx={{ mr: 0 }}
              aria-label={t("newTheme")}
            >
              <AddIcon sx={{ fontSize: "0.85rem" }} />
            </IconButton>
            <ExpandMoreIcon sx={{ fontSize: "1rem", ml: 0.5, transition: "transform 0.2s", transform: expandedSections.has("themes") ? "rotate(180deg)" : "rotate(0deg)" }} />
          </ListItemButton>
          <Collapse in={expandedSections.has("themes")} timeout="auto">
            {themes.map((theme) => (
              <ListItemButton
                key={theme.theme_id}
                selected={nav.view === "theme" && nav.themeId === theme.theme_id}
                onClick={() => setNav({ view: "theme", themeId: theme.theme_id })}
                sx={{ pl: 3 }}
              >
                <LayersOutlinedIcon sx={{ fontSize: "0.85rem", mr: 1, color: "text.secondary", flexShrink: 0 }} />
                <ListItemText primary={theme.name} slotProps={{ primary: { variant: "body2", noWrap: true } }} />
              </ListItemButton>
            ))}
          </Collapse>

          <Divider sx={{ my: 0.5 }} />

          {/* ── Movies ── */}
          <ListItemButton onClick={() => toggleSection("movies")} sx={{ py: 0.5 }}>
            <ListItemText
              primary={t("movies")}
              slotProps={{ primary: { variant: "body2", fontWeight: 700, noWrap: true } }}
            />
            <IconButton
              size="small"
              edge="end"
              onClick={(e) => { e.stopPropagation(); setAddMovieOpen(true); }}
              sx={{ mr: 0 }}
              aria-label={t("addMovie")}
            >
              <AddIcon sx={{ fontSize: "0.85rem" }} />
            </IconButton>
            <ExpandMoreIcon sx={{ fontSize: "1rem", ml: 0.5, transition: "transform 0.2s", transform: expandedSections.has("movies") ? "rotate(180deg)" : "rotate(0deg)" }} />
          </ListItemButton>
          <Collapse in={expandedSections.has("movies")} timeout="auto">
            {sidebarCollections.length > 0 && (
              <Typography variant="overline" color="text.secondary" sx={{ fontSize: "0.6rem", display: "block", px: 2, pt: 1, pb: 0.25, lineHeight: 1 }}>
                Collections
              </Typography>
            )}
            {sidebarCollections.map((g) => {
              const tooltipLabel = g.posterCount > 0 ? t("deleteWithCount", { count: g.posterCount }) : t("remove");
              return (
                <ListItemButton
                  key={g.key}
                  selected={nav.view === "media" && nav.mediaKey === g.key}
                  onClick={() => setNav({ view: "media", mediaKey: g.key })}
                  sx={{ pl: 3, pr: 0.5, "& .remove-btn": { opacity: 0 }, "&:hover .remove-btn": { opacity: 1 } }}
                >
                  <MovieOutlinedIcon sx={{ fontSize: "0.85rem", mr: 1, color: "text.secondary", flexShrink: 0 }} />
                  <ListItemText primary={g.title} slotProps={{ primary: { variant: "body2", noWrap: true } }} />
                  <Tooltip title={tooltipLabel} placement="right">
                    <IconButton
                      className="remove-btn"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (g.posterCount > 0) {
                          setDeleteGroupConfirm({ group: g });
                        } else {
                          savePinnedCollections(pinnedCollections.filter((pc) => pc.tmdbId !== g.tmdbId));
                          if (nav.view === "media" && nav.mediaKey === g.key) setNav({ view: "root" });
                        }
                      }}
                      sx={{ p: 0.25, flexShrink: 0, transition: "opacity 0.15s" }}
                    >
                      <CloseIcon sx={{ fontSize: "0.75rem" }} />
                    </IconButton>
                  </Tooltip>
                </ListItemButton>
              );
            })}
            {sidebarMovies.length > 0 && (
              <Typography variant="overline" color="text.secondary" sx={{ fontSize: "0.6rem", display: "block", px: 2, pt: 1, pb: 0.25, lineHeight: 1 }}>
                Movies
              </Typography>
            )}
            {sidebarMovies.map((g) => {
              const tooltipLabel = g.posterCount > 0 ? t("deleteWithCount", { count: g.posterCount }) : t("remove");
              return (
                <ListItemButton
                  key={g.key}
                  selected={nav.view === "media" && nav.mediaKey === g.key}
                  onClick={() => setNav({ view: "media", mediaKey: g.key })}
                  sx={{ pl: 3, pr: 0.5, "& .remove-btn": { opacity: 0 }, "&:hover .remove-btn": { opacity: 1 } }}
                >
                  <MovieOutlinedIcon sx={{ fontSize: "0.85rem", mr: 1, color: "text.secondary", flexShrink: 0 }} />
                  <ListItemText primary={g.title} slotProps={{ primary: { variant: "body2", noWrap: true } }} />
                  <Tooltip title={tooltipLabel} placement="right">
                    <IconButton
                      className="remove-btn"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (g.posterCount > 0) {
                          setDeleteGroupConfirm({ group: g });
                        } else {
                          savePinnedMovies(pinnedMovies.filter((pm) => pm.tmdbId !== g.tmdbId));
                          if (nav.view === "media" && nav.mediaKey === g.key) setNav({ view: "root" });
                        }
                      }}
                      sx={{ p: 0.25, flexShrink: 0, transition: "opacity 0.15s" }}
                    >
                      <CloseIcon sx={{ fontSize: "0.75rem" }} />
                    </IconButton>
                  </Tooltip>
                </ListItemButton>
              );
            })}
            {standaloneMovieCount > 0 && sidebarMovies.length === 0 && sidebarCollections.length === 0 && (
              <ListItemButton
                selected={false}
                onClick={() => setNav({ view: "root" })}
                sx={{ pl: 3 }}
              >
                <MovieOutlinedIcon sx={{ fontSize: "0.85rem", mr: 1, color: "text.secondary", flexShrink: 0 }} />
                <ListItemText primary={t("notInCollection")} slotProps={{ primary: { variant: "body2", noWrap: true } }} />
              </ListItemButton>
            )}
          </Collapse>

          <Divider sx={{ my: 0.5 }} />

          {/* ── TV ── */}
          <ListItemButton onClick={() => toggleSection("tv")} sx={{ py: 0.5 }}>
            <ListItemText
              primary={t("tv")}
              slotProps={{ primary: { variant: "body2", fontWeight: 700, noWrap: true } }}
            />
            <IconButton
              size="small"
              edge="end"
              onClick={(e) => { e.stopPropagation(); setAddShowOpen(true); }}
              sx={{ mr: 0 }}
              aria-label={t("addShow")}
            >
              <AddIcon sx={{ fontSize: "0.85rem" }} />
            </IconButton>
            <ExpandMoreIcon sx={{ fontSize: "1rem", ml: 0.5, transition: "transform 0.2s", transform: expandedSections.has("tv") ? "rotate(180deg)" : "rotate(0deg)" }} />
          </ListItemButton>
          <Collapse in={expandedSections.has("tv")} timeout="auto">
            {orphanedTvCount > 0 && (
              <ListItemButton
                selected={false}
                onClick={() => setNav({ view: "root" })}
                sx={{ pl: 3 }}
              >
                <TvOutlinedIcon sx={{ fontSize: "0.85rem", mr: 1, color: "text.secondary", flexShrink: 0 }} />
                <ListItemText primary={t("notInBoxSet")} slotProps={{ primary: { variant: "body2", noWrap: true } }} />
              </ListItemButton>
            )}
            {sidebarTvShows.map((g) => {
              const tooltipLabel = g.posterCount > 0 ? t("deleteWithCount", { count: g.posterCount }) : t("remove");
              return (
                <ListItemButton
                  key={g.key}
                  selected={nav.view === "media" && nav.mediaKey === g.key}
                  onClick={() => setNav({ view: "media", mediaKey: g.key })}
                  sx={{ pl: 3, pr: 0.5, "& .remove-btn": { opacity: 0 }, "&:hover .remove-btn": { opacity: 1 } }}
                >
                  <TvOutlinedIcon sx={{ fontSize: "0.85rem", mr: 1, color: "text.secondary", flexShrink: 0 }} />
                  <ListItemText primary={g.title} slotProps={{ primary: { variant: "body2", noWrap: true } }} />
                  <Tooltip title={tooltipLabel} placement="right">
                    <IconButton
                      className="remove-btn"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (g.posterCount > 0) {
                          setDeleteGroupConfirm({ group: g });
                        } else {
                          savePinnedTvShows(pinnedTvShows.filter((ps) => ps.tmdbId !== g.tmdbId));
                          if (nav.view === "media" && nav.mediaKey === g.key) setNav({ view: "root" });
                        }
                      }}
                      sx={{ p: 0.25, flexShrink: 0, transition: "opacity 0.15s" }}
                    >
                      <CloseIcon sx={{ fontSize: "0.75rem" }} />
                    </IconButton>
                  </Tooltip>
                </ListItemButton>
              );
            })}
          </Collapse>

        </List>
      </Box>

      {/* Main content */}
      <Box sx={{ flex: 1, minWidth: 0, p: 3, overflowY: "auto" }}>
        {/* Toolbar */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, flex: 1 }}>{t("title")}</Typography>
          {themes.length > 0 && (
            <Select
              size="small"
              value={activeThemeId}
              onChange={(e) => setActiveThemeId(e.target.value)}
              sx={{ minWidth: 140, fontSize: "0.8rem" }}
            >
              {themes.map((th) => (
                <MenuItem key={th.theme_id} value={th.theme_id}>{th.name}</MenuItem>
              ))}
            </Select>
          )}
          <Button
            startIcon={<FileUploadOutlinedIcon />}
            size="small"
            onClick={() => { setUploadPreFill({ themeId: activeThemeId }); setUploadDrawerOpen(true); }}
          >
            {t("upload")}
          </Button>
        </Stack>

        <Breadcrumb />

        {loading ? (
          <Typography color="text.secondary">{tc("loading")}</Typography>
        ) : (
          renderMain()
        )}
      </Box>

      {/* Add collection dialog */}
      <Dialog open={addMovieOpen} onClose={closeAddMovie} maxWidth="xs" fullWidth>
        <DialogTitle>{t("addMovie")}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Stack direction="row" spacing={1}>
              <TextField
                label={t("searchByNameOrId")}
                value={addMovieInput}
                onChange={(e) => { setAddMovieInput(e.target.value); setAddMovieState("idle"); setAddMovieResult(null); setAddMovieResults([]); }}
                onKeyDown={(e) => { if (e.key === "Enter") void handleLookupMovie(); }}
                placeholder="e.g. Alien or 348"
                size="small"
                fullWidth
                autoFocus
              />
              <Button size="small" variant="outlined" onClick={() => void handleLookupMovie()} disabled={!addMovieInput.trim() || addMovieState === "loading"} sx={{ flexShrink: 0 }}>
                {tc("search")}
              </Button>
            </Stack>
            {addMovieState === "loading" && <Typography variant="body2" color="text.secondary">{tc("loading")}</Typography>}
            {addMovieState === "found" && addMovieResult && (
              addMovieResult.kind === "collection" ? (
                <Alert severity="info" sx={{ py: 0 }}>
                  {t("movieInCollection", { collection: addMovieResult.collectionName })}
                </Alert>
              ) : (
                <Alert severity="success" sx={{ py: 0 }}>
                  {addMovieResult.year ? `${addMovieResult.movieTitle} (${addMovieResult.year})` : addMovieResult.movieTitle}
                </Alert>
              )
            )}
            {addMovieState === "error" && <Alert severity="error" sx={{ py: 0 }}>{t("movieNotFound")}</Alert>}
            {addMovieState === "results" && (
              <Stack spacing={0.5}>
                {addMovieResults.map((r) => (
                  <Box
                    key={r.id}
                    onClick={() => void lookupMovieById(r.id)}
                    sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 0.75, borderRadius: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
                  >
                    <Box sx={{ width: 28, height: 42, flexShrink: 0, bgcolor: "action.hover", borderRadius: 0.5, overflow: "hidden" }}>
                      {r.poster_path && <Box component="img" src={tmdbImageUrl(r.poster_path) ?? ""} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                    </Box>
                    <Typography variant="body2" noWrap>{r.name}</Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAddMovie}>{tc("cancel")}</Button>
          <Button variant="contained" onClick={handleAddMovie} disabled={addMovieState !== "found"}>
            {addMovieResult?.kind === "collection" ? t("addCollection") : t("addMovie")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add TV show dialog */}
      <Dialog open={addShowOpen} onClose={closeAddShow} maxWidth="xs" fullWidth>
        <DialogTitle>{t("addShow")}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Stack direction="row" spacing={1}>
              <TextField
                label={t("searchByNameOrId")}
                value={addShowInput}
                onChange={(e) => { setAddShowInput(e.target.value); setAddShowLookup(null); setAddShowState("idle"); setAddShowResults([]); }}
                onKeyDown={(e) => { if (e.key === "Enter") void handleLookupShow(); }}
                placeholder="e.g. Breaking Bad or 1396"
                size="small"
                fullWidth
                autoFocus
              />
              <Button size="small" variant="outlined" onClick={() => void handleLookupShow()} disabled={!addShowInput.trim() || addShowState === "loading"} sx={{ flexShrink: 0 }}>
                {tc("search")}
              </Button>
            </Stack>
            {addShowState === "loading" && <Typography variant="body2" color="text.secondary">{tc("loading")}</Typography>}
            {addShowState === "found" && addShowLookup && <Alert severity="success" sx={{ py: 0 }}>{addShowLookup.title}</Alert>}
            {addShowState === "error" && <Alert severity="error" sx={{ py: 0 }}>{t("showNotFound")}</Alert>}
            {addShowState === "results" && (
              <Stack spacing={0.5}>
                {addShowResults.map((r) => {
                  const year = r.first_air_date?.slice(0, 4);
                  const title = year ? `${r.name} (${year})` : r.name;
                  return (
                    <Box
                      key={r.id}
                      onClick={() => { setAddShowLookup({ tmdbId: r.id, title }); setAddShowState("found"); }}
                      sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 0.75, borderRadius: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
                    >
                      <Box sx={{ width: 28, height: 42, flexShrink: 0, bgcolor: "action.hover", borderRadius: 0.5, overflow: "hidden" }}>
                        {r.poster_path && <Box component="img" src={tmdbImageUrl(r.poster_path) ?? ""} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                      </Box>
                      <Typography variant="body2" noWrap>{title}</Typography>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAddShow}>{tc("cancel")}</Button>
          <Button variant="contained" onClick={handleAddShow} disabled={addShowState !== "found"}>{t("addShow")}</Button>
        </DialogActions>
      </Dialog>

      {/* Delete media group confirmation dialog */}
      <Dialog open={!!deleteGroupConfirm} onClose={() => setDeleteGroupConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("deleteGroupTitle")}</DialogTitle>
        <DialogContent>
          <Typography>
            {t("deleteGroupBody", { title: deleteGroupConfirm?.group.title ?? "", count: deleteGroupConfirm?.group.posterCount ?? 0 })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteGroupConfirm(null)}>{tc("cancel")}</Button>
          <Button variant="contained" color="error" onClick={() => deleteGroupConfirm && void handleDeleteMediaGroup(deleteGroupConfirm.group)}>
            {t("deleteGroupConfirm")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload drawer */}
      <UploadDrawer
        open={uploadDrawerOpen}
        onClose={() => setUploadDrawerOpen(false)}
        onUploaded={() => { void loadData(); }}
        themes={themes}
        conn={conn}
        preFill={uploadPreFill}
      />

      {/* Theme modal */}
      {themeModalOpen && conn && (
        <ThemeModal
          open={themeModalOpen}
          theme={editingTheme}
          nodeUrl={conn.nodeUrl}
          adminToken={conn.adminToken}
          creatorId={conn.creatorId}
          onClose={() => setThemeModalOpen(false)}
          onSaved={() => { void refreshThemes(); setThemeModalOpen(false); }}
        />
      )}
    </Box>
  );
}
