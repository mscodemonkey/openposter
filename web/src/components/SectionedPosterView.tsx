"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import DvrOutlinedIcon from "@mui/icons-material/DvrOutlined";
import LocalMoviesOutlinedIcon from "@mui/icons-material/LocalMoviesOutlined";
import TvOutlinedIcon from "@mui/icons-material/TvOutlined";

import PosterCard from "@/components/PosterCard";
import type { PosterEntry } from "@/lib/types";
import { loadShowPosterDetails } from "@/lib/storage";

const SECTION_LIMIT = 50;

// ─── Data types ──────────────────────────────────────────────────────────────

type CollectionGroup = {
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
};

type TVShowGroup = {
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
      return {
        key: `${e.creatorId}:tv:${e.showTmdbId}:s${e.seasonNumber}`,
        showTitle: e.showTitle,
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
}: {
  previews: string[];
  aspectRatio: string;
  alt: string;
}) {
  const n = previews.length;
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
        <Box
          key={i}
          component="img"
          src={url}
          alt={n === 1 ? alt : `${alt} (${i + 1})`}
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ))}
    </Box>
  );
}

function CountBadge({ icon, count, tooltip }: { icon: ReactNode; count: number; tooltip: string }) {
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

function CollectionCard({
  group,
  showCreator,
  showDetails,
}: {
  group: CollectionGroup;
  showCreator: boolean;
  showDetails: boolean;
}) {
  const t = useTranslations("sections");
  const tc = useTranslations("common");
  const href = `/movie/${group.collectionTmdbId}/boxset`;
  const cover = (
    <Box sx={{ position: "relative" }}>
      <MosaicBox previews={group.coverUrls} aspectRatio="2 / 3" alt={group.title} />
      <Chip
        label={t("movieBoxSet")}
        size="small"
        color="primary"
        sx={{ position: "absolute", top: 6, right: 6, fontWeight: 700, fontSize: "0.6rem", height: 20, borderRadius: "6px", pointerEvents: "none" }}
      />
      {group.movieCount > 0 && (
        <Box sx={{ position: "absolute", bottom: 8, right: 8, pointerEvents: "none" }}>
          <CountBadge icon={<LocalMoviesOutlinedIcon sx={{ fontSize: "1rem" }} />} count={group.movieCount} tooltip={t("movieIncluded", { count: group.movieCount })} />
        </Box>
      )}
    </Box>
  );

  const collectionTitleStrip = (
    <Box sx={{ px: 1.5, pt: 0.75, pb: 0.5 }}>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
        {group.title}
      </Typography>
    </Box>
  );

  if (!showDetails) {
    return (
      <Card sx={{ height: "100%" }}>
        <Link href={href} style={{ display: "block" }} aria-label={group.title}>{cover}</Link>
        {collectionTitleStrip}
      </Card>
    );
  }

  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {cover}
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography sx={{ fontWeight: 800 }} noWrap>
          {group.title}
        </Typography>
        {showCreator && (
          <Typography variant="body2" color="text.secondary">
            {group.creatorName}
          </Typography>
        )}
      </CardContent>
      <CardActions sx={{ pt: 0 }}>
        <Button
          component={Link}
          href={href}
          size="small"
          variant="text"
          sx={{ px: 1, minWidth: 0 }}
        >
          {t("boxSetAction")}
        </Button>
      </CardActions>
    </Card>
  );
}

function TVShowCard({
  group,
  showCreator,
  showDetails,
}: {
  group: TVShowGroup;
  showCreator: boolean;
  showDetails: boolean;
}) {
  const t = useTranslations("sections");
  const n = group.coverPreviews.length;
  const linkLabel = group.hasBoxSet ? t("boxSetAction") : t("tvShowAction");
  const href = `/tv/${group.showTmdbId}/boxset`;

  const imageArea = (
    <Box sx={{ position: "relative" }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: n >= 2 ? "1fr 1fr" : "1fr",
          aspectRatio: "2 / 3",
          overflow: "hidden",
          bgcolor: "action.hover",
        }}
      >
        {group.coverPreviews.map((url, i) => (
          <Box
            key={i}
            component="img"
            src={url}
            alt={n === 1 ? group.title : `${group.title} (${i + 1})`}
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ))}
      </Box>
      <Chip
        label={t("tvBoxSetChip")}
        size="small"
        color="error"
        sx={{ position: "absolute", top: 6, right: 6, fontWeight: 700, fontSize: "0.6rem", height: 20, borderRadius: "6px", pointerEvents: "none" }}
      />
      {(group.seasonCount > 0 || group.episodeCount > 0) && (
        <Box sx={{ position: "absolute", bottom: 8, right: 8, display: "flex", flexDirection: "row", alignItems: "center", gap: 0.5, pointerEvents: "none" }}>
          {group.seasonCount > 0 && (
            <CountBadge icon={<TvOutlinedIcon sx={{ fontSize: "1rem" }} />} count={group.seasonCount} tooltip={t("seasonPostersIncluded", { count: group.seasonCount })} />
          )}
          {group.episodeCount > 0 && (
            <CountBadge icon={<DvrOutlinedIcon sx={{ fontSize: "1rem" }} />} count={group.episodeCount} tooltip={t("episodeCardsIncluded", { count: group.episodeCount })} />
          )}
        </Box>
      )}
    </Box>
  );

  const tvTitleStrip = (
    <Box sx={{ px: 1.5, pt: 0.75, pb: 0.5 }}>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
        {group.title}{group.year ? ` (${group.year})` : ""}
      </Typography>
    </Box>
  );

  if (!showDetails) {
    return (
      <Card sx={{ height: "100%" }}>
        <Link href={href} style={{ display: "block" }} aria-label={group.title}>{imageArea}</Link>
        {tvTitleStrip}
      </Card>
    );
  }

  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {imageArea}
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography sx={{ fontWeight: 800 }} noWrap>
          {group.title}
        </Typography>
        {showCreator && (
          <Typography variant="body2" color="text.secondary">
            {group.creatorName}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          {t("tvShowAction")}{group.year ? ` · ${group.year}` : ""}
        </Typography>
      </CardContent>
      <CardActions sx={{ pt: 0 }}>
        <Button
          component={Link}
          href={href}
          size="small"
          variant="text"
          sx={{ px: 1, minWidth: 0 }}
        >
          {linkLabel}
        </Button>
      </CardActions>
    </Card>
  );
}

function EpisodeSeasonCard({
  group,
  showDetails,
}: {
  group: EpisodeSeasonGroup;
  showDetails: boolean;
}) {
  const t = useTranslations("sections");
  const href = `/tv/${group.showTmdbId}/boxset#season-${group.seasonNumber}`;
  const mosaic = (
    <Box sx={{ position: "relative" }}>
      <MosaicBox previews={group.episodePreviews} aspectRatio="16 / 9" alt={`${group.showTitle || t("unknownShow")} S${String(group.seasonNumber).padStart(2, "0")}`} />
      <Chip
        label={group.episodeCount !== 1 ? t("episodesLabel") : t("episodeLabel")}
        size="small"
        color="secondary"
        sx={{ position: "absolute", top: 6, right: 6, fontWeight: 700, fontSize: "0.6rem", height: 20, borderRadius: "6px", pointerEvents: "none" }}
      />
      <Box sx={{ position: "absolute", bottom: 8, right: 8, pointerEvents: "none" }}>
        <CountBadge icon={<DvrOutlinedIcon sx={{ fontSize: "1rem" }} />} count={group.episodeCount} tooltip={t("episodeCardsIncluded", { count: group.episodeCount })} />
      </Box>
    </Box>
  );

  const seasonStrip = (
    <Box sx={{ px: 1.5, pt: 0.75, pb: 0.5 }}>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
        {group.showTitle || t("unknownShow")} · {t("seasonLabel", { number: String(group.seasonNumber).padStart(2, "0") })}
      </Typography>
    </Box>
  );

  if (!showDetails) {
    return (
      <Card sx={{ height: "100%" }}>
        <Link href={href} style={{ display: "block" }} aria-label={`${group.showTitle || t("unknownShow")} S${String(group.seasonNumber).padStart(2, "0")}`}>{mosaic}</Link>
        {seasonStrip}
      </Card>
    );
  }

  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {mosaic}
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography sx={{ fontWeight: 800 }} noWrap>
          {group.showTitle || t("unknownShow")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("seasonLabel", { number: String(group.seasonNumber).padStart(2, "0") })} · {t("episodeCardCount", { count: group.episodeCount })}
        </Typography>
      </CardContent>
      <CardActions sx={{ pt: 0 }}>
        <Button
          component={Link}
          href={href}
          size="small"
          variant="text"
          sx={{ px: 1, minWidth: 0 }}
        >
          {t("seasonLabel", { number: group.seasonNumber })}
        </Button>
      </CardActions>
    </Card>
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
  showCreator = true,
  loading = false,
}: Props) {
  const t = useTranslations("sections");
  const tc = useTranslations("common");
  const [showBoxSets, setShowBoxSets] = useState(true);
  const [showMoviePosters, setShowMoviePosters] = useState(true);
  const [showTVShows, setShowTVShows] = useState(true);
  const [showEpisodeCards, setShowEpisodeCards] = useState(true);
  const [showDetails, setShowDetails] = useState(true);

  useEffect(() => {
    setShowDetails(loadShowPosterDetails());
  }, []);

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
      {/* Toggle switches */}
      <Box component="fieldset" sx={{ border: "none", m: 0, p: 0 }}>
        <Box
          component="legend"
          sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", clipPath: "inset(50%)", whiteSpace: "nowrap" }}
        >
          {t("showPosterDetails")}
        </Box>
        <FormGroup row>
          <FormControlLabel
            control={<Switch checked={showBoxSets} onChange={(e) => setShowBoxSets(e.target.checked)} />}
            label={t("boxSets")}
          />
          <FormControlLabel
            control={<Switch checked={showMoviePosters} onChange={(e) => setShowMoviePosters(e.target.checked)} />}
            label={t("moviePosters")}
          />
          <FormControlLabel
            control={<Switch checked={showTVShows} onChange={(e) => setShowTVShows(e.target.checked)} />}
            label={t("tvShows")}
          />
          <FormControlLabel
            control={<Switch checked={showEpisodeCards} onChange={(e) => setShowEpisodeCards(e.target.checked)} />}
            label={t("episodeCards")}
          />
        </FormGroup>
      </Box>

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
          <Grid container spacing={2}>
            {collectionGroups.map((g) => (
              <Grid key={g.key} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                <CollectionCard group={g} showCreator={showCreator} showDetails={showDetails} />
              </Grid>
            ))}
          </Grid>
        </Section>
      )}

      {showMoviePosters && allMovies.length > 0 && (
        <Section title={t("moviePosters")}>
          <Grid container spacing={2}>
            {allMovies.map((p) => (
              <Grid key={p.poster_id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                <PosterCard
                  poster={p}
                  showCreator={showCreator}
                  actions={[
                    {
                      label: "DETAILS",
                      href: `/p/${encodeURIComponent(p.poster_id)}`,
                    },
                  ]}
                />
              </Grid>
            ))}
          </Grid>
        </Section>
      )}

      {showTVShows && tvShowGroups.length > 0 && (
        <Section title={t("tvShows")}>
          <Grid container spacing={2}>
            {tvShowGroups.map((g) => (
              <Grid key={g.key} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                <TVShowCard group={g} showCreator={showCreator} showDetails={showDetails} />
              </Grid>
            ))}
          </Grid>
        </Section>
      )}

      {showEpisodeCards && episodeSeasonGroups.length > 0 && (
        <Section title={t("episodeCards")}>
          <Grid container spacing={2}>
            {episodeSeasonGroups.map((g) => (
              <Grid key={g.key} size={{ xs: 12, sm: 6, md: 4 }}>
                <EpisodeSeasonCard group={g} showDetails={showDetails} />
              </Grid>
            ))}
          </Grid>
        </Section>
      )}
    </Stack>
  );
}
