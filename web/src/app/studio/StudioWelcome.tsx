"use client";

import { useMemo, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import ImageIcon from "@mui/icons-material/Image";

import ArtworkCardFrame from "@/components/ArtworkCardFrame";
import { CardMenuButton, type CardMenuItem } from "@/components/MediaCard";
import { POSTER_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";

type TmdbTrendingItem = {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  belongs_to_collection?: {
    id: number;
    name: string;
  } | null;
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

function TrendingCardMenu({ tmdbId, mediaType, title, year, actions, collectionInfo }: {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  year: string;
  actions: TrendingActions;
  collectionInfo?: {
    id: number;
    name: string;
  } | null;
}) {
  const collectionPinned = !!collectionInfo && actions.pinnedCollections.some((c) => c.tmdbId === collectionInfo.id);
  const moviePinned = actions.pinnedMovies.some((m) => m.tmdbId === tmdbId);
  const movieTitle = year ? `${title} (${year})` : title;

  const items: CardMenuItem[] = [];

  if (mediaType === "tv") {
    items.push({
      label: "Add TV show to My Studio",
      onClick: () => actions.onAddShow(tmdbId, title),
    });
  } else if (collectionInfo) {
    items.push({
      label: moviePinned ? "View movie in Studio" : "Add movie to My Studio",
      onClick: () => {
        if (moviePinned) {
          actions.onNavigate(`movie:${tmdbId}`);
        } else {
          actions.onAddMovie(tmdbId, movieTitle);
        }
      },
    });
    items.push({
      label: collectionPinned ? "View collection in Studio" : "Add collection to My Studio",
      onClick: () => {
        if (collectionPinned) {
          actions.onNavigate(`collection:${collectionInfo.id}`);
        } else {
          actions.onAddCollection(collectionInfo.id, collectionInfo.name);
        }
      },
    });
  } else {
    items.push({
      label: moviePinned ? "View in Studio" : "Add movie to My Studio",
      onClick: () => {
        if (moviePinned) {
          actions.onNavigate(`movie:${tmdbId}`);
        } else {
          actions.onAddMovie(tmdbId, movieTitle);
        }
      },
    });
  }

  return <CardMenuButton ariaLabel={`${title} options`} items={items} />;
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
  const collectionInfo = mediaType === "movie" ? item.belongs_to_collection ?? null : null;
  const collectionPinned = !!actions && !!collectionInfo && actions.pinnedCollections.some((c) => c.tmdbId === collectionInfo.id);
  const moviePinned = !!actions && actions.pinnedMovies.some((m) => m.tmdbId === item.id);

  // Determine if this item is already in Studio
  let inStudioKey: string | null = null;
  if (actions) {
    if (mediaType === "tv" && actions.pinnedTvShows.some((s) => s.tmdbId === item.id)) {
      inStudioKey = `show:${item.id}`;
    } else if (mediaType === "movie") {
      if (moviePinned) {
        inStudioKey = `movie:${item.id}`;
      } else if (collectionInfo && collectionPinned) {
        inStudioKey = `collection:${collectionInfo.id}`;
      }
    }
  }

  const showMenu = !!actions && (!inStudioKey || (mediaType === "movie" && !!collectionInfo));

  const subtitleSlot = useMemo(() => {
    if (mediaType !== "movie" || !collectionInfo) {
      return undefined;
    }

    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5, flexWrap: "wrap" }}>
        {year ? (
          <Typography variant="caption" noWrap sx={{ color: "text.secondary", lineHeight: 1.4 }}>
            {year}
          </Typography>
        ) : null}
        <Typography variant="caption" noWrap sx={{ color: "text.secondary", lineHeight: 1.4 }}>
          Part of {collectionInfo.name}
        </Typography>
        {actions && !collectionPinned ? (
          <Button
            size="small"
            variant="text"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              actions.onAddCollection(collectionInfo.id, collectionInfo.name);
            }}
            sx={{
              minWidth: 0,
              px: 0.5,
              py: 0,
              fontSize: "0.625rem",
              fontWeight: 800,
              letterSpacing: "0.04em",
              lineHeight: 1.4,
            }}
          >
            ADD COLLECTION
          </Button>
        ) : null}
      </Box>
    );
  }, [actions, collectionInfo, collectionPinned, mediaType, year]);

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
      {inStudioKey && (
        <Box sx={{
          position: "absolute", top: 0, left: 0,
          bgcolor: "#16a34a", color: "#ffffff",
          fontSize: "0.6rem", fontWeight: 700, lineHeight: 1,
          px: "6px", py: "4px",
          borderRadius: "0 0 6px 0",
          letterSpacing: "0.05em",
          pointerEvents: "none",
        }}>
          IN STUDIO
        </Box>
      )}
    </Box>
  );

  return (
    <Tooltip title={inStudioKey ? "View in Studio" : ""} placement="top" disableHoverListener={!inStudioKey}>
      <Box>
        <ArtworkCardFrame
          media={imageArea}
          title={label}
          subtitle={collectionInfo ? undefined : year || undefined}
          subtitleSlot={subtitleSlot}
          menuSlot={showMenu ? (
            <TrendingCardMenu tmdbId={item.id} mediaType={mediaType} title={label} year={year} actions={actions!} collectionInfo={collectionInfo} />
          ) : undefined}
          onClick={inStudioKey ? () => actions!.onNavigate(inStudioKey) : undefined}
        />
      </Box>
    </Tooltip>
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
    <Box sx={{ bgcolor: "background.default", pb: 10, position: "relative" }}>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          opacity: 0.08,
          pointerEvents: "none",
          zIndex: 0,
          backgroundImage: (theme) => {
            const c = theme.palette.mode === "dark" ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.30)";
            return `linear-gradient(45deg, ${c} 25%, transparent 25%, transparent 75%, ${c} 75%), linear-gradient(45deg, ${c} 25%, transparent 25%, transparent 75%, ${c} 75%)`;
          },
          backgroundSize: "200px 200px",
          backgroundPosition: "0 0, 100px 100px",
        }}
      />
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
