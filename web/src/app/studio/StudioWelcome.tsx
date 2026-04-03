"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import ImageIcon from "@mui/icons-material/Image";
import MoreVertIcon from "@mui/icons-material/MoreVert";

import CardTitleStrip from "@/components/CardTitleStrip";
import { fetchTmdbMovie } from "@/lib/tmdb";
import { POSTER_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";

type TmdbTrendingItem = {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
};

export type TrendingActions = {
  pinnedCollections: { tmdbId: number; title: string }[];
  pinnedMovies: { tmdbId: number; title: string }[];
  pinnedTvShows: { tmdbId: number; title: string }[];
  onAddCollection: (id: number, title: string) => void;
  onAddMovie: (id: number, title: string) => void;
  onAddShow: (id: number, title: string) => void;
  onNavigate: (mediaKey: string) => void;
};

// ─── TrendingCardMenu ──────────────────────────────────────────────────────────
// Defined at module level — never inside a parent component.

type MovieResolution =
  | { kind: "collection"; collectionId: number; collectionName: string }
  | { kind: "standalone" };

function TrendingCardMenu({ tmdbId, mediaType, title, year, actions }: {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  year: string;
  actions: TrendingActions;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [movieRes, setMovieRes] = useState<MovieResolution | null>(null);
  const [loading, setLoading] = useState(false);

  function handleOpen(e: React.MouseEvent<HTMLElement>) {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
    if (mediaType === "movie" && !movieRes && !loading) {
      setLoading(true);
      fetchTmdbMovie(tmdbId)
        .then((data) => {
          if (data?.belongs_to_collection?.id) {
            setMovieRes({ kind: "collection", collectionId: data.belongs_to_collection.id, collectionName: data.belongs_to_collection.name });
          } else {
            setMovieRes({ kind: "standalone" });
          }
        })
        .catch(() => setMovieRes({ kind: "standalone" }))
        .finally(() => setLoading(false));
    }
  }

  function handleClose() { setAnchorEl(null); }

  let menuLabel: string | null = null;
  let menuAction: (() => void) | null = null;

  if (mediaType === "tv") {
    menuLabel = "Add TV show to My Studio";
    menuAction = () => { actions.onAddShow(tmdbId, title); handleClose(); };
  } else if (movieRes) {
    if (movieRes.kind === "collection") {
      const alreadyPinned = actions.pinnedCollections.some((c) => c.tmdbId === movieRes.collectionId);
      if (alreadyPinned) {
        menuLabel = "View collection in Studio";
        menuAction = () => { actions.onNavigate(`collection:${movieRes.collectionId}`); handleClose(); };
      } else {
        menuLabel = "Add collection to My Studio";
        menuAction = () => { actions.onAddCollection(movieRes.collectionId, movieRes.collectionName); handleClose(); };
      }
    } else {
      const alreadyPinned = actions.pinnedMovies.some((m) => m.tmdbId === tmdbId);
      if (alreadyPinned) {
        menuLabel = "View in Studio";
        menuAction = () => { actions.onNavigate(`movie:${tmdbId}`); handleClose(); };
      } else {
        menuLabel = "Add movie to My Studio";
        menuAction = () => { actions.onAddMovie(tmdbId, year ? `${title} (${year})` : title); handleClose(); };
      }
    }
  }

  return (
    <>
      <IconButton
        size="small"
        onClick={handleOpen}
        sx={{
          position: "absolute", top: 4, right: 4,
          bgcolor: "rgba(0,0,0,0.55)", color: "common.white",
          "&:hover": { bgcolor: "rgba(0,0,0,0.8)" },
          width: 28, height: 28,
        }}
      >
        <MoreVertIcon sx={{ fontSize: "1rem" }} />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
        {loading ? (
          <MenuItem disabled>
            <CircularProgress size={14} sx={{ mr: 1 }} /> Loading…
          </MenuItem>
        ) : menuLabel ? (
          <MenuItem onClick={menuAction ?? undefined}>{menuLabel}</MenuItem>
        ) : null}
      </Menu>
    </>
  );
}

// ─── TrendingCard ─────────────────────────────────────────────────────────────

function TrendingCard({ item, mediaType, actions }: {
  item: TmdbTrendingItem;
  mediaType: "movie" | "tv";
  actions?: TrendingActions;
}) {
  const label = item.title ?? item.name ?? "";
  const year = (item.release_date ?? item.first_air_date ?? "").slice(0, 4);
  const imgUrl = item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null;

  // Determine if this item is already in Studio (card-level check, no fetch)
  let inStudioKey: string | null = null;
  if (actions) {
    if (mediaType === "tv" && actions.pinnedTvShows.some((s) => s.tmdbId === item.id)) {
      inStudioKey = `show:${item.id}`;
    } else if (mediaType === "movie" && actions.pinnedMovies.some((m) => m.tmdbId === item.id)) {
      inStudioKey = `movie:${item.id}`;
    }
  }

  const imageArea = (
    <Box sx={{ position: "relative", aspectRatio: "2/3", overflow: "hidden", bgcolor: "transparent" }}>
      {imgUrl ? (
        <Box
          component="img"
          src={imgUrl}
          alt={label}
          sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ImageIcon sx={{ fontSize: "3rem", color: "text.disabled" }} />
        </Box>
      )}
      {actions && !inStudioKey && (
        <TrendingCardMenu tmdbId={item.id} mediaType={mediaType} title={label} year={year} actions={actions} />
      )}
    </Box>
  );

  if (inStudioKey) {
    return (
      <Tooltip title="View in Studio" placement="top">
        <Box sx={{ cursor: "pointer" }} onClick={() => actions!.onNavigate(inStudioKey!)}>
          {imageArea}
          <CardTitleStrip title={label} subtitle={year || undefined} />
        </Box>
      </Tooltip>
    );
  }

  return (
    <Box>
      {imageArea}
      <CardTitleStrip title={label} subtitle={year || undefined} />
    </Box>
  );
}

// ─── TrendingGrid ─────────────────────────────────────────────────────────────

function TrendingGrid({ items, loading, mediaType, actions }: {
  items: TmdbTrendingItem[];
  loading: boolean;
  mediaType: "movie" | "tv";
  actions?: TrendingActions;
}) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
      {loading
        ? Array.from({ length: 20 }).map((_, i) => (
            <Box key={i}>
              <Skeleton variant="rectangular" sx={{ aspectRatio: "2/3", width: "100%", borderRadius: 1 }} />
              <Skeleton variant="text" sx={{ mt: 0.75, width: "70%" }} />
            </Box>
          ))
        : items.slice(0, 20).map((item) => (
            <TrendingCard key={item.id} item={item} mediaType={mediaType} actions={actions} />
          ))
      }
    </Box>
  );
}

// ─── StudioWelcome ────────────────────────────────────────────────────────────

type StudioHomeStats = {
  creatorHandle?: string;
  collectionCount?: number;
  movieCount?: number;
  tvShowCount?: number;
  seasonCount?: number;
  episodeCount?: number;
  trendingActions?: TrendingActions;
};

export default function StudioWelcome({
  showHero = true,
  sessionExpired = false,
  ...stats
}: { showHero?: boolean; sessionExpired?: boolean } & StudioHomeStats) {
  const t = useTranslations("studio");
  const [movies, setMovies] = useState<TmdbTrendingItem[]>([]);
  const [tvShows, setTvShows] = useState<TmdbTrendingItem[]>([]);
  const [moviesLoading, setMoviesLoading] = useState(true);
  const [tvLoading, setTvLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tmdb/trending/movies")
      .then((r) => r.json())
      .then((d: { results?: TmdbTrendingItem[] }) => setMovies(d.results ?? []))
      .catch(() => undefined)
      .finally(() => setMoviesLoading(false));

    fetch("/api/tmdb/trending/tv")
      .then((r) => r.json())
      .then((d: { results?: TmdbTrendingItem[] }) => setTvShows(d.results ?? []))
      .catch(() => undefined)
      .finally(() => setTvLoading(false));
  }, []);

  // Compact mode: used as the Studio home screen when a node is connected.
  if (!showHero) {
    const { creatorHandle, collectionCount = 0, movieCount = 0, tvShowCount = 0, seasonCount = 0, episodeCount = 0, trendingActions } = stats;
    const statItems = [
      { value: collectionCount, label: t("statCollections", { count: collectionCount }) },
      { value: movieCount,      label: t("statMovies",      { count: movieCount })      },
      { value: tvShowCount,     label: t("statTvShows",     { count: tvShowCount })     },
      { value: seasonCount,     label: t("statSeasons",     { count: seasonCount })     },
      { value: episodeCount,    label: t("statEpisodes",    { count: episodeCount })    },
    ];
    return (
      <Box sx={{ pb: 4 }}>
        {/* Welcome header + stat boxes */}
        <Box sx={{ textAlign: "center", mb: 4 }}>
          <Typography variant="h4" fontWeight={900} sx={{ mb: 3 }}>
            {creatorHandle ? t("welcomeBack", { name: creatorHandle }) : t("welcomeToStudio")}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            {t("rightNowPublished")}
          </Typography>
          <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap>
            {statItems.map((s) => (
              <Box
                key={s.label}
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 2,
                  px: 3,
                  py: 1.5,
                  minWidth: 90,
                  textAlign: "center",
                }}
              >
                <Typography variant="h5" fontWeight={800} lineHeight={1}>{s.value}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{s.label}</Typography>
              </Box>
            ))}
          </Stack>
          {statItems.some((s) => s.value > 0) && (
            <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
              {t("toTheNetwork")}
            </Typography>
          )}
        </Box>

        <Divider sx={{ mb: 3 }} />

        <Typography variant="h5" fontWeight={800} sx={{ mb: 2 }}>
          {t("trendingMovies")}
        </Typography>
        <TrendingGrid items={movies} loading={moviesLoading} mediaType="movie" actions={trendingActions} />
        <Typography variant="h5" fontWeight={800} sx={{ mt: 4, mb: 2 }}>
          {t("trendingTvShows")}
        </Typography>
        <TrendingGrid items={tvShows} loading={tvLoading} mediaType="tv" actions={trendingActions} />
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: "background.default", pb: 10 }}>
      {sessionExpired && (
        <Container maxWidth="md" sx={{ pt: 4 }}>
          <Alert severity="warning">
            {t("sessionExpiredAlert")}
          </Alert>
        </Container>
      )}
      {/* Hero */}
      <Container maxWidth="md" sx={{ pt: sessionExpired ? 4 : 8, pb: 6, textAlign: "center" }}>
        <Box
          component="img"
          src="/op-logo-small.svg"
          alt="OpenPoster"
          sx={{ width: 72, height: 72, mb: 3 }}
        />
        <Typography variant="h3" fontWeight={900} gutterBottom>
          {t("welcomeToStudio")}
        </Typography>
        <Typography
          variant="h6"
          color="text.secondary"
          sx={{ maxWidth: 560, mx: "auto", mb: 4, fontWeight: 400 }}
        >
          {t("heroTagline")}
        </Typography>
        <Button variant="contained" size="large" component={Link} href="/settings">
          {t("connectYourNode")}
        </Button>
      </Container>

      {/* Trending movies */}
      <Container maxWidth="xl" sx={{ pb: 6 }}>
        <Typography variant="h5" fontWeight={800} sx={{ mb: 2 }}>
          {t("trendingMovies")}
        </Typography>
        <TrendingGrid items={movies} loading={moviesLoading} mediaType="movie" />
      </Container>

      {/* Trending TV */}
      <Container maxWidth="xl" sx={{ pb: 4 }}>
        <Typography variant="h5" fontWeight={800} sx={{ mb: 2 }}>
          {t("trendingTvShows")}
        </Typography>
        <TrendingGrid items={tvShows} loading={tvLoading} mediaType="tv" />
      </Container>
    </Box>
  );
}
