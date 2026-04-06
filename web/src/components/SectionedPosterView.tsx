"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";

import { POSTER_GRID_COLS, EPISODE_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import DvrOutlinedIcon from "@mui/icons-material/DvrOutlined";
import TvOutlinedIcon from "@mui/icons-material/TvOutlined";

import PosterCard from "@/components/PosterCard";
import ArtworkCardFrame from "@/components/ArtworkCardFrame";
import ArtworkPlaceholder from "@/components/ArtworkPlaceholder";
import type { PosterEntry } from "@/lib/types";

const SECTION_LIMIT = 50;

// ─── Data types ──────────────────────────────────────────────────────────────

export type CollectionGroup = {
  key: string;
  title: string;
  year?: number;
  collectionTmdbId: number;
  creatorId: string;
  creatorName: string;
  /**
   * Portrait cover images (1 or 4):
   * - collection poster exists → [collectionPoster]
   * - no collection poster, ≥4 movies → [movie0..3] (2×2 mosaic)
   * - no collection poster, <4 movies → [movie0] or []
   */
  coverUrls: string[];
  collectionCount: number;
  movieCount: number;
  tvShowCount?: number;
};

export type TVShowGroup = {
  key: string;
  title: string;
  year?: number;
  showTmdbId: number;
  creatorId: string;
  creatorName: string;
  hasBoxSet: boolean; // show poster + ≥1 season poster present
  coverPreviews: string[];
  seasonCount: number;
  episodeCount: number;
};

type EpisodeSeasonGroup = {
  key: string;
  showTitle: string;
  seasonTitle?: string;
  showTmdbId: number;
  seasonNumber: number;
  episodePreviews: string[];
  episodeCount: number;
};

// ─── Grouping ─────────────────────────────────────────────────────────────────

function groupContent(items: PosterEntry[]) {
  // Build movie-poster → collection-tmdb-id lookup from collection poster links
  const movieToCollId = new Map<string, number>();
  for (const p of items) {
    if (p.media.type === "collection" && p.links && p.media.tmdb_id != null) {
      for (const link of p.links) {
        if (link.rel === "movie") {
          movieToCollId.set(link.href.replace(/^\/p\//, ""), p.media.tmdb_id);
        }
      }
    }
  }

  type CollAcc = {
    title: string;
    year?: number;
    collectionTmdbId: number;
    creatorId: string;
    creatorName: string;
    collections: PosterEntry[];
    movies: PosterEntry[];
  };
  type TvAcc = {
    title: string;
    year?: number;
    showTmdbId: number;
    creatorId: string;
    creatorName: string;
    shows: PosterEntry[];
    seasons: PosterEntry[];
  };
  type EpAcc = {
    creatorId: string;
    showTitle: string;
    showTmdbId: number;
    seasonNumber: number;
    episodes: PosterEntry[];
  };

  const collMap = new Map<string, CollAcc>();
  const tvMap = new Map<string, TvAcc>();
  const epMap = new Map<string, EpAcc>();
  const allMovies: PosterEntry[] = [];

  for (const p of items) {
    const t = p.media.type;
    const cid = p.creator.creator_id;
    const cname = p.creator.display_name;

    if (t === "collection") {
      const collId = p.media.tmdb_id!;
      const key = `${cid}:coll:${collId}`;
      if (!collMap.has(key)) {
        collMap.set(key, {
          title: p.media.title || "",
          year: p.media.year,
          collectionTmdbId: collId,
          creatorId: cid,
          creatorName: cname,
          collections: [],
          movies: [],
        });
      }
      const e = collMap.get(key)!;
      e.title = p.media.title || e.title;
      e.year = p.media.year ?? e.year;
      e.collections.push(p);
    } else if (t === "movie") {
      allMovies.push(p);
      const linkedCollId = movieToCollId.get(p.poster_id);
      if (linkedCollId != null) {
        const key = `${cid}:coll:${linkedCollId}`;
        if (!collMap.has(key)) {
          collMap.set(key, {
            title: "",
            year: undefined,
            collectionTmdbId: linkedCollId,
            creatorId: cid,
            creatorName: cname,
            collections: [],
            movies: [],
          });
        }
        collMap.get(key)!.movies.push(p);
      }
    } else if (t === "show") {
      const showId = p.media.tmdb_id!;
      const key = `${cid}:tv:${showId}`;
      if (!tvMap.has(key)) {
        tvMap.set(key, {
          title: p.media.title || "",
          year: p.media.year,
          showTmdbId: showId,
          creatorId: cid,
          creatorName: cname,
          shows: [],
          seasons: [],
        });
      }
      const e = tvMap.get(key)!;
      e.title = p.media.title || e.title;
      e.year = p.media.year ?? e.year;
      e.shows.push(p);
    } else if (t === "season") {
      const showId = p.media.show_tmdb_id!;
      const key = `${cid}:tv:${showId}`;
      if (!tvMap.has(key)) {
        tvMap.set(key, {
          title: "",
          year: undefined,
          showTmdbId: showId,
          creatorId: cid,
          creatorName: cname,
          shows: [],
          seasons: [],
        });
      }
      tvMap.get(key)!.seasons.push(p);
    } else if (t === "episode") {
      const showId = p.media.show_tmdb_id!;
      const season = p.media.season_number ?? 0;
      const key = `${cid}:tv:${showId}:s${season}`;
      if (!epMap.has(key)) {
        epMap.set(key, {
          creatorId: cid,
          showTitle: "",
          showTmdbId: showId,
          seasonNumber: season,
          episodes: [],
        });
      }
      epMap.get(key)!.episodes.push(p);
    }
  }

  // Fill show titles into episode groups
  for (const ep of epMap.values()) {
    if (!ep.showTitle) {
      ep.showTitle = tvMap.get(`${ep.creatorId}:tv:${ep.showTmdbId}`)?.title || "";
    }
  }

  // Count total episodes per TV show (across all seasons)
  const tvEpisodeCount = new Map<string, number>();
  for (const ep of epMap.values()) {
    const tvKey = `${ep.creatorId}:tv:${ep.showTmdbId}`;
    tvEpisodeCount.set(tvKey, (tvEpisodeCount.get(tvKey) ?? 0) + ep.episodes.length);
  }

  const collectionGroups: CollectionGroup[] = Array.from(collMap.values())
    .map(
      (e): CollectionGroup => ({
        key: `${e.creatorId}:coll:${e.collectionTmdbId}`,
        title:
          (e.collections[0]?.media.title ?? e.title)
            .replace(/\s+collection\s*$/i, "")
            .trim() || e.title,
        year: e.year,
        collectionTmdbId: e.collectionTmdbId,
        creatorId: e.creatorId,
        creatorName: e.creatorName,
        coverUrls: e.collections.length > 0
          ? [e.collections[0].assets.preview.url]
          : e.movies.length >= 4
            ? e.movies.slice(0, 4).map((p) => p.assets.preview.url)
            : e.movies.slice(0, 1).map((p) => p.assets.preview.url),
        collectionCount: e.collections.length,
        movieCount: e.movies.length,
      }),
    )
    .slice(0, SECTION_LIMIT);

  const tvShowGroups: TVShowGroup[] = Array.from(tvMap.values())
    .map((e): TVShowGroup => {
      const hasBoxSet = e.shows.length > 0 && e.seasons.length > 0;
      const sortedSeasons = [...e.seasons].sort(
        (a, b) => (b.media.season_number ?? 0) - (a.media.season_number ?? 0),
      );
      return {
        key: `${e.creatorId}:tv:${e.showTmdbId}`,
        title: e.title || "Unknown",
        year: e.year,
        showTmdbId: e.showTmdbId,
        creatorId: e.creatorId,
        creatorName: e.creatorName,
        hasBoxSet,
        coverPreviews: hasBoxSet
          ? e.shows.slice(0, 1).map((p) => p.assets.preview.url)
          : sortedSeasons.slice(0, 2).map((p) => p.assets.preview.url),
        seasonCount: e.seasons.length,
        episodeCount: tvEpisodeCount.get(`${e.creatorId}:tv:${e.showTmdbId}`) ?? 0,
      };
    })
    .slice(0, SECTION_LIMIT);

  const episodeSeasonGroups: EpisodeSeasonGroup[] = Array.from(epMap.values())
    .map((e): EpisodeSeasonGroup => {
      const sorted = [...e.episodes].sort(
        (a, b) => (b.media.episode_number ?? 0) - (a.media.episode_number ?? 0),
      );
      const seasonPoster = tvMap.get(`${e.creatorId}:tv:${e.showTmdbId}`)?.seasons
        .find(s => s.media.season_number === e.seasonNumber);
      const seasonTitle = seasonPoster?.media.title && seasonPoster.media.title !== e.showTitle
        ? seasonPoster.media.title
        : undefined;
      return {
        key: `${e.creatorId}:tv:${e.showTmdbId}:s${e.seasonNumber}`,
        showTitle: e.showTitle,
        seasonTitle,
        showTmdbId: e.showTmdbId,
        seasonNumber: e.seasonNumber,
        episodePreviews: sorted.length >= 4
          ? sorted.slice(0, 4).map((p) => p.assets.preview.url)
          : sorted.slice(0, 1).map((p) => p.assets.preview.url),
        episodeCount: e.episodes.length,
      };
    })
    .sort(
      (a, b) =>
        a.showTitle.localeCompare(b.showTitle) || a.seasonNumber - b.seasonNumber,
    )
    .slice(0, SECTION_LIMIT);

  return {
    collectionGroups,
    allMovies: allMovies.slice(0, SECTION_LIMIT),
    tvShowGroups,
    episodeSeasonGroups,
  };
}

// ─── Card components ──────────────────────────────────────────────────────────

function MosaicBox({
  previews,
  aspectRatio,
  alt,
  onImageError,
}: {
  previews: string[];
  aspectRatio: string;
  alt: string;
  onImageError?: () => void;
}) {
  const n = previews.length;
  const [failed, setFailed] = useState<Set<number>>(new Set());

  function handleError(i: number) {
    setFailed((prev) => prev.has(i) ? prev : new Set([...prev, i]));
    if (i === 0) onImageError?.();
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: n >= 2 ? "1fr 1fr" : "1fr",
        gridTemplateRows: n >= 3 ? "1fr 1fr" : "1fr",
        aspectRatio,
        overflow: "hidden",
        bgcolor: "action.hover",
      }}
    >
      {previews.map((url, i) => (
        failed.has(i) ? (
          <Box key={i} sx={{ width: "100%", height: "100%", bgcolor: "action.hover" }} />
        ) : (
        <Box
          key={i}
          component="img"
          src={url}
          alt={n === 1 ? alt : `${alt} (${i + 1})`}
          onError={() => handleError(i)}
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
        )
      ))}
    </Box>
  );
}

export function CountBadge({ icon, count, tooltip }: { icon: ReactNode; count: number; tooltip: string }) {
  return (
    <Tooltip title={tooltip} placement="top">
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          bgcolor: "rgba(0,0,0,0.7)",
          color: "white",
          borderRadius: "6px",
          px: 1,
          py: 0.5,
          pointerEvents: "auto",
        }}
      >
        <Box sx={{ display: "flex", fontSize: "1rem" }}>{icon}</Box>
        <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, lineHeight: 1 }}>{count}</Typography>
      </Box>
    </Tooltip>
  );
}

export function CollectionCard({
  group, onClick, onImageError, chip, managed, menuSlot, imageWrapper, imageFailed = false,
}: {
  group: CollectionGroup;
  onClick?: () => void;
  onImageError?: () => void;
  chip?: { label: string; color: "primary" | "success" | "error" | "secondary" | "warning" | "info" } | false;
  managed?: boolean;
  menuSlot?: React.ReactNode;
  imageWrapper?: (img: React.ReactElement) => React.ReactElement;
  imageFailed?: boolean;
}) {
  const t = useTranslations("sections");
  const href = `/movie/${group.collectionTmdbId}/boxset`;
  const countParts = [
    group.movieCount > 0 ? t("movieCount", { count: group.movieCount }) : null,
    (group.tvShowCount ?? 0) > 0 ? t("tvShowCount", { count: group.tvShowCount ?? 0 }) : null,
  ].filter(Boolean);
  const subtitleParts = [
    countParts.length > 0 ? countParts.join(", ") : null,
    group.creatorName || null,
  ].filter(Boolean);
  const subtitleLine = subtitleParts.join(" · ");
  const showPlaceholder = imageFailed || group.coverUrls.length === 0;
  const media = showPlaceholder ? (
    <ArtworkPlaceholder aspectRatio="2 / 3" alt={group.title} />
  ) : (
    <MosaicBox previews={group.coverUrls} aspectRatio="2 / 3" alt={group.title} onImageError={onImageError} />
  );
  return (
    <ArtworkCardFrame
      media={media}
      title={group.title}
      subtitle={subtitleLine || undefined}
      menuSlot={menuSlot}
      managed={managed}
      href={href}
      onClick={onClick}
      imageWrapper={imageWrapper}
    />
  );
}

export function TVShowCard({ group, onClick, onImageError, chip, menuSlot, imageWrapper, imageFailed = false }: { group: TVShowGroup; onClick?: () => void; onImageError?: () => void; chip?: { label: string; color: "primary" | "success" | "error" | "secondary" | "warning" | "info" } | false; menuSlot?: React.ReactNode; imageWrapper?: (img: React.ReactElement) => React.ReactElement; imageFailed?: boolean }) {
  const t = useTranslations("sections");
  const n = group.coverPreviews.length;
  const href = `/tv/${group.showTmdbId}/boxset`;
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const showPlaceholder = imageFailed || n === 0;

  function handleError(i: number) {
    setFailed((prev) => prev.has(i) ? prev : new Set([...prev, i]));
    if (i === 0) onImageError?.();
  }

  const media = showPlaceholder ? (
    <ArtworkPlaceholder aspectRatio="2 / 3" alt={group.title} />
  ) : (
    <Box sx={{ display: "grid", gridTemplateColumns: n >= 2 ? "1fr 1fr" : "1fr", aspectRatio: "2 / 3", overflow: "hidden", bgcolor: "action.hover" }}>
      {group.coverPreviews.map((url, i) => (
        failed.has(i) ? (
          <Box key={i} sx={{ width: "100%", height: "100%", bgcolor: "action.hover" }} />
        ) : (
          <Box key={i} component="img" src={url} alt={n === 1 ? group.title : `${group.title} (${i + 1})`} onError={() => handleError(i)} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        )
      ))}
    </Box>
  );

  return (
    <ArtworkCardFrame
      media={media}
      title={group.title}
      subtitle={[group.year, group.creatorName || null].filter(Boolean).join(" · ") || undefined}
      topRightSlot={(group.seasonCount > 0 || group.episodeCount > 0) ? (
        <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 0.5 }}>
          {group.seasonCount > 0 && <CountBadge icon={<TvOutlinedIcon sx={{ fontSize: "1rem" }} />} count={group.seasonCount} tooltip={t("seasonPostersIncluded", { count: group.seasonCount })} />}
          {group.episodeCount > 0 && <CountBadge icon={<DvrOutlinedIcon sx={{ fontSize: "1rem" }} />} count={group.episodeCount} tooltip={t("episodeCardsIncluded", { count: group.episodeCount })} />}
        </Box>
      ) : undefined}
      menuSlot={menuSlot}
      href={href}
      onClick={onClick}
      imageWrapper={imageWrapper}
    />
  );
}

function EpisodeSeasonCard({ group }: { group: EpisodeSeasonGroup }) {
  const t = useTranslations("sections");
  const href = `/tv/${group.showTmdbId}/boxset#season-${group.seasonNumber}`;
  return (
    <ArtworkCardFrame
      media={<MosaicBox previews={group.episodePreviews} aspectRatio="16 / 9" alt={`${group.showTitle || t("unknownShow")} S${String(group.seasonNumber).padStart(2, "0")}`} />}
      title={group.showTitle || t("unknownShow")}
      subtitle={group.seasonTitle ?? t("seasonLabel", { number: String(group.seasonNumber).padStart(2, "0") })}
      bottomRightSlot={<CountBadge icon={<DvrOutlinedIcon sx={{ fontSize: "1rem" }} />} count={group.episodeCount} tooltip={t("episodeCardsIncluded", { count: group.episodeCount })} />}
      href={href}
      ariaLabel={`${group.showTitle || t("unknownShow")} S${String(group.seasonNumber).padStart(2, "0")}`}
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack spacing={1.5}>
      <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

type Props = {
  items: PosterEntry[];
  showCreator?: boolean;
  loading?: boolean;
};

export default function SectionedPosterView({
  items,
  loading = false,
}: Props) {
  const t = useTranslations("sections");
  const tc = useTranslations("common");
  const [filters, setFilters] = useState(["boxSets", "moviePosters", "tvShows", "episodeCards"]);
  const showBoxSets = filters.includes("boxSets");
  const showMoviePosters = filters.includes("moviePosters");
  const showTVShows = filters.includes("tvShows");
  const showEpisodeCards = filters.includes("episodeCards");

  const { collectionGroups, allMovies, tvShowGroups, episodeSeasonGroups } =
    useMemo(() => groupContent(items), [items]);

  if (loading) {
    return <Typography color="text.secondary" role="status" aria-live="polite">{tc("loading")}</Typography>;
  }

  const noContent =
    (showBoxSets && collectionGroups.length === 0) &&
    (showMoviePosters && allMovies.length === 0) &&
    (showTVShows && tvShowGroups.length === 0) &&
    (showEpisodeCards && episodeSeasonGroups.length === 0);

  return (
    <Stack spacing={3}>
      {/* Fixed filter bar — always directly below the AppBar */}
      <Box sx={{
        position: "fixed",
        top: { xs: "56px", sm: "64px" },
        left: 0,
        right: 0,
        zIndex: 1099,
        bgcolor: "background.default",
        borderBottom: 1,
        borderColor: "divider",
        px: 2,
        py: 1,
      }}>
        <ToggleButtonGroup
          value={filters}
          onChange={(_, v) => v.length > 0 && setFilters(v)}
          size="small"
          aria-label={t("showPosterDetails")}
        >
          <ToggleButton value="boxSets">{t("boxSets")}</ToggleButton>
          <ToggleButton value="moviePosters">{t("moviePosters")}</ToggleButton>
          <ToggleButton value="tvShows">{t("tvShows")}</ToggleButton>
          <ToggleButton value="episodeCards">{t("episodeCards")}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {/* Spacer so content clears the fixed bar (~48px bar height) */}
      <Box sx={{ height: "48px" }} />

      {noContent && items.length > 0 && (
        <Typography color="text.secondary" role="status">
          {t("noResultsInCategories")}
        </Typography>
      )}
      {items.length === 0 && (
        <Typography color="text.secondary" role="status">{tc("noPostersFound")}</Typography>
      )}

      {showBoxSets && collectionGroups.length > 0 && (
        <Section title={t("boxSets")}>
          <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
            {collectionGroups.map((g) => (
              <Box key={g.key}>
                <CollectionCard group={g} />
              </Box>
            ))}
          </Box>
        </Section>
      )}

      {showMoviePosters && allMovies.length > 0 && (
        <Section title={t("moviePosters")}>
          <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
            {allMovies.map((p) => (
              <Box key={p.poster_id}>
                <PosterCard
                  poster={p}
                  actions={[
                    {
                      label: "DETAILS",
                      href: `/p/${encodeURIComponent(p.poster_id)}`,
                    },
                  ]}
                />
              </Box>
            ))}
          </Box>
        </Section>
      )}

      {showTVShows && tvShowGroups.length > 0 && (
        <Section title={t("tvShows")}>
          <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
            {tvShowGroups.map((g) => (
              <Box key={g.key}>
                <TVShowCard group={g} />
              </Box>
            ))}
          </Box>
        </Section>
      )}

      {showEpisodeCards && episodeSeasonGroups.length > 0 && (
        <Section title={t("episodeCards")}>
          <Box sx={{ display: "grid", gridTemplateColumns: EPISODE_GRID_COLS, gap: GRID_GAP }}>
            {episodeSeasonGroups.map((g) => (
              <Box key={g.key}>
                <EpisodeSeasonCard group={g} />
              </Box>
            ))}
          </Box>
        </Section>
      )}
    </Stack>
  );
}
