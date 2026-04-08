"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import InputBase from "@mui/material/InputBase";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import AppsIcon from "@mui/icons-material/Apps";
import CollectionsBookmarkOutlinedIcon from "@mui/icons-material/CollectionsBookmarkOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HomeIcon from "@mui/icons-material/Home";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import SearchIcon from "@mui/icons-material/Search";
import TvOutlinedIcon from "@mui/icons-material/TvOutlined";
import ViewCarouselOutlinedIcon from "@mui/icons-material/ViewCarouselOutlined";

import PosterCard from "@/components/PosterCard";
import { INDEXER_BASE_URL } from "@/lib/config";
import { POSTER_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";
import type { PosterEntry } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type NavType = "all" | "collection" | "movie" | "show" | "episode";
type TmdbGenre = { id: number; name: string };
type StatsResponse = { posters: number; nodes: { total: number; up: number } };

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_TYPES = new Set<NavType>(["all", "collection", "movie", "show", "episode"]);

const TYPE_SEARCH_PARAM: Partial<Record<NavType, string>> = {
  collection: "collection",
  movie: "movie",
  show: "show",
  episode: "episode",
};

const TYPE_LABEL_KEY: Record<NavType, string> = {
  all: "allArtwork",
  collection: "collections",
  movie: "movies",
  show: "tvShows",
  episode: "episodeCards",
};

const TYPE_ICONS: Record<NavType, React.ReactNode> = {
  all: <AppsIcon fontSize="small" />,
  collection: <CollectionsBookmarkOutlinedIcon fontSize="small" />,
  movie: <MovieOutlinedIcon fontSize="small" />,
  show: <TvOutlinedIcon fontSize="small" />,
  episode: <ViewCarouselOutlinedIcon fontSize="small" />,
};

const NAV_TYPES: NavType[] = ["all", "collection", "movie", "show", "episode"];

// ─── Shared styles ────────────────────────────────────────────────────────────

const CHECKERBOARD_SX = {
  position: "absolute" as const,
  inset: 0,
  opacity: 0.08,
  pointerEvents: "none" as const,
  zIndex: 0,
  backgroundImage: (theme: { palette: { mode: string } }) => {
    const c = theme.palette.mode === "dark" ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.30)";
    return `linear-gradient(45deg, ${c} 25%, transparent 25%, transparent 75%, ${c} 75%), linear-gradient(45deg, ${c} 25%, transparent 25%, transparent 75%, ${c} 75%)`;
  },
  backgroundSize: "200px 200px",
  backgroundPosition: "0 0, 100px 100px",
};

const GLASS_TOOLBAR_SX = {
  backgroundColor: (theme: { palette: { mode: string } }) =>
    theme.palette.mode === "light" ? "rgba(255,255,255,0.5)" : "rgba(18,18,20,0.5)",
  backdropFilter: "blur(16px) saturate(150%)",
  borderBottom: "1px solid",
  borderColor: "divider",
  boxShadow: (theme: { palette: { mode: string } }) =>
    theme.palette.mode === "light"
      ? "inset 0 1px 0 rgba(255,255,255,0.55), 0 1px 0 rgba(15,23,42,0.08)"
      : "inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 0 rgba(0,0,0,0.3)",
};

const GLASS_SIDEBAR_SX = {
  backgroundColor: (theme: { palette: { mode: string } }) =>
    theme.palette.mode === "light" ? "rgba(255,255,255,0.1)" : "rgba(18,18,20,0.1)",
  backdropFilter: "blur(16px) saturate(150%)",
};

// ─── BrowseContent (needs Suspense wrapper for useSearchParams) ───────────────

function BrowseContent() {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Initialise state from URL ──
  const initialType = (() => {
    const raw = searchParams.get("type") ?? "all";
    return VALID_TYPES.has(raw as NavType) ? (raw as NavType) : "all";
  })();
  const initialQuery = searchParams.get("q") ?? "";

  const [navType, setNavType] = useState<NavType>(initialType);
  const [selectedGenre, setSelectedGenre] = useState<TmdbGenre | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  const [posters, setPosters] = useState<PosterEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [genres, setGenres] = useState<TmdbGenre[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sync state → URL (replace so filter changes don't clog history) ──
  useEffect(() => {
    const params = new URLSearchParams();
    if (navType !== "all") params.set("type", navType);
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }, [navType, debouncedQuery, router]);

  // ── Debounce search input ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  // ── Build indexer search URL ──
  const buildUrl = useCallback((cur?: string | null) => {
    const base = INDEXER_BASE_URL.replace(/\/+$/, "");
    const u = new URL(`${base}/v1/search`);
    const typeParam = TYPE_SEARCH_PARAM[navType];
    if (typeParam) u.searchParams.set("type", typeParam);
    if (debouncedQuery.trim()) u.searchParams.set("q", debouncedQuery.trim());
    u.searchParams.set("limit", "40");
    if (cur) u.searchParams.set("cursor", cur);
    return u.toString();
  }, [navType, debouncedQuery]);

  // ── Load first page when filter changes ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPosters([]);
    setCursor(null);
    fetch(buildUrl())
      .then((r) => r.json())
      .then((data: { results?: PosterEntry[]; next_cursor?: string | null }) => {
        if (cancelled) return;
        setPosters(data.results ?? []);
        setCursor(data.next_cursor ?? null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [buildUrl]);

  // ── Load more ──
  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetch(buildUrl(cursor)).then((r) => r.json()) as { results?: PosterEntry[]; next_cursor?: string | null };
      setPosters((prev) => [...prev, ...(data.results ?? [])]);
      setCursor(data.next_cursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }

  // ── Load genres + stats on mount ──
  useEffect(() => {
    fetch("/api/tmdb/genres")
      .then((r) => r.json())
      .then((d: { genres?: TmdbGenre[] }) => setGenres(d.genres ?? []))
      .catch(() => {});

    const base = INDEXER_BASE_URL.replace(/\/+$/, "");
    fetch(`${base}/v1/stats`)
      .then((r) => r.json())
      .then((d: StatsResponse) => setStats(d))
      .catch(() => {});
  }, []);

  // ── Nav helpers ──
  function selectType(type: NavType) {
    setNavType(type);
    setSelectedGenre(null);
    setSearchQuery("");
  }

  function goHome() {
    selectType("all");
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 64px)",
        overflow: "hidden",
        overscrollBehaviorY: "none",
      }}
    >
      {/* Checkerboard background */}
      <Box sx={CHECKERBOARD_SX} />

      {/* Main layout */}
      <Box sx={{ position: "relative", zIndex: 1, flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── Left sidebar ── */}
        <Box
          component="nav"
          sx={{
            width: 220,
            flexShrink: 0,
            display: { xs: "none", md: "flex" },
            flexDirection: "column",
            borderRight: 1,
            borderColor: "divider",
            overflowY: "auto",
            zIndex: 2,
            ...GLASS_SIDEBAR_SX,
          }}
        >
          <Box sx={{ pt: "5px" }} />

          {/* ARTWORK TYPES */}
          <Accordion
            defaultExpanded
            disableGutters
            elevation={0}
            square
            sx={{ bgcolor: "transparent", "&:before": { display: "none" }, borderBottom: 1, borderColor: "divider" }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ fontSize: "1rem" }} />}
              sx={{ minHeight: 36, px: 2, "& .MuiAccordionSummary-content": { my: 0.5 } }}
            >
              <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}>
                {t("artworkTypes")}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0, pb: 1 }}>
              <List dense disablePadding>
                {NAV_TYPES.map((type) => {
                  const isActive = navType === type && !selectedGenre;
                  return (
                    <ListItem key={type} disablePadding>
                      <ListItemButton
                        selected={isActive}
                        onClick={() => selectType(type)}
                        sx={{ borderRadius: 1, mx: 0.5, px: 1 }}
                      >
                        <ListItemIcon sx={{ minWidth: 32, color: isActive ? "primary.main" : "text.secondary" }}>
                          {TYPE_ICONS[type]}
                        </ListItemIcon>
                        <ListItemText
                          primary={t(TYPE_LABEL_KEY[type] as Parameters<typeof t>[0])}
                          primaryTypographyProps={{ variant: "body2", fontWeight: isActive ? 700 : 400, noWrap: true }}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            </AccordionDetails>
          </Accordion>

          {/* GENRES — non-interactive pending indexer genre support */}
          <Accordion
            defaultExpanded
            disableGutters
            elevation={0}
            square
            sx={{ bgcolor: "transparent", "&:before": { display: "none" } }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ fontSize: "1rem" }} />}
              sx={{ minHeight: 36, px: 2, "& .MuiAccordionSummary-content": { my: 0.5, alignItems: "center", gap: 1 } }}
            >
              <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}>
                {t("genres")}
              </Typography>
              <Chip
                label={t("comingSoon")}
                size="small"
                sx={{ height: 15, fontSize: "0.55rem", fontWeight: 800, letterSpacing: "0.06em", px: 0.25 }}
              />
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0, pb: 1 }}>
              {genres.length === 0 ? (
                <Typography variant="caption" color="text.disabled" sx={{ px: 2, display: "block" }}>
                  {t("genresUnavailable")}
                </Typography>
              ) : (
                <Tooltip title={t("genresComingSoonTooltip")} placement="right" arrow>
                  <List dense disablePadding>
                    {genres.map((genre) => (
                      <ListItem key={genre.id} disablePadding>
                        <ListItemButton disabled sx={{ borderRadius: 1, mx: 0.5, px: 1, py: 0.25 }}>
                          <ListItemText
                            primary={genre.name}
                            primaryTypographyProps={{ variant: "body2", noWrap: true }}
                          />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Tooltip>
              )}
            </AccordionDetails>
          </Accordion>

          {/* Sidebar footer */}
          {stats && (
            <Box sx={{ mt: "auto", px: 2, py: 1.5, borderTop: 1, borderColor: "divider" }}>
              <Typography variant="caption" color="text.disabled" sx={{ display: "block", lineHeight: 1.6 }}>
                {stats.posters.toLocaleString()} {t("totalPostersLabel")}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ display: "block", lineHeight: 1.6 }}>
                {stats.nodes.up}/{stats.nodes.total} {t("nodesLabel")}
              </Typography>
            </Box>
          )}
        </Box>

        {/* ── Main content ── */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Toolbar */}
          <Box sx={{ flexShrink: 0, ...GLASS_TOOLBAR_SX }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 2, minHeight: 48 }}>

              {/* Breadcrumbs */}
              <Breadcrumbs
                separator={<NavigateNextIcon sx={{ fontSize: "0.9rem" }} />}
                sx={{ flex: 1, "& .MuiBreadcrumbs-ol": { flexWrap: "nowrap" } }}
              >
                <Box
                  component="button"
                  onClick={goHome}
                  aria-label={t("allArtwork")}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    p: 0,
                    color: navType === "all" && !selectedGenre ? "text.primary" : "text.secondary",
                    "&:hover": { color: "text.primary" },
                    transition: "color 0.15s",
                  }}
                >
                  <HomeIcon sx={{ fontSize: "1.1rem" }} />
                </Box>

                {navType !== "all" && (
                  <Typography variant="body2" fontWeight={600} color="text.primary" noWrap>
                    {t(TYPE_LABEL_KEY[navType] as Parameters<typeof t>[0])}
                  </Typography>
                )}

                {selectedGenre && (
                  <Typography variant="body2" fontWeight={600} color="text.primary" noWrap>
                    {selectedGenre.name}
                  </Typography>
                )}
              </Breadcrumbs>

              {/* Search */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1.5,
                  px: 1.25,
                  py: 0.5,
                  minWidth: { xs: 140, sm: 220 },
                }}
              >
                <SearchIcon sx={{ fontSize: "1rem", color: "text.disabled", flexShrink: 0 }} />
                <InputBase
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  sx={{ flex: 1, fontSize: "0.85rem", "& input": { p: 0 } }}
                  inputProps={{ "aria-label": t("searchPlaceholder") }}
                />
              </Box>
            </Box>
          </Box>

          {/* Poster grid */}
          <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}>
                <CircularProgress />
              </Box>
            ) : posters.length === 0 ? (
              <Typography color="text.secondary" sx={{ pt: 6, textAlign: "center" }}>
                {tc("noPostersFound")}
              </Typography>
            ) : (
              <>
                <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                  {posters.map((p) => (
                    <PosterCard
                      key={p.poster_id}
                      poster={p}
                      onClick={() => router.push(`/p/${encodeURIComponent(p.poster_id)}`)}
                    />
                  ))}
                </Box>

                <Box sx={{ pt: 3, pb: 1, display: "flex", justifyContent: "center" }}>
                  {cursor ? (
                    <Button variant="outlined" size="small" onClick={() => void loadMore()} disabled={loadingMore}>
                      {loadingMore ? tc("loadingMore") : tc("loadMore")}
                    </Button>
                  ) : (
                    <Typography variant="body2" color="text.secondary">{tc("endOfList")}</Typography>
                  )}
                </Box>
              </>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Page export — Suspense required for useSearchParams in App Router ─────────

export default function Home() {
  return (
    <Suspense>
      <BrowseContent />
    </Suspense>
  );
}
