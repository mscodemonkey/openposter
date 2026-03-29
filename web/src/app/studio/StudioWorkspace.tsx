"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import PageHeader from "@/components/PageHeader";
import type { PageCrumb } from "@/components/PageHeader";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardMedia from "@mui/material/CardMedia";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Checkbox from "@mui/material/Checkbox";
import Container from "@mui/material/Container";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Slide from "@mui/material/Slide";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import HomeIcon from "@mui/icons-material/Home";
import CheckIcon from "@mui/icons-material/Check";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import ImageIcon from "@mui/icons-material/Image";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import TvOutlinedIcon from "@mui/icons-material/TvOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";

import { POSTER_GRID_COLS, EPISODE_GRID_COLS, BACKDROP_GRID_COLS, GRID_GAP, CHIP_HEIGHT } from "@/lib/grid-sizes";
import { loadCreatorConnection, saveCreatorConnection, clearCreatorConnection } from "@/lib/storage";
import { loadIssuerUser, loadIssuerToken, saveIssuerSession } from "@/lib/issuer_storage";
import { issuerMe } from "@/lib/issuer";
import { fetchSetting, saveSetting } from "@/lib/settings";
import { adminListThemes, adminCreateTheme, adminDeleteTheme, adminSetPosterTheme } from "@/lib/themes";
import { fetchTmdbCollection, fetchTmdbTvShow, fetchTmdbTvSeason, fetchTmdbSearchCollection, fetchTmdbSearchTv, fetchTmdbMovie, fetchTmdbSearchMovie, tmdbImageUrl, tmdbStillUrl, type TmdbCollection, type TmdbMovie, type TmdbTvShow, type TmdbEpisode, type TmdbTvSeason, type TmdbSearchResult } from "@/lib/tmdb";
import { fetchMovieLogo, fetchMovieSquare, fetchTvLogo, fetchTvSquare } from "@/lib/placeholder-images";
import type { CreatorTheme, PosterEntry } from "@/lib/types";
import { CardChip } from "@/components/MediaCard";
import PosterCard from "@/components/PosterCard";
import { CollectionCard, CountBadge, TVShowCard, type CollectionGroup, type TVShowGroup } from "@/components/SectionedPosterView";
import StudioWelcome from "./StudioWelcome";
import ThemeModal from "./ThemeModal";
import ZipImportDialog, { type ZipImportConfig } from "@/components/ZipImportDialog";
import PosterActionsMenu from "./PosterActionsMenu";
import UploadDrawer, { type UploadPreFill } from "./UploadDrawer";

// ─── Navigation state ────────────────────────────────────────────────────────

type NavState =
  | { view: "root" }
  | { view: "theme"; themeId: string }
  | { view: "list"; listType: "collections" | "movies" | "tv"; themeId: string }
  | { view: "media"; mediaKey: string };

function navFromParams(p: ReturnType<typeof useSearchParams>): NavState {
  const view = p.get("view");
  if (view === "theme") {
    const themeId = p.get("themeId") ?? "";
    return themeId ? { view: "theme", themeId } : { view: "root" };
  }
  if (view === "list") {
    const listType = p.get("type") as "collections" | "movies" | "tv" | null;
    const themeId = p.get("themeId") ?? "";
    return (listType && themeId) ? { view: "list", listType, themeId } : { view: "root" };
  }
  if (view === "media") {
    const key = p.get("key") ?? "";
    return key ? { view: "media", mediaKey: key } : { view: "root" };
  }
  return { view: "root" };
}

function navToSearch(nav: NavState, themeFilter?: string): string {
  const p = new URLSearchParams();
  if (nav.view === "theme") { p.set("view", "theme"); p.set("themeId", nav.themeId); }
  else if (nav.view === "list") { p.set("view", "list"); p.set("type", nav.listType); p.set("themeId", nav.themeId); }
  else if (nav.view === "media") { p.set("view", "media"); p.set("key", nav.mediaKey); }
  if (themeFilter) p.set("themeFilter", themeFilter);
  const s = p.toString();
  return s ? `?${s}` : "";
}

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

// ─── Shared callbacks type ────────────────────────────────────────────────────

type StudioCallbacks = {
  conn: { nodeUrl: string; adminToken: string; creatorId: string; creatorDisplayName: string } | null;
  themes: CreatorTheme[];
  loadData: () => void;
  onMove: (posterId: string, themeId: string | null) => void;
  onDelete: (posterId: string) => void;
  onTogglePublished: (posterId: string, currentlyPublished: boolean) => void;
  onOpenUpload: (preFill: UploadPreFill) => void;
  onOpenZipImport: (config: ZipImportConfig) => void;
  onZipContextReady: (config: ZipImportConfig | null) => void;
  activeThemeId: string;
  handleMoveAllPosters: (posterIds: string[], themeId: string | null) => void;
};

// ─── Module-scope sub-components ─────────────────────────────────────────────

const CHECKER = "repeating-conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%) 0 0 / 20px 20px";

// Session-level cache for placeholder images — avoids re-fetching on every navigation
const placeholderCache = new Map<string, string | null>();
async function cachedFetch(key: string, fetcher: () => Promise<string | null>): Promise<string | null> {
  if (placeholderCache.has(key)) return placeholderCache.get(key)!;
  const result = await fetcher();
  placeholderCache.set(key, result);
  return result;
}

function StudioStatusBar({ published }: { published: boolean }) {
  const t = useTranslations("studio");
  return (
    <Box sx={{ bgcolor: published ? "success.main" : "warning.main", px: 1, py: 0.35, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Typography sx={{ fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1, color: published ? "success.contrastText" : "warning.contrastText" }}>
        {published ? t("published") : t("draft")}
      </Typography>
    </Box>
  );
}

interface StudioPosterCardProps {
  poster: PosterEntry;
  selected: boolean;
  onToggleSelect: () => void;
  callbacks: StudioCallbacks;
  titleOverride?: string;
  subtitle?: string;
  /** When set, renders the subtitle as a Next.js Link. */
  subtitleHref?: string;
  /** When set, image area triggers this instead of linking to poster detail. */
  onClick?: () => void;
}
function StudioPosterCard({ poster, selected, onToggleSelect, callbacks, titleOverride, subtitle, subtitleHref, onClick }: StudioPosterCardProps) {
  const tc = useTranslations("common");
  const published = poster.published !== false;
  const isMovie = poster.media.type === "movie";
  const isEpisode = poster.media.type === "episode";
  const showCheckbox = isMovie || isEpisode;

  // Inset box-shadow ring — stays inside the image area, never clipped by Card's overflow:hidden.
  const selectionRing = selected ? (
    <Box sx={{ position: "absolute", inset: 0, boxShadow: (theme) => `inset 0 0 0 2px ${theme.palette.primary.main}`, pointerEvents: "none", zIndex: 1 }} />
  ) : null;

  return (
    <Box sx={{ position: "relative" }}>
      <PosterCard
        poster={poster}
        {...(onClick ? { onClick } : { actions: [{ label: tc("details"), href: `/p/${encodeURIComponent(poster.poster_id)}` }] })}
        titleOverride={titleOverride}
        aspectRatio={(poster.media.type === "backdrop" || isEpisode) ? "16 / 9" : (poster.kind === "logo" ? "16 / 9" : poster.kind === "square" ? "1 / 1" : "2 / 3")}
        hideCreator={isMovie || isEpisode}
        subtitle={subtitleHref ? undefined : subtitle}
        subtitleSlot={subtitleHref && subtitle ? (
          <Link href={subtitleHref} style={{ color: "inherit" }} onClick={(e) => e.stopPropagation()}>
            <Typography variant="caption" noWrap sx={{ color: "text.secondary", lineHeight: 1.4, textDecoration: "underline", textUnderlineOffset: 2 }}>
              {subtitle}
            </Typography>
          </Link>
        ) : undefined}
        statusBar={<StudioStatusBar published={published} />}
        imageWrapper={(img) => (
          <Box sx={{ position: "relative" }}>
            {img}
            {selectionRing}
            {showCheckbox && (
              <Box sx={{ position: "absolute", bottom: 6, right: 6, zIndex: 2 }}>
                <Checkbox
                  size="small"
                  checked={selected}
                  onChange={onToggleSelect}
                  onClick={(e) => e.stopPropagation()}
                  sx={{ p: 0.25, filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.9))" }}
                />
              </Box>
            )}
          </Box>
        )}
      />
      <Box sx={{ position: "absolute", top: 4, right: 4 }}>
        <PosterActionsMenu
          poster={poster}
          themes={callbacks.themes}
          onUpload={() => callbacks.onOpenUpload({
            mediaType: poster.media.type === "backdrop" ? "backdrop" : poster.media.type,
            kind: poster.kind,
            tmdbId: poster.media.tmdb_id ? String(poster.media.tmdb_id) : undefined,
            title: poster.media.title ?? undefined,
            year: poster.media.year ? String(poster.media.year) : undefined,
            themeId: poster.media.theme_id ?? callbacks.activeThemeId,
            collectionTmdbId: poster.media.collection_tmdb_id ? String(poster.media.collection_tmdb_id) : undefined,
            showTmdbId: poster.media.show_tmdb_id ? String(poster.media.show_tmdb_id) : undefined,
            seasonNumber: poster.media.season_number != null ? String(poster.media.season_number) : undefined,
            episodeNumber: poster.media.episode_number != null ? String(poster.media.episode_number) : undefined,
          })}
          onMove={(themeId) => callbacks.onMove(poster.poster_id, themeId)}
          onDelete={() => callbacks.onDelete(poster.poster_id)}
          onTogglePublished={() => callbacks.onTogglePublished(poster.poster_id, published)}
        />
      </Box>
    </Box>
  );
}

function StudioTvPlaceholderCard({ label, imagePath, aspectRatio = "2 / 3", noChrome = false, isTransparent = false, chipLabel, chipColor = "warning", subtitle, subtitleHref, placeholderSource, onUpload, onCardClick }: {
  label: string;
  imagePath?: string | null;
  aspectRatio?: string;
  /** When true: no Card border or background (for backdrop, square, logo). */
  noChrome?: boolean;
  /** When true: use objectFit contain instead of cover (for logos and square art). */
  isTransparent?: boolean;
  chipLabel: string;
  chipColor?: "error" | "success" | "warning" | "info" | "primary" | "secondary" | "default";
  subtitle?: string;
  /** When set, renders the subtitle as a Next.js Link. */
  subtitleHref?: string;
  /** When set, shows "PLACEHOLDER FROM X" in the status bar instead of "NO ARTWORK". */
  placeholderSource?: "THEMOVIEDB.ORG" | "FANART.TV";
  onUpload: () => void;
  /** When set, clicking anywhere on the card (outside the upload menu) navigates. */
  onCardClick?: () => void;
}) {
  const t = useTranslations("studio");
  const isLandscape = aspectRatio !== "2 / 3" && aspectRatio !== "1 / 1";
  // imagePath may be a full URL (fanart.tv / TMDB logo) or a TMDB path fragment
  const imgUrl = !imagePath ? null
    : imagePath.startsWith("http") ? imagePath
    : isLandscape ? tmdbStillUrl(imagePath) : tmdbImageUrl(imagePath);
  return (
    <Card onClick={onCardClick} sx={{ height: "100%", cursor: onCardClick ? "pointer" : "default", ...(noChrome ? { bgcolor: "transparent", backgroundImage: "none", border: 0, boxShadow: "none" } : { border: "1px dashed", borderColor: "divider" }) }}>
      <Box sx={{ position: "relative" }}>
        {imgUrl ? (
          <CardMedia component="img" image={imgUrl} alt={label} sx={{ aspectRatio, objectFit: isTransparent ? "contain" : "cover", display: "block", filter: "grayscale(0.75)", opacity: 0.2 }} />
        ) : (
          <Box sx={{ aspectRatio, background: CHECKER, display: "block" }} />
        )}
        {placeholderSource && (
          <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.5, pointerEvents: "none" }}>
            <ImageIcon sx={{ fontSize: "2rem", color: "rgba(255,255,255,0.7)" }} />
            <Typography sx={{ fontSize: "0.5rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1, color: "rgba(255,255,255,0.7)", textAlign: "center", px: 1 }}>
              Placeholder from {placeholderSource}
            </Typography>
          </Box>
        )}
        <Box data-type-chip sx={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
          <CardChip label={chipLabel} color={chipColor} />
        </Box>
        <Box sx={{ position: "absolute", top: 4, right: 4 }}>
          <PosterActionsMenu onUpload={onUpload} />
        </Box>
      </Box>
      <Box sx={{ bgcolor: "error.main", px: 1, py: 0.35, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography sx={{ fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1, color: "error.contrastText" }}>
          {t("noArtwork")}
        </Typography>
      </Box>
      <Box sx={{ px: 1, pt: 0.75, pb: 0.75, textAlign: "center" }}>
        <Typography variant="caption" color="text.primary" noWrap sx={{ display: "block", fontWeight: 600 }}>{label}</Typography>
        {subtitle && (subtitleHref ? (
          <Link href={subtitleHref} style={{ color: "inherit" }} onClick={(e) => e.stopPropagation()}>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", textDecoration: "underline", textUnderlineOffset: 2 }}>{subtitle}</Typography>
          </Link>
        ) : (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{subtitle}</Typography>
        ))}
      </Box>
    </Card>
  );
}

function StudioCollectionPlaceholderCard({ movie, aspectRatio = "2 / 3", uploadMediaType = "movie", uploadKind, chipLabel, chipColor, drawerLabel, collectionTmdbId, callbacks, subtitle, onCardClick }: {
  movie: TmdbMovie;
  aspectRatio?: string;
  uploadMediaType?: string;
  uploadKind?: string;
  chipLabel: string;
  chipColor: "error" | "success" | "warning" | "info" | "primary" | "secondary" | "default";
  drawerLabel: string;
  collectionTmdbId: number;
  callbacks: StudioCallbacks;
  subtitle?: string;
  onCardClick?: () => void;
}) {
  const year = movie.release_date?.slice(0, 4) ?? "";
  const isTransparent = uploadKind === "logo" || uploadKind === "square";
  const imgUrl = isTransparent ? null : tmdbImageUrl(movie.poster_path);
  const bgStyle = isTransparent || !imgUrl ? { background: CHECKER } : { bgcolor: "action.hover" };
  return (
    <Box onClick={onCardClick} sx={{ height: "100%", borderRadius: 1, overflow: "hidden", cursor: onCardClick ? "pointer" : "default" }}>
      <Box sx={{ position: "relative" }}>
        <Box sx={{ aspectRatio, ...bgStyle, position: "relative" }}>
          {imgUrl && (
            <Box component="img" src={imgUrl} alt={movie.title}
              sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "grayscale(0.75)", opacity: 0.2 }} />
          )}
        </Box>
        <Box data-type-chip sx={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
          <CardChip label={chipLabel} color={chipColor} />
        </Box>
        <Box sx={{ position: "absolute", top: 4, right: 4 }}>
          <PosterActionsMenu
            onUpload={() => callbacks.onOpenUpload({ mediaType: uploadMediaType, kind: uploadKind, tmdbId: String(movie.id), title: movie.title, year, collectionTmdbId: String(collectionTmdbId), themeId: callbacks.activeThemeId, drawerLabel })}
          />
        </Box>
        {imgUrl && (
          <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.5, pointerEvents: "none" }}>
            <ImageIcon sx={{ fontSize: "2rem", color: "rgba(255,255,255,0.7)" }} />
            <Typography sx={{ fontSize: "0.5rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1, color: "rgba(255,255,255,0.7)", textAlign: "center", px: 1 }}>
              Placeholder from THEMOVIEDB.ORG
            </Typography>
          </Box>
        )}
      </Box>
      <Box sx={{ bgcolor: "error.main", px: 1, py: 0.35, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography sx={{ fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1, color: "error.contrastText" }}>
          No artwork
        </Typography>
      </Box>
      <Box sx={{ px: 1, pt: 0.75, pb: 0.5, textAlign: "center" }}>
        <Typography variant="caption" color="text.disabled" noWrap sx={{ display: "block", fontWeight: 600 }}>
          {movie.title}
        </Typography>
        {(subtitle ?? year) && (
          <Typography variant="caption" color="text.disabled" noWrap sx={{ display: "block" }}>
            {subtitle ?? year}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function StudioCollectionSectionHeading({ label, ids, selected, setSelected }: { label: string; ids?: string[]; selected: Set<string>; setSelected: React.Dispatch<React.SetStateAction<Set<string>>> }) {
  const sectionIds = ids ?? [];
  const hasPosters = sectionIds.length > 0;
  const allChecked = hasPosters && sectionIds.every((id) => selected.has(id));
  const someChecked = hasPosters && sectionIds.some((id) => selected.has(id));
  function toggle() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) { sectionIds.forEach((id) => next.delete(id)); }
      else { sectionIds.forEach((id) => next.add(id)); }
      return next;
    });
  }
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      {hasPosters && (
        <Checkbox size="small" checked={allChecked} indeterminate={someChecked && !allChecked} onChange={toggle} sx={{ p: 0 }} />
      )}
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1, fontSize: "0.65rem" }}>
        {label}
      </Typography>
    </Stack>
  );
}

function StudioMoviePlaceholder({ tmdbData, movieTmdbId, cleanTitle, year, aspectRatio = "2 / 3", uploadType = "movie", uploadKind, callbacks }: {
  tmdbData: import("@/lib/tmdb").TmdbMovieDetail | null;
  movieTmdbId: number;
  cleanTitle: string;
  year: string;
  aspectRatio?: string;
  uploadType?: string;
  uploadKind?: string;
  callbacks: StudioCallbacks;
}) {
  const t = useTranslations("studio");
  const tp = useTranslations("posterCard");

  const [asyncImgUrl, setAsyncImgUrl] = useState<string | null>(null);
  const [asyncSource, setAsyncSource] = useState<"THEMOVIEDB.ORG" | "FANART.TV" | null>(null);

  useEffect(() => {
    setAsyncImgUrl(null);
    setAsyncSource(null);
    let cancelled = false;
    if (uploadKind === "logo") {
      cachedFetch(`logo:${movieTmdbId}`, () => fetchMovieLogo(movieTmdbId)).then((url) => {
        if (!cancelled && url) { setAsyncImgUrl(url); setAsyncSource("THEMOVIEDB.ORG"); }
      });
    } else if (uploadKind === "square") {
      cachedFetch(`square:${movieTmdbId}`, () => fetchMovieSquare(movieTmdbId)).then((url) => {
        if (!cancelled && url) { setAsyncImgUrl(url); setAsyncSource("FANART.TV"); }
      });
    }
    return () => { cancelled = true; };
  }, [movieTmdbId, uploadKind]);

  const chipLabel = uploadKind === "square" ? tp("square")
    : uploadKind === "logo" ? tp("logo")
    : uploadType === "backdrop" ? tp("backdrop")
    : tp("movie");
  const chipColor: "success" | "warning" = (uploadKind === "square" || uploadKind === "logo" || uploadType === "backdrop") ? "warning" : "success";

  const isTransparent = uploadKind === "logo" || uploadKind === "square";
  const rawImgPath = uploadType === "backdrop" ? tmdbData?.backdrop_path : tmdbData?.poster_path;
  const syncImgUrl = isTransparent || !rawImgPath ? null : tmdbImageUrl(rawImgPath);
  const imgUrl = asyncImgUrl ?? syncImgUrl;
  const placeholderSource: "THEMOVIEDB.ORG" | "FANART.TV" | null =
    asyncSource ?? (syncImgUrl ? "THEMOVIEDB.ORG" : null);
  const bgStyle = !imgUrl ? { background: CHECKER } : { bgcolor: "action.hover" };

  return (
    <Box sx={{ height: "100%", borderRadius: 1, overflow: "hidden" }}>
      <Box sx={{ position: "relative" }}>
        <Box sx={{ aspectRatio, ...bgStyle, position: "relative" }}>
          {imgUrl && (
            <Box component="img" src={imgUrl} alt={cleanTitle}
              sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: isTransparent ? "contain" : "cover", display: "block", filter: "grayscale(0.75)", opacity: 0.2 }} />
          )}
        </Box>
        <Box data-type-chip sx={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
          <CardChip label={chipLabel} color={chipColor} />
        </Box>
        <Box sx={{ position: "absolute", top: 4, right: 4 }}>
          <PosterActionsMenu
            onUpload={() => callbacks.onOpenUpload({ mediaType: uploadType, tmdbId: String(movieTmdbId), title: cleanTitle, year, themeId: callbacks.activeThemeId, kind: uploadKind, drawerLabel: uploadKind === "square" ? t("drawerLabelSquareArtwork") : uploadKind === "logo" ? t("drawerLabelLogo") : uploadType === "backdrop" ? t("drawerLabelBackdrop") : t("drawerLabelMoviePoster") })}
          />
        </Box>
        {placeholderSource && (
          <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.5, pointerEvents: "none" }}>
            <ImageIcon sx={{ fontSize: "2rem", color: "rgba(255,255,255,0.7)" }} />
            <Typography sx={{ fontSize: "0.5rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1, color: "rgba(255,255,255,0.7)", textAlign: "center", px: 1 }}>
              Placeholder from {placeholderSource}
            </Typography>
          </Box>
        )}
      </Box>
      <Box sx={{ bgcolor: "error.main", px: 1, py: 0.35, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography sx={{ fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1, color: "error.contrastText" }}>
          No artwork
        </Typography>
      </Box>
      <Box sx={{ px: 1, pt: 0.75, pb: 0.5, textAlign: "center" }}>
        <Typography variant="caption" color="text.primary" noWrap sx={{ display: "block", fontWeight: 600 }}>
          {cleanTitle}
        </Typography>
        {year && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
            {year}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

// ─── Detail view components (module scope) ────────────────────────────────────

function SeasonEpisodesView({ showTmdbId, seasonNumber, posters, tmdbData, callbacks, onBack }: {
  showTmdbId: number;
  seasonNumber: number;
  posters: PosterEntry[];
  tmdbData: TmdbTvShow | null;
  callbacks: StudioCallbacks;
  onBack: () => void;
}) {
  const t = useTranslations("studio");
  const tc = useTranslations("common");
  const tp = useTranslations("posterCard");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tmdbEpisodes, setTmdbEpisodes] = useState<TmdbEpisode[]>([]);
  const [episodesState, setEpisodesState] = useState<"idle" | "loading" | "ok" | "error">("idle");

  const seasonNum = String(seasonNumber).padStart(2, "0");
  const tmdbSeason = (tmdbData?.seasons ?? []).find((s) => s.season_number === seasonNumber);

  function matchesTheme(p: PosterEntry) {
    return callbacks.activeThemeId === "" || p.media.theme_id === callbacks.activeThemeId;
  }

  const uploadedEpisodePosters = new Map<number, PosterEntry>();
  for (const p of posters.filter((x) => x.media.season_number === seasonNumber && x.media.type === "episode" && matchesTheme(x))) {
    if (p.media.episode_number != null) uploadedEpisodePosters.set(p.media.episode_number, p);
  }
  const epPostersForSeason = [...uploadedEpisodePosters.values()];

  useEffect(() => {
    setEpisodesState("loading");
    fetchTmdbTvSeason(showTmdbId, seasonNumber)
      .then((data) => { setTmdbEpisodes(data?.episodes ?? []); setEpisodesState("ok"); })
      .catch(() => setEpisodesState("error"));
  }, [showTmdbId, seasonNumber]);

  function toggleSelect(posterId: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(posterId) ? next.delete(posterId) : next.add(posterId); return next; });
  }
  function selectNone() { setSelected(new Set()); }

  async function batchSetPublished(publish: boolean) {
    if (!callbacks.conn || selected.size === 0) return;
    await Promise.all(
      [...selected].map((id) =>
        fetch(`${callbacks.conn!.nodeUrl}/v1/admin/posters/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${callbacks.conn!.adminToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ published: publish }),
        }).catch(() => undefined)
      )
    );
    setSelected(new Set());
    void callbacks.loadData();
  }

  async function batchDelete() {
    if (!callbacks.conn || selected.size === 0) return;
    await Promise.all(
      [...selected].map((id) =>
        fetch(`${callbacks.conn!.nodeUrl}/v1/admin/posters/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${callbacks.conn!.adminToken}` },
        }).catch(() => undefined)
      )
    );
    setSelected(new Set());
    void callbacks.loadData();
  }

  const episodeCount = tmdbSeason?.episode_count ?? tmdbEpisodes.length;
  const publishedEps = epPostersForSeason.filter((p) => p.published !== false).length;
  const draftEps = epPostersForSeason.filter((p) => p.published === false).length;
  const missingEps = episodeCount > 0 ? Math.max(0, episodeCount - epPostersForSeason.length) : 0;
  const epStatusParts = [
    publishedEps > 0 ? `${publishedEps} ${t("published")}` : null,
    draftEps > 0 ? `${draftEps} ${t("draft")}` : null,
    missingEps > 0 ? `${missingEps} ${t("missing")}` : null,
  ].filter(Boolean);
  const episodesHeadingLabel = `${t("sectionEpisodes")}${epStatusParts.length > 0 ? ` — ${epStatusParts.join(", ")}` : ""}`;
  const allSelectedPosters = epPostersForSeason;

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1} alignItems="center">
        <IconButton size="small" onClick={onBack}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t("seasonTitle", { n: seasonNum })}
        </Typography>
        {tmdbData?.name && (
          <Typography variant="caption" color="text.secondary">— {tmdbData.name}</Typography>
        )}
      </Stack>

      {episodesState === "loading" && (
        <Typography variant="caption" color="text.disabled">{t("loadingEpisodes")}</Typography>
      )}
      {(tmdbEpisodes.length > 0 || epPostersForSeason.length > 0) && (
        <Stack spacing={1}>
          <StudioCollectionSectionHeading label={episodesHeadingLabel} ids={epPostersForSeason.map((p) => p.poster_id)} selected={selected} setSelected={setSelected} />
          <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
            {tmdbEpisodes.length > 0
              ? tmdbEpisodes.map((ep: TmdbEpisode) => {
                  const existing = uploadedEpisodePosters.get(ep.episode_number);
                  const epLabel = `E${String(ep.episode_number).padStart(2, "0")} · ${ep.name}`;
                  return (
                    <Box key={ep.episode_number}>
                      {existing
                        ? <StudioPosterCard poster={existing} selected={selected.has(existing.poster_id)} onToggleSelect={() => toggleSelect(existing.poster_id)} callbacks={callbacks} />
                        : <StudioTvPlaceholderCard label={epLabel} imagePath={ep.still_path} aspectRatio="16 / 9" chipLabel={tp("episode")} chipColor="success" onUpload={() => callbacks.onOpenUpload({ mediaType: "episode", showTmdbId: String(showTmdbId), tmdbId: String(showTmdbId), seasonNumber: String(seasonNumber), episodeNumber: String(ep.episode_number), title: ep.name, themeId: callbacks.activeThemeId })} />
                      }
                    </Box>
                  );
                })
              : epPostersForSeason.sort((a, b) => (a.media.episode_number ?? 0) - (b.media.episode_number ?? 0)).map((p) => (
                  <Box key={p.poster_id}>
                    <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} />
                  </Box>
                ))
            }
          </Box>
        </Stack>
      )}

      {(() => {
        const selPosters = allSelectedPosters.filter((p) => selected.has(p.poster_id));
        const allPublished = selPosters.length > 0 && selPosters.every((p) => p.published !== false);
        const allDraft = selPosters.length > 0 && selPosters.every((p) => p.published === false);
        const currentThemeId = selPosters.length > 0 && selPosters.every((p) => p.media.theme_id === selPosters[0].media.theme_id)
          ? (selPosters[0].media.theme_id ?? null) : null;
        const selectableThemes = callbacks.themes.filter((th) => th.theme_id !== currentThemeId);
        return (
          <Slide direction="up" in={selected.size > 0} mountOnEnter unmountOnExit>
            <Box sx={{ position: "fixed", bottom: 24, left: { xs: 0, md: 220 }, right: 0, zIndex: 1200, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <Paper elevation={8} sx={{ px: 2, py: 1, borderRadius: 3, display: "flex", alignItems: "center", gap: 1, pointerEvents: "auto" }}>
                <Typography variant="body2" sx={{ flex: 1, fontWeight: 700 }}>{t("selectedCountBold", { count: selected.size })}</Typography>
                {selectableThemes.length > 0 && (
                  <Select size="small" displayEmpty value="" onChange={(e) => { void callbacks.handleMoveAllPosters([...selected], e.target.value || null); selectNone(); }} sx={{ fontSize: "0.75rem", minWidth: 140 }} renderValue={() => t("changeTheme")}>
                    {selectableThemes.map((th) => <MenuItem key={th.theme_id} value={th.theme_id}>{th.name}</MenuItem>)}
                  </Select>
                )}
                <Button size="small" variant="outlined" color="warning" disabled={allDraft} onClick={() => void batchSetPublished(false)}>{t("setDraft")}</Button>
                <Button size="small" variant="contained" color="success" disabled={allPublished} onClick={() => void batchSetPublished(true)}>{t("publish")}</Button>
                {!confirmDelete
                  ? <Button size="small" color="error" onClick={() => setConfirmDelete(true)}>{t("deleteSelected")}</Button>
                  : <><Typography variant="body2" color="error.main" sx={{ fontWeight: 700 }}>{t("batchDeleteConfirm", { count: selected.size })}</Typography><Button size="small" color="error" variant="contained" onClick={() => { void batchDelete(); setConfirmDelete(false); }}>{tc("delete")}</Button><Button size="small" onClick={() => setConfirmDelete(false)}>{tc("cancel")}</Button></>
                }
                <Button size="small" onClick={() => { selectNone(); setConfirmDelete(false); }} sx={{ minWidth: 0, px: 1 }}>{tc("clear")}</Button>
              </Paper>
            </Box>
          </Slide>
        );
      })()}
    </Stack>
  );
}

function TvShowDetailView({ showTmdbId, posters, tmdbData, tmdbState, callbacks }: {
  showTmdbId: number;
  posters: PosterEntry[];
  tmdbData: TmdbTvShow | null;
  tmdbState: "idle" | "loading" | "ok" | "error";
  callbacks: StudioCallbacks;
}) {
  const t = useTranslations("studio");
  const tc = useTranslations("common");
  const tp = useTranslations("posterCard");
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromListType = searchParams.get("fromListType");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const showYear = tmdbData?.first_air_date?.slice(0, 4) ?? undefined;

  const [tvLogoUrl, setTvLogoUrl] = useState<string | null>(null);
  const [tvSquareUrl, setTvSquareUrl] = useState<string | null>(null);
  useEffect(() => {
    setTvLogoUrl(null);
    setTvSquareUrl(null);
    let cancelled = false;
    fetchTvLogo(showTmdbId).then((url) => { if (!cancelled && url) setTvLogoUrl(url); });
    fetchTvSquare(showTmdbId).then((url) => { if (!cancelled && url) setTvSquareUrl(url); });
    return () => { cancelled = true; };
  }, [showTmdbId]);

  useEffect(() => {
    if (!tmdbData) return;
    const showYear = tmdbData.first_air_date?.slice(0, 4) ?? undefined;
    callbacks.onZipContextReady({
      contextType: "show",
      contextTmdbId: showTmdbId,
      contextTitle: tmdbData.name ?? String(showTmdbId),
      contextYear: showYear ? parseInt(showYear) : undefined,
      showSeasons: (tmdbData.seasons ?? []).filter((s) => s.season_number > 0).map((s) => ({ id: s.id, season_number: s.season_number })),
      themeId: callbacks.activeThemeId || undefined,
    });
    return () => { callbacks.onZipContextReady(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTmdbId, tmdbData, callbacks.activeThemeId]);

  function toggleSelect(posterId: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(posterId) ? next.delete(posterId) : next.add(posterId); return next; });
  }
  function selectNone() { setSelected(new Set()); }

  const seasonParam = searchParams.get("season");
  const activeSeasonNumber = seasonParam ? parseInt(seasonParam, 10) : NaN;

  function seasonHref(sn: number): string {
    const p = new URLSearchParams(searchParams.toString());
    p.set("season", String(sn));
    return `/studio?${p.toString()}`;
  }

  function navigateToSeason(sn: number) {
    router.push(seasonHref(sn));
  }

  function navigateBackToShow() {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("season");
    router.push(`/studio?${p.toString()}`);
  }

  if (!isNaN(activeSeasonNumber)) {
    return (
      <SeasonEpisodesView
        showTmdbId={showTmdbId}
        seasonNumber={activeSeasonNumber}
        posters={posters}
        tmdbData={tmdbData}
        callbacks={callbacks}
        onBack={navigateBackToShow}
      />
    );
  }

  function matchesTheme(p: PosterEntry) {
    return callbacks.activeThemeId === "" || p.media.theme_id === callbacks.activeThemeId;
  }

  const existingPosters = posters.filter((p) => p.media.type !== undefined && matchesTheme(p));
  const allIds = existingPosters.map((p) => p.poster_id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  function selectAll() { setSelected(new Set(allIds)); }

  async function batchSetPublished(publish: boolean) {
    if (!callbacks.conn || selected.size === 0) return;
    await Promise.all(
      [...selected].map((id) =>
        fetch(`${callbacks.conn!.nodeUrl}/v1/admin/posters/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${callbacks.conn!.adminToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ published: publish }),
        }).catch(() => undefined)
      )
    );
    setSelected(new Set());
    void callbacks.loadData();
  }

  async function batchDelete() {
    if (!callbacks.conn || selected.size === 0) return;
    await Promise.all(
      [...selected].map((id) =>
        fetch(`${callbacks.conn!.nodeUrl}/v1/admin/posters/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${callbacks.conn!.adminToken}` },
        }).catch(() => undefined)
      )
    );
    setSelected(new Set());
    void callbacks.loadData();
  }

  const showPosters = posters.filter((p) => p.media.type === "show" && p.kind !== "logo" && p.kind !== "square" && matchesTheme(p));
  const backdropPosters = posters.filter((p) => p.media.type === "backdrop" && p.media.show_tmdb_id === showTmdbId && !p.media.collection_tmdb_id && p.media.season_number == null && matchesTheme(p));
  const showSquarePosters = posters.filter((p) => p.media.type === "show" && p.kind === "square" && matchesTheme(p));
  const showLogoPosters = posters.filter((p) => p.media.type === "show" && p.kind === "logo" && matchesTheme(p));

  const uploadedSeasonPosters = new Map<number, PosterEntry[]>();
  const uploadedSeasonBackdrops = new Map<number, PosterEntry[]>();
  for (const p of posters.filter(matchesTheme)) {
    if (p.media.type === "season" && p.media.season_number != null) {
      const sn = p.media.season_number;
      if (!uploadedSeasonPosters.has(sn)) uploadedSeasonPosters.set(sn, []);
      uploadedSeasonPosters.get(sn)!.push(p);
    }
    if (p.media.type === "backdrop" && p.media.show_tmdb_id === showTmdbId && p.media.season_number != null) {
      const sn = p.media.season_number;
      if (!uploadedSeasonBackdrops.has(sn)) uploadedSeasonBackdrops.set(sn, []);
      uploadedSeasonBackdrops.get(sn)!.push(p);
    }
  }

  const tmdbSeasons: TmdbTvSeason[] = (tmdbData?.seasons ?? []).filter((s) => s.season_number > 0);
  const fallbackSeasonNums = [...new Set(
    posters.filter((p) => p.media.season_number != null).map((p) => p.media.season_number!)
  )].sort((a, b) => a - b);
  const seasons: TmdbTvSeason[] = tmdbSeasons.length > 0
    ? tmdbSeasons
    : fallbackSeasonNums.map((n) => ({ id: n, season_number: n, name: `Season ${n}`, episode_count: 0, poster_path: null }));

  const showDisplayTitle = tmdbData
    ? (showYear ? `${tmdbData.name} (${showYear})` : tmdbData.name)
    : undefined;
  const totalEpisodeCount = tmdbSeasons.reduce((sum, s) => sum + (s.episode_count ?? 0), 0);
  const showCountsSubtitle = seasons.length > 0
    ? `${seasons.length} ${seasons.length === 1 ? "SEASON" : "SEASONS"} AND ${totalEpisodeCount} EPISODES`
    : undefined;

  // Section status helpers
  const allSeasonPosterEntries = [...uploadedSeasonPosters.values()].flat();
  const allSeasonBackdropEntries = [...uploadedSeasonBackdrops.values()].flat();
  const allPosterItems = [...showPosters, ...allSeasonPosterEntries];
  const allBackdropItems = [...backdropPosters, ...allSeasonBackdropEntries];
  const posterMissing = (showPosters.length === 0 ? 1 : 0) + seasons.filter((s) => (uploadedSeasonPosters.get(s.season_number) ?? []).length === 0).length;
  const backdropMissing = (backdropPosters.length === 0 ? 1 : 0) + seasons.filter((s) => (uploadedSeasonBackdrops.get(s.season_number) ?? []).length === 0).length;

  function sectionLabel(base: string, items: PosterEntry[], missing: number): string {
    const pub = items.filter((p) => p.published !== false).length;
    const dft = items.filter((p) => p.published === false).length;
    const parts = [
      pub > 0 ? `${pub} ${t("published")}` : null,
      dft > 0 ? `${dft} ${t("draft")}` : null,
      missing > 0 ? `${missing} ${t("missing")}` : null,
    ].filter(Boolean);
    return `${base}${parts.length > 0 ? ` — ${parts.join(", ")}` : ""}`;
  }

  return (
    <Stack spacing={3}>
      {fromListType && showDisplayTitle && (
        <Typography variant="h5" fontWeight={800}>{showDisplayTitle}</Typography>
      )}
      <Stack direction="row" spacing={1} alignItems="center">
        {allIds.length > 0 && (
          <>
            <Checkbox size="small" checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={() => allSelected ? selectNone() : selectAll()} sx={{ p: 0 }} />
            <Typography variant="caption" color="text.secondary" sx={{ cursor: "pointer", "&:hover": { color: "text.primary" } }} onClick={() => allSelected ? selectNone() : selectAll()}>
              {allSelected ? t("deselectAll") : t("selectAll")}
            </Typography>
            {selected.size > 0 && <Typography variant="caption" color="text.disabled">{t("selectedCount", { count: selected.size })}</Typography>}
          </>
        )}
        <Box sx={{ flex: 1 }} />
      </Stack>

      {tmdbState === "error" && (
        <Alert severity="warning">
          TMDB data couldn&apos;t be loaded for show ID <strong>{showTmdbId}</strong> — placeholders won&apos;t be shown.
        </Alert>
      )}

      {/* POSTERS: show poster + one slot per season (clickable → season detail) */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading label={sectionLabel(t("sectionTvShowPoster"), allPosterItems, posterMissing)} ids={allPosterItems.map((p) => p.poster_id)} selected={selected} setSelected={setSelected} />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {showPosters.length > 0
            ? showPosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} titleOverride={showDisplayTitle} subtitle={showCountsSubtitle} />
                </Box>
              ))
            : (
                <Box>
                  <StudioTvPlaceholderCard label={showDisplayTitle ?? (tmdbData?.name ?? "Show")} imagePath={tmdbData?.poster_path} placeholderSource={tmdbData?.poster_path ? "THEMOVIEDB.ORG" : undefined} chipLabel={tp("tvBoxSet")} chipColor="error" subtitle={showCountsSubtitle} noChrome onUpload={() => callbacks.onOpenUpload({ mediaType: "show", tmdbId: String(showTmdbId), title: tmdbData?.name ?? "", themeId: callbacks.activeThemeId })} />
                </Box>
              )
          }
          {seasons.map((season) => {
            const sn = season.season_number;
            const seasonPosts = uploadedSeasonPosters.get(sn) ?? [];
            const episodeCountSubtitle = season.episode_count > 0 ? `${season.episode_count} EPISODES` : undefined;
            if (seasonPosts.length > 0) {
              return seasonPosts.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} subtitle={episodeCountSubtitle} onClick={() => navigateToSeason(sn)} />
                </Box>
              ));
            }
            return (
              <Box key={`season-poster-${sn}`}>
                <StudioTvPlaceholderCard label={t("seasonTitle", { n: String(sn).padStart(2, "0") })} imagePath={season.poster_path} placeholderSource={season.poster_path ? "THEMOVIEDB.ORG" : undefined} chipLabel={tp("season")} chipColor="info" subtitle={episodeCountSubtitle} noChrome onCardClick={() => navigateToSeason(sn)} onUpload={() => callbacks.onOpenUpload({ mediaType: "season", showTmdbId: String(showTmdbId), tmdbId: String(showTmdbId), seasonNumber: String(sn), title: tmdbData?.name ?? "", themeId: callbacks.activeThemeId })} />
              </Box>
            );
          })}
        </Box>
      </Stack>

      {/* BACKDROPS: show backdrop + one slot per season */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading label={sectionLabel(t("sectionTvShowBackdrop"), allBackdropItems, backdropMissing)} ids={allBackdropItems.map((p) => p.poster_id)} selected={selected} setSelected={setSelected} />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {backdropPosters.length > 0
            ? backdropPosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} subtitle={showYear} />
                </Box>
              ))
            : (
                <Box>
                  <StudioTvPlaceholderCard label={tmdbData?.name ?? "Show"} imagePath={tmdbData?.backdrop_path} placeholderSource={tmdbData?.backdrop_path ? "THEMOVIEDB.ORG" : undefined} aspectRatio="16 / 9" noChrome chipLabel={tp("backdrop")} chipColor="warning" subtitle={showYear} onUpload={() => callbacks.onOpenUpload({ mediaType: "backdrop", showTmdbId: String(showTmdbId), tmdbId: String(showTmdbId), title: tmdbData?.name ?? "", themeId: callbacks.activeThemeId })} />
                </Box>
              )
          }
          {seasons.map((season) => {
            const sn = season.season_number;
            const seasonBacks = uploadedSeasonBackdrops.get(sn) ?? [];
            if (seasonBacks.length > 0) {
              return seasonBacks.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} subtitle={t("seasonTitle", { n: String(sn).padStart(2, "0") })} onClick={() => navigateToSeason(sn)} />
                </Box>
              ));
            }
            return (
              <Box key={`season-back-${sn}`}>
                <StudioTvPlaceholderCard label={t("seasonTitle", { n: String(sn).padStart(2, "0") })} imagePath={null} aspectRatio="16 / 9" noChrome chipLabel={tp("backdrop")} chipColor="warning" onCardClick={() => navigateToSeason(sn)} onUpload={() => callbacks.onOpenUpload({ mediaType: "backdrop", showTmdbId: String(showTmdbId), tmdbId: String(showTmdbId), seasonNumber: String(sn), title: tmdbData?.name ?? "", themeId: callbacks.activeThemeId })} />
              </Box>
            );
          })}
        </Box>
      </Stack>

      {/* SQUARE */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading label={sectionLabel(t("sectionSquareArtwork"), showSquarePosters, showSquarePosters.length === 0 ? 1 : 0)} ids={showSquarePosters.map((p) => p.poster_id)} selected={selected} setSelected={setSelected} />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {showSquarePosters.length > 0
            ? showSquarePosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} subtitle={showYear} />
                </Box>
              ))
            : (
                <Box>
                  <StudioTvPlaceholderCard label={tmdbData?.name ?? "Show"} imagePath={tvSquareUrl} placeholderSource={tvSquareUrl ? "FANART.TV" : undefined} aspectRatio="1 / 1" noChrome isTransparent chipLabel={tp("square")} chipColor="warning" subtitle={showYear} onUpload={() => callbacks.onOpenUpload({ mediaType: "show", kind: "square", tmdbId: String(showTmdbId), title: tmdbData?.name ?? "", themeId: callbacks.activeThemeId })} />
                </Box>
              )
          }
        </Box>
      </Stack>

      {/* LOGO */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading label={sectionLabel(t("sectionLogo"), showLogoPosters, showLogoPosters.length === 0 ? 1 : 0)} ids={showLogoPosters.map((p) => p.poster_id)} selected={selected} setSelected={setSelected} />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {showLogoPosters.length > 0
            ? showLogoPosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} subtitle={showYear} />
                </Box>
              ))
            : (
                <Box>
                  <StudioTvPlaceholderCard label={tmdbData?.name ?? "Show"} imagePath={tvLogoUrl} placeholderSource={tvLogoUrl ? "THEMOVIEDB.ORG" : undefined} aspectRatio="16 / 9" noChrome isTransparent chipLabel={tp("logo")} chipColor="warning" subtitle={showYear} onUpload={() => callbacks.onOpenUpload({ mediaType: "show", kind: "logo", tmdbId: String(showTmdbId), title: tmdbData?.name ?? "", themeId: callbacks.activeThemeId })} />
                </Box>
              )
          }
        </Box>
      </Stack>

      {/* Batch action bar */}
      {(() => {
        const selectedPosters = existingPosters.filter((p) => selected.has(p.poster_id));
        const allPublished = selectedPosters.length > 0 && selectedPosters.every((p) => p.published !== false);
        const allDraft = selectedPosters.length > 0 && selectedPosters.every((p) => p.published === false);
        const currentThemeId = selectedPosters.length > 0 && selectedPosters.every((p) => p.media.theme_id === selectedPosters[0].media.theme_id)
          ? (selectedPosters[0].media.theme_id ?? null) : null;
        const selectableThemes = callbacks.themes.filter((th) => th.theme_id !== currentThemeId);
        return (
          <Slide direction="up" in={selected.size > 0} mountOnEnter unmountOnExit>
            <Box sx={{ position: "fixed", bottom: 24, left: { xs: 0, md: 220 }, right: 0, zIndex: 1200, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <Paper elevation={8} sx={{ px: 2, py: 1, borderRadius: 3, display: "flex", alignItems: "center", gap: 1, pointerEvents: "auto" }}>
                <Typography variant="body2" sx={{ flex: 1, fontWeight: 700 }}>{t("selectedCountBold", { count: selected.size })}</Typography>
                {selectableThemes.length > 0 && (
                  <Select size="small" displayEmpty value="" onChange={(e) => { void callbacks.handleMoveAllPosters([...selected], e.target.value || null); selectNone(); }} sx={{ fontSize: "0.75rem", minWidth: 140 }} renderValue={() => t("changeTheme")}>
                    {selectableThemes.map((th) => <MenuItem key={th.theme_id} value={th.theme_id}>{th.name}</MenuItem>)}
                  </Select>
                )}
                <Button size="small" variant="outlined" color="warning" disabled={allDraft} onClick={() => void batchSetPublished(false)}>{t("setDraft")}</Button>
                <Button size="small" variant="contained" color="success" disabled={allPublished} onClick={() => void batchSetPublished(true)}>{t("publish")}</Button>
                {!confirmDelete
                  ? <Button size="small" color="error" onClick={() => setConfirmDelete(true)}>{t("deleteSelected")}</Button>
                  : <><Typography variant="body2" color="error.main" sx={{ fontWeight: 700 }}>{t("batchDeleteConfirm", { count: selected.size })}</Typography><Button size="small" color="error" variant="contained" onClick={() => { void batchDelete(); setConfirmDelete(false); }}>{tc("delete")}</Button><Button size="small" onClick={() => setConfirmDelete(false)}>{tc("cancel")}</Button></>
                }
                <Button size="small" onClick={() => { selectNone(); setConfirmDelete(false); }} sx={{ minWidth: 0, px: 1 }}>{tc("clear")}</Button>
              </Paper>
            </Box>
          </Slide>
        );
      })()}
    </Stack>
  );
}

function CollectionDetailView({ collectionTmdbId, posters, allPosters, tmdbData, tmdbState, callbacks }: { collectionTmdbId: number; posters: PosterEntry[]; allPosters: PosterEntry[]; tmdbData: TmdbCollection | null; tmdbState: "idle" | "loading" | "ok" | "error"; callbacks: StudioCallbacks }) {
  const t = useTranslations("studio");
  const tc = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromListType = searchParams.get("fromListType");
  const collectionTitle = tmdbData?.name ?? String(collectionTmdbId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  function navigateToMovie(movieId: number) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("view", "media");
    p.set("key", `movie:${movieId}`);
    p.set("fromCollection", String(collectionTmdbId));
    router.push(`/studio?${p.toString()}`);
  }

  function toggleSelect(posterId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(posterId) ? next.delete(posterId) : next.add(posterId);
      return next;
    });
  }

  useEffect(() => {
    if (!tmdbData) return;
    callbacks.onZipContextReady({
      contextType: "collection",
      contextTmdbId: collectionTmdbId,
      contextTitle: tmdbData.name ?? String(collectionTmdbId),
      collectionParts: tmdbData.parts ?? [],
      themeId: callbacks.activeThemeId || undefined,
    });
    return () => { callbacks.onZipContextReady(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionTmdbId, tmdbData, callbacks.activeThemeId]);

  const existingPosters = posters.filter((p) => p.media.type !== undefined && (callbacks.activeThemeId === "" || p.media.theme_id === callbacks.activeThemeId));
  const allIds = existingPosters.map((p) => p.poster_id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function selectAll() { setSelected(new Set(allIds)); }
  function selectNone() { setSelected(new Set()); }

  async function batchSetPublished(publish: boolean) {
    if (!callbacks.conn || selected.size === 0) return;
    await Promise.all(
      [...selected].map((id) =>
        fetch(`${callbacks.conn!.nodeUrl}/v1/admin/posters/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${callbacks.conn!.adminToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ published: publish }),
        }).catch(() => undefined)
      )
    );
    setSelected(new Set());
    void callbacks.loadData();
  }

  async function batchDelete() {
    if (!callbacks.conn || selected.size === 0) return;
    await Promise.all(
      [...selected].map((id) =>
        fetch(`${callbacks.conn!.nodeUrl}/v1/admin/posters/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${callbacks.conn!.adminToken}` },
        }).catch(() => undefined)
      )
    );
    setSelected(new Set());
    void callbacks.loadData();
  }

  function matchesTheme(p: PosterEntry) {
    return callbacks.activeThemeId === "" || p.media.theme_id === callbacks.activeThemeId;
  }

  const collectionPosters = posters.filter((p) => p.media.type === "collection" && p.kind !== "logo" && p.kind !== "square" && matchesTheme(p));
  const collectionSquarePosters = posters.filter((p) => p.media.type === "collection" && p.kind === "square" && matchesTheme(p));
  const collectionLogoPosters = posters.filter((p) => p.media.type === "collection" && p.kind === "logo" && matchesTheme(p));

  const backdropPosters = allPosters.filter(
    (p) => p.media.type === "backdrop" && !p.media.show_tmdb_id && matchesTheme(p) &&
      (p.media.collection_tmdb_id === collectionTmdbId || p.media.tmdb_id === collectionTmdbId)
  );

  const uploadedMoviesByTmdbId = new Map(
    allPosters
      .filter((p) => p.media.type === "movie" && p.media.tmdb_id != null && matchesTheme(p))
      .map((p) => [p.media.tmdb_id!, p])
  );

  const tmdbMovies = (tmdbData?.parts ?? []).sort((a, b) =>
    (a.release_date ?? "").localeCompare(b.release_date ?? "")
  );

  const fallbackMoviePosters = allPosters
    .filter((p) => p.media.type === "movie" &&
      (p.media.collection_tmdb_id === collectionTmdbId || !p.media.collection_tmdb_id))
    .sort((a, b) => (a.media.year ?? 9999) - (b.media.year ?? 9999));

  // Only count movies that are actually in this collection (matched by TMDB movie list).
  // Using allPosters unfiltered causes movies from other collections to be included.
  const collectionMovieEntries = tmdbMovies.length > 0
    ? tmdbMovies.filter((m) => uploadedMoviesByTmdbId.has(m.id)).map((m) => uploadedMoviesByTmdbId.get(m.id)!)
    : [...uploadedMoviesByTmdbId.values()];
  const publishedMovieCount = collectionMovieEntries.filter((p) => p.published !== false).length;
  const totalMovieCount = tmdbMovies.length || uploadedMoviesByTmdbId.size;
  const movieCountLabel = totalMovieCount > 0
    ? `${totalMovieCount} MOVIE${totalMovieCount !== 1 ? "S" : ""}`
    : "NO MOVIES";

  return (
    <Stack spacing={3}>
      {fromListType && (
        <Typography variant="h5" fontWeight={800}>{collectionTitle}</Typography>
      )}
      <Stack direction="row" spacing={1} alignItems="center">
        {allIds.length > 0 && (
          <>
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
              {allSelected ? t("deselectAll") : t("selectAll")}
            </Typography>
            {selected.size > 0 && (
              <Typography variant="caption" color="text.disabled">
                {t("selectedCount", { count: selected.size })}
              </Typography>
            )}
          </>
        )}
        <Box sx={{ flex: 1 }} />
      </Stack>

      {tmdbState === "error" && (
        <Alert severity="warning">
          TMDB data couldn&apos;t be loaded for collection ID <strong>{collectionTmdbId}</strong> — the ID on this poster may be wrong.
          Check <strong>themoviedb.org/collection/{collectionTmdbId}</strong> to verify, then re-upload with the correct ID.
        </Alert>
      )}

      {/* Collection poster */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading label={t("sectionCollection")} ids={collectionPosters.map((p) => p.poster_id)} selected={selected} setSelected={setSelected} />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {collectionPosters.length > 0
            ? collectionPosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} subtitle={movieCountLabel} />
                </Box>
              ))
            : (
                <Box>
                  <StudioCollectionPlaceholderCard
                    movie={{ id: collectionTmdbId, title: tmdbData?.name ?? "", poster_path: tmdbData?.poster_path ?? null }}
                    uploadMediaType="collection"
                    chipLabel="COLLECTION"
                    chipColor="error"
                    drawerLabel={t("drawerLabelCollectionPoster")}
                    collectionTmdbId={collectionTmdbId}
                    callbacks={callbacks}
                    subtitle={movieCountLabel}
                  />
                </Box>
              )
          }
        </Box>
      </Stack>

      {/* Movies */}
      {(() => {
        const movieIds = tmdbMovies.length > 0
          ? tmdbMovies.filter((m) => uploadedMoviesByTmdbId.has(m.id)).map((m) => uploadedMoviesByTmdbId.get(m.id)!.poster_id)
          : fallbackMoviePosters.map((p) => p.poster_id);
        return (
          <Stack spacing={1}>
            <StudioCollectionSectionHeading
              label={totalMovieCount > 0 ? t("moviesPublishedHeading", { published: publishedMovieCount, total: totalMovieCount }) : t("moviesHeading")}
              ids={movieIds}
              selected={selected}
              setSelected={setSelected}
            />
            <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
              {tmdbMovies.length > 0
                ? tmdbMovies.map((m) => (
                    <Box key={m.id}>
                      {uploadedMoviesByTmdbId.has(m.id)
                        ? <StudioPosterCard poster={uploadedMoviesByTmdbId.get(m.id)!} selected={selected.has(uploadedMoviesByTmdbId.get(m.id)!.poster_id)} onToggleSelect={() => toggleSelect(uploadedMoviesByTmdbId.get(m.id)!.poster_id)} callbacks={callbacks} onClick={() => navigateToMovie(m.id)} />
                        : <StudioCollectionPlaceholderCard movie={m} chipLabel="MOVIE" chipColor="success" drawerLabel={t("drawerLabelMoviePoster")} collectionTmdbId={collectionTmdbId} callbacks={callbacks} onCardClick={() => navigateToMovie(m.id)} />
                      }
                    </Box>
                  ))
                : fallbackMoviePosters.filter((p) => p.media.tmdb_id != null).map((p) => (
                    <Box key={p.poster_id}>
                      <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} onClick={() => navigateToMovie(p.media.tmdb_id!)} />
                    </Box>
                  ))
              }
            </Box>
          </Stack>
        );
      })()}

      {/* Backdrop */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading label={t("sectionBackdrop")} ids={backdropPosters.map((p) => p.poster_id)} selected={selected} setSelected={setSelected} />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {backdropPosters.length > 0
            ? backdropPosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} />
                </Box>
              ))
            : (
                <Box>
                  <StudioCollectionPlaceholderCard
                    movie={{ id: collectionTmdbId, title: tmdbData?.name ?? collectionPosters[0]?.media.title ?? "", poster_path: tmdbData?.backdrop_path ?? null }}
                    aspectRatio="16 / 9"
                    uploadMediaType="backdrop"
                    chipLabel="BACKDROP"
                    chipColor="warning"
                    drawerLabel={t("drawerLabelBackdrop")}
                    collectionTmdbId={collectionTmdbId}
                    callbacks={callbacks}
                  />
                </Box>
              )
          }
        </Box>
      </Stack>

      {/* Square */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading label={t("sectionSquare")} ids={collectionSquarePosters.map((p) => p.poster_id)} selected={selected} setSelected={setSelected} />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {collectionSquarePosters.length > 0
            ? collectionSquarePosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} />
                </Box>
              ))
            : (
                <Box>
                  <StudioCollectionPlaceholderCard
                    movie={{ id: collectionTmdbId, title: tmdbData?.name ?? collectionPosters[0]?.media.title ?? "", poster_path: null }}
                    aspectRatio="1 / 1"
                    uploadMediaType="collection"
                    uploadKind="square"
                    chipLabel="SQUARE"
                    chipColor="warning"
                    drawerLabel={t("drawerLabelSquareArtwork")}
                    collectionTmdbId={collectionTmdbId}
                    callbacks={callbacks}
                  />
                </Box>
              )
          }
        </Box>
      </Stack>

      {/* Logo */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading label={t("sectionLogo")} ids={collectionLogoPosters.map((p) => p.poster_id)} selected={selected} setSelected={setSelected} />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {collectionLogoPosters.length > 0
            ? collectionLogoPosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} />
                </Box>
              ))
            : (
                <Box>
                  <StudioCollectionPlaceholderCard
                    movie={{ id: collectionTmdbId, title: tmdbData?.name ?? collectionPosters[0]?.media.title ?? "", poster_path: null }}
                    aspectRatio="16 / 9"
                    uploadMediaType="collection"
                    uploadKind="logo"
                    chipLabel="LOGO"
                    chipColor="warning"
                    drawerLabel={t("drawerLabelLogo")}
                    collectionTmdbId={collectionTmdbId}
                    callbacks={callbacks}
                  />
                </Box>
              )
          }
        </Box>
      </Stack>

      {/* Bottom action bar */}
      {(() => {
        const selectedPosters = existingPosters.filter((p) => selected.has(p.poster_id));
        const allPublished = selectedPosters.length > 0 && selectedPosters.every((p) => p.published !== false);
        const allDraft = selectedPosters.length > 0 && selectedPosters.every((p) => p.published === false);
        const currentThemeId = selectedPosters.length > 0 && selectedPosters.every((p) => p.media.theme_id === selectedPosters[0].media.theme_id)
          ? (selectedPosters[0].media.theme_id ?? null)
          : null;
        const selectableThemes = callbacks.themes.filter((th) => th.theme_id !== currentThemeId);
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
                {t("selectedCountBold", { count: selected.size })}
              </Typography>
              {selectableThemes.length > 0 && (
                <Select
                  size="small"
                  displayEmpty
                  value=""
                  onChange={(e) => { void callbacks.handleMoveAllPosters([...selected], e.target.value || null); selectNone(); }}
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
              {!confirmDelete
                ? <Button size="small" color="error" onClick={() => setConfirmDelete(true)}>{t("deleteSelected")}</Button>
                : <><Typography variant="body2" color="error.main" sx={{ fontWeight: 700 }}>{t("batchDeleteConfirm", { count: selected.size })}</Typography><Button size="small" color="error" variant="contained" onClick={() => { void batchDelete(); setConfirmDelete(false); }}>{tc("delete")}</Button><Button size="small" onClick={() => setConfirmDelete(false)}>{tc("cancel")}</Button></>
              }
              <Button size="small" onClick={() => { selectNone(); setConfirmDelete(false); }} sx={{ minWidth: 0, px: 1 }}>
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

function MovieDetailView({ movieTmdbId, title, posters, allPosters, tmdbData, tmdbState, callbacks }: {
  movieTmdbId: number;
  title: string;
  posters: PosterEntry[];
  allPosters: PosterEntry[];
  tmdbData: import("@/lib/tmdb").TmdbMovieDetail | null;
  tmdbState: "idle" | "loading" | "ok" | "error";
  callbacks: StudioCallbacks;
}) {
  const t = useTranslations("studio");
  const tc = useTranslations("common");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toggleSelect(posterId: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(posterId) ? next.delete(posterId) : next.add(posterId); return next; });
  }

  function selectNone() { setSelected(new Set()); }

  const existingPosters = posters.filter((p) => p.media.type !== undefined && (callbacks.activeThemeId === "" || p.media.theme_id === callbacks.activeThemeId));
  const allIds = existingPosters.map((p) => p.poster_id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  function selectAll() { setSelected(new Set(allIds)); }

  async function batchSetPublished(publish: boolean) {
    if (!callbacks.conn || selected.size === 0) return;
    await Promise.all(
      [...selected].map((id) =>
        fetch(`${callbacks.conn!.nodeUrl}/v1/admin/posters/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${callbacks.conn!.adminToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ published: publish }),
        }).catch(() => undefined)
      )
    );
    setSelected(new Set());
    void callbacks.loadData();
  }

  async function batchDelete() {
    if (!callbacks.conn || selected.size === 0) return;
    await Promise.all(
      [...selected].map((id) =>
        fetch(`${callbacks.conn!.nodeUrl}/v1/admin/posters/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${callbacks.conn!.adminToken}` },
        }).catch(() => undefined)
      )
    );
    setSelected(new Set());
    void callbacks.loadData();
  }

  const moviePosters = posters.filter((p) => p.media.type === "movie" && p.kind !== "logo" && p.kind !== "square" && (callbacks.activeThemeId === "" || p.media.theme_id === callbacks.activeThemeId));
  const movieSquarePosters = posters.filter((p) => p.media.type === "movie" && p.kind === "square" && (callbacks.activeThemeId === "" || p.media.theme_id === callbacks.activeThemeId));
  const movieLogoPosters = posters.filter((p) => p.media.type === "movie" && p.kind === "logo" && (callbacks.activeThemeId === "" || p.media.theme_id === callbacks.activeThemeId));
  const backdropPosters = allPosters.filter(
    (p) => p.media.type === "backdrop" && !p.media.show_tmdb_id && !p.media.collection_tmdb_id &&
      p.media.tmdb_id === movieTmdbId && (callbacks.activeThemeId === "" || p.media.theme_id === callbacks.activeThemeId)
  );

  const rawTitle = title || (tmdbData
    ? `${tmdbData.title}${tmdbData.release_date?.slice(0, 4) ? ` (${tmdbData.release_date.slice(0, 4)})` : ""}`
    : "");
  const year = rawTitle.match(/\((\d{4})\)$/)?.[1] ?? "";
  const cleanTitle = rawTitle.replace(/\s*\(\d{4}\)$/, "");

  const selectedPosters = existingPosters.filter((p) => selected.has(p.poster_id));
  const allPublished = selectedPosters.length > 0 && selectedPosters.every((p) => p.published !== false);
  const allDraft = selectedPosters.length > 0 && selectedPosters.every((p) => p.published === false);
  const currentThemeId = selectedPosters.length > 0 && selectedPosters.every((p) => p.media.theme_id === selectedPosters[0].media.theme_id)
    ? (selectedPosters[0].media.theme_id ?? null) : null;
  const selectableThemes = callbacks.themes.filter((th) => th.theme_id !== currentThemeId);

  const collectionName = tmdbData?.belongs_to_collection?.name ?? null;
  const heroBackdropUrl = backdropPosters[0]?.assets.preview.url
    ?? (tmdbData?.backdrop_path ? tmdbImageUrl(tmdbData.backdrop_path) : null);

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
          />
          <Box sx={{ position: "absolute", inset: 0, background: (theme) => `linear-gradient(to bottom, transparent 40%, ${theme.palette.background.default} 95%)` }} />
        </Box>
      )}

    <Stack spacing={3} sx={{ position: "relative", zIndex: 1 }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
          {cleanTitle}{year ? ` (${year})` : ""}
        </Typography>

        {collectionName ? (
          <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: "0.05em", textTransform: "uppercase", display: "block" }}>
            {`Member of: ${collectionName}`}
          </Typography>
        ) : tmdbState !== "loading" && (
          <Typography variant="caption" color="text.disabled" sx={{ letterSpacing: "0.05em", textTransform: "uppercase", display: "block" }}>
            Not a member of any collections
          </Typography>
        )}
      </Box>

      {allIds.length > 0 && (
        <Stack direction="row" alignItems="center" spacing={1}>
          <Checkbox size="small" checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={() => allSelected ? selectNone() : selectAll()} sx={{ p: 0 }} />
          <Typography variant="caption" color="text.secondary" sx={{ cursor: "pointer", "&:hover": { color: "text.primary" } }} onClick={() => allSelected ? selectNone() : selectAll()}>
            {allSelected ? "Deselect all" : "Select all"}
          </Typography>
          {selected.size > 0 && <Typography variant="caption" color="text.disabled">{t("selectedCount", { count: selected.size })}</Typography>}
        </Stack>
      )}

      {/* Movie poster */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading label={t("sectionPosters")} ids={moviePosters.map((p) => p.poster_id)} selected={selected} setSelected={setSelected} />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {moviePosters.length > 0
            ? moviePosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} titleOverride={cleanTitle} subtitle={year} />
                </Box>
              ))
            : tmdbState !== "loading" && (
                <Box>
                  <StudioMoviePlaceholder tmdbData={tmdbData} movieTmdbId={movieTmdbId} cleanTitle={cleanTitle} year={year} aspectRatio="2 / 3" uploadType="movie" callbacks={callbacks} />
                </Box>
              )
          }
        </Box>
      </Stack>

      {/* Backdrop */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading label={t("sectionBackdrop")} ids={backdropPosters.map((p) => p.poster_id)} selected={selected} setSelected={setSelected} />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {backdropPosters.length > 0
            ? backdropPosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} titleOverride={cleanTitle} subtitle={year} />
                </Box>
              ))
            : tmdbState !== "loading" && (
                <Box>
                  <StudioMoviePlaceholder tmdbData={tmdbData} movieTmdbId={movieTmdbId} cleanTitle={cleanTitle} year={year} aspectRatio="16 / 9" uploadType="backdrop" callbacks={callbacks} />
                </Box>
              )
          }
        </Box>
      </Stack>

      {/* Square */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading label={t("sectionSquare")} ids={movieSquarePosters.map((p) => p.poster_id)} selected={selected} setSelected={setSelected} />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {movieSquarePosters.length > 0
            ? movieSquarePosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} titleOverride={cleanTitle} subtitle={year} />
                </Box>
              ))
            : tmdbState !== "loading" && (
                <Box>
                  <StudioMoviePlaceholder tmdbData={tmdbData} movieTmdbId={movieTmdbId} cleanTitle={cleanTitle} year={year} aspectRatio="1 / 1" uploadType="movie" uploadKind="square" callbacks={callbacks} />
                </Box>
              )
          }
        </Box>
      </Stack>

      {/* Logo */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading label={t("sectionLogo")} ids={movieLogoPosters.map((p) => p.poster_id)} selected={selected} setSelected={setSelected} />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {movieLogoPosters.length > 0
            ? movieLogoPosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} titleOverride={cleanTitle} subtitle={year} />
                </Box>
              ))
            : tmdbState !== "loading" && (
                <Box>
                  <StudioMoviePlaceholder tmdbData={tmdbData} movieTmdbId={movieTmdbId} cleanTitle={cleanTitle} year={year} aspectRatio="16 / 9" uploadType="movie" uploadKind="logo" callbacks={callbacks} />
                </Box>
              )
          }
        </Box>
      </Stack>

      {(() => {
        return (
          <Slide direction="up" in={selected.size > 0} mountOnEnter unmountOnExit>
            <Box sx={{ position: "fixed", bottom: 24, left: { xs: 0, md: 220 }, right: 0, zIndex: 1200, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <Paper elevation={8} sx={{ px: 2, py: 1, borderRadius: 3, display: "flex", alignItems: "center", gap: 1, pointerEvents: "auto" }}>
                <Typography variant="body2" sx={{ flex: 1, fontWeight: 700 }}>{t("selectedCountBold", { count: selected.size })}</Typography>
                {selectableThemes.length > 0 && (
                  <Select size="small" value="" displayEmpty renderValue={() => t("changeTheme")} onChange={(e) => { void callbacks.handleMoveAllPosters([...selected], e.target.value || null); selectNone(); }} sx={{ fontSize: "0.75rem", minWidth: 140 }}>
                    {selectableThemes.map((th) => <MenuItem key={th.theme_id} value={th.theme_id}>{th.name}</MenuItem>)}
                  </Select>
                )}
                <Button size="small" variant="outlined" color="warning" disabled={allDraft} onClick={() => void batchSetPublished(false)}>{t("setDraft")}</Button>
                <Button size="small" variant="contained" color="success" disabled={allPublished} onClick={() => void batchSetPublished(true)}>{t("publish")}</Button>
                {!confirmDelete
                  ? <Button size="small" color="error" onClick={() => setConfirmDelete(true)}>{t("deleteSelected")}</Button>
                  : <><Typography variant="body2" color="error.main" sx={{ fontWeight: 700 }}>{t("batchDeleteConfirm", { count: selected.size })}</Typography><Button size="small" color="error" variant="contained" onClick={() => { void batchDelete(); setConfirmDelete(false); }}>{tc("delete")}</Button><Button size="small" onClick={() => setConfirmDelete(false)}>{tc("cancel")}</Button></>
                }
                <Button size="small" onClick={() => { selectNone(); setConfirmDelete(false); }} sx={{ minWidth: 0, px: 1 }}>{tc("clear")}</Button>
              </Paper>
            </Box>
          </Slide>
        );
      })()}
    </Stack>
    </Box>
  );
}

// ─── Creator handle prompt (one-time migration for pre-handle connections) ────

function CreatorHandlePrompt() {
  const t = useTranslations("studio");
  const [value, setValue] = useState("");
  function save() {
    if (!value.trim()) return;
    const conn = loadCreatorConnection();
    if (conn) saveCreatorConnection({ ...conn, creatorId: value.trim() });
    window.location.reload();
  }
  return (
    <Container maxWidth="sm" sx={{ py: 8, textAlign: "center" }}>
      <Typography variant="h5" fontWeight={800} gutterBottom>{t("creatorHandleTitle")}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t("creatorHandleHint")}
      </Typography>
      <Stack direction="row" spacing={1} justifyContent="center">
        <TextField
          size="small"
          placeholder={t("creatorHandlePlaceholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        />
        <Button variant="contained" disabled={!value.trim()} onClick={save}>{t("save")}</Button>
      </Stack>
    </Container>
  );
}

// ─── Empty list state ────────────────────────────────────────────────────────

function EmptyListState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        py: 10,
        px: 4,
        gap: 2,
      }}
    >
      <Box sx={{ color: "text.disabled", lineHeight: 0 }}>{icon}</Box>
      <Box>
        <Typography variant="h6" fontWeight={800} gutterBottom>{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 340, mx: "auto" }}>
          {description}
        </Typography>
      </Box>
      <Button variant="contained" startIcon={<AddIcon />} onClick={onAction} sx={{ mt: 0.5 }}>
        {actionLabel}
      </Button>
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
  const [sessionExpired, setSessionExpired] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nav = useMemo(() => navFromParams(searchParams), [searchParams]);
  const activeThemeId = searchParams.get("themeFilter") ?? "";
  function setActiveThemeId(id: string) {
    router.push(`/studio${navToSearch(nav, id || undefined)}`);
  }
  const navigate = useCallback((next: NavState) => {
    // Sync the theme filter when entering a theme or list view; otherwise preserve the current filter.
    const themeFilter = next.view === "theme" ? next.themeId
      : next.view === "list" ? next.themeId
      : (activeThemeId || undefined);
    router.push(`/studio${navToSearch(next, themeFilter)}`);
  }, [router, activeThemeId]);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<CreatorTheme | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [tmdbCollectionData, setTmdbCollectionData] = useState<TmdbCollection | null>(null);
  const [tmdbCollectionState, setTmdbCollectionState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  // Batch-loaded TMDB collection data for the collections list view (collectionTmdbId → data)
  const [collectionTmdbMap, setCollectionTmdbMap] = useState<Map<number, TmdbCollection | null>>(new Map());
  const [showTmdbMap, setShowTmdbMap] = useState<Map<number, TmdbTvShow | null>>(new Map());
  const [tmdbTvShowData, setTmdbTvShowData] = useState<TmdbTvShow | null>(null);
  const [tmdbTvShowState, setTmdbTvShowState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [tmdbMovieData, setTmdbMovieData] = useState<import("@/lib/tmdb").TmdbMovieDetail | null>(null);
  const [tmdbMovieState, setTmdbMovieState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
  const [uploadPreFill, setUploadPreFill] = useState<UploadPreFill | undefined>(undefined);
  const [zipImportOpen, setZipImportOpen] = useState(false);
  const [zipImportConfig, setZipImportConfig] = useState<ZipImportConfig | null>(null);
  const [zipContext, setZipContext] = useState<ZipImportConfig | null>(null);

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

  // Unpin (remove from Studio) — non-destructive, keeps artwork
  const [unpinConfirm, setUnpinConfirm] = useState<{ group: MediaGroup } | null>(null);
  const [rowMenuState, setRowMenuState] = useState<{ anchor: HTMLElement; group: MediaGroup } | null>(null);

  function handleUnpinGroup(group: MediaGroup) {
    if (group.type === "collection") {
      savePinnedCollections(pinnedCollections.filter((pc) => pc.tmdbId !== group.tmdbId));
    } else if (group.type === "show") {
      savePinnedTvShows(pinnedTvShows.filter((ps) => ps.tmdbId !== group.tmdbId));
    } else if (group.type === "movie") {
      savePinnedMovies(pinnedMovies.filter((pm) => pm.tmdbId !== group.tmdbId));
    }
    if (nav.view === "media" && nav.mediaKey === group.key) navigate({ view: "root" });
    setUnpinConfirm(null);
  }

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
    if (nav.view === "media" && nav.mediaKey === group.key) navigate({ view: "root" });
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
    navigate({ view: "media", mediaKey: `show:${addShowLookup.tmdbId}` });
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
      navigate({ view: "media", mediaKey: `collection:${addMovieResult.collectionId}` });
    } else {
      const next = pinnedMovies.filter((m) => m.tmdbId !== addMovieResult.movieId);
      const title = addMovieResult.year ? `${addMovieResult.movieTitle} (${addMovieResult.year})` : addMovieResult.movieTitle;
      next.push({ tmdbId: addMovieResult.movieId, title });
      savePinnedMovies(next);
      navigate({ view: "media", mediaKey: `movie:${addMovieResult.movieId}` });
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

      // Resolve creator_id — try four sources in order of reliability:
      // 1. The stored connection (set during onboarding)
      // 2. The poster feed — every poster carries the creator's ID
      // 3. The cached issuer user in localStorage
      // 4. A live fetch from /v1/me using the stored issuer token
      const issuerUser = loadIssuerUser();
      const displayName = posters[0]?.creator.display_name
        ?? issuerUser?.display_name
        ?? issuerUser?.handle
        ?? c.creatorId
        ?? "";
      let cid = c.creatorId;
      if (!cid && posters.length > 0) {
        cid = posters[0].creator.creator_id;
      }
      if (!cid) {
        if (issuerUser?.handle) {
          cid = issuerUser.handle;
        } else {
          const issuerToken = loadIssuerToken();
          if (issuerToken) {
            try {
              const freshUser = await issuerMe(issuerToken);
              if (freshUser.handle) {
                cid = freshUser.handle;
                saveIssuerSession(issuerToken, freshUser);
              }
            } catch { /* ignore — issuer unreachable */ }
          }
        }
      }
      if (cid) saveCreatorConnection({ ...c, creatorId: cid });
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

      // Load themes — auto-create "Default theme" if none exist.
      // We do NOT silently swallow auth errors here; a 401/403 means the admin session
      // was wiped (e.g. dev reset) and we need to tell the user to reconnect.
      let ts: CreatorTheme[] = [];
      if (cid) {
        let listError: string | null = null;
        try {
          ts = await adminListThemes(c.nodeUrl, c.adminToken, cid);
        } catch (e) {
          listError = e instanceof Error ? e.message : String(e);
          const isAuthError = listError.includes(": 401") || listError.includes(": 403");
          if (isAuthError) {
            // Stale session — clear the stored token so the welcome page shows
            clearCreatorConnection();
            setSessionExpired(true);
            setConn(null);
            setLoading(false);
            return;
          }
          // 400 (missing cid) or network error — fall through with ts = []
        }
        if (ts.length === 0 && !listError) {
          // Backend returned empty themes — create the Default theme now
          const created = await adminCreateTheme(c.nodeUrl, c.adminToken, cid, "Default theme").catch(() => null);
          if (created) ts = [created];
        }
      }
      setThemes(ts);
      setExpandedSections((prev) => {
        // Auto-expand any newly loaded themes; preserve any user-toggled state
        const next = new Set(prev);
        for (const th of ts) next.add(th.theme_id);
        return next;
      });
    } catch {
      // node unreachable — show connection error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);


  const refreshThemes = useCallback(async () => {
    if (!conn?.creatorId) return;
    const ts = await adminListThemes(conn.nodeUrl, conn.adminToken, conn.creatorId).catch(() => []);
    setThemes(ts);
  }, [conn]);

  const [deleteThemeConfirm, setDeleteThemeConfirm] = useState<CreatorTheme | null>(null);
  const [deleteThemeNameInput, setDeleteThemeNameInput] = useState("");

  async function confirmDeleteTheme() {
    if (!conn || !deleteThemeConfirm) return;
    await adminDeleteTheme(conn.nodeUrl, conn.adminToken, conn.creatorId, deleteThemeConfirm.theme_id).catch(() => undefined);
    setDeleteThemeConfirm(null);
    setDeleteThemeNameInput("");
    await refreshThemes();
    navigate({ view: "root" });
  }

  const handleDeleteTheme = useCallback((theme: CreatorTheme) => {
    setDeleteThemeNameInput("");
    setDeleteThemeConfirm(theme);
  }, []);

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

  const studioCallbacks = useMemo<StudioCallbacks>(() => ({
    conn,
    themes,
    loadData,
    onMove: handleMovePoster,
    onDelete: handleDeletePoster,
    onTogglePublished: handleTogglePublished,
    onOpenUpload: (preFill) => { setUploadPreFill(preFill); setUploadDrawerOpen(true); },
    onOpenZipImport: (config) => { setZipImportConfig(config); setZipImportOpen(true); },
    onZipContextReady: (config) => setZipContext(config),
    activeThemeId,
    handleMoveAllPosters,
  }), [conn, themes, loadData, handleMovePoster, handleDeletePoster, handleTogglePublished, activeThemeId, handleMoveAllPosters]);

  // ─── Derived views ──────────────────────────────────────────────────────────

  const mediaGroups = useMemo(() => groupByMedia(allPosters), [allPosters]);

  // Fetch TMDB collection data when navigating into a collection view and pass it as a prop.
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

  // Batch-fetch TMDB collection data for all pinned collections when the collections list view is shown
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (nav.view !== "list" || nav.listType !== "collections") return;
    const missing = sidebarCollections.filter((g) => !collectionTmdbMap.has(g.tmdbId));
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(missing.map(async (g) => {
      const data = await fetchTmdbCollection(g.tmdbId);
      return [g.tmdbId, data] as const;
    })).then((results) => {
      if (cancelled) return;
      setCollectionTmdbMap((prev) => {
        const next = new Map(prev);
        for (const [id, data] of results) next.set(id, data);
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [nav, sidebarCollections.length]); // sidebarCollections.length as proxy for list changes

  // Batch-fetch TMDB show data for all pinned TV shows when the TV list view is shown
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (nav.view !== "list" || nav.listType !== "tv") return;
    const missing = sidebarTvShows.filter((g) => !showTmdbMap.has(g.tmdbId));
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(missing.map(async (g) => {
      const data = await fetchTmdbTvShow(g.tmdbId);
      return [g.tmdbId, data] as const;
    })).then((results) => {
      if (cancelled) return;
      setShowTmdbMap((prev) => {
        const next = new Map(prev);
        for (const [id, data] of results) next.set(id, data);
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [nav, sidebarTvShows.length]); // sidebarTvShows.length as proxy for list changes

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
                onClick={() => navigate(c.nav)}
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

  // TvShowDetailView, CollectionDetailView, and MovieDetailView are defined at module scope above StudioWorkspace to prevent remount on parent re-render.
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
          {themes.length > 1 && (
            <Tooltip title={t("deleteTheme")}>
              <IconButton size="small" color="error" onClick={() => theme && handleDeleteTheme(theme)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
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
                  <CollectionCard group={toCollectionGroup(g)} onClick={() => navigate({ view: "media", mediaKey: g.key })} />
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
                  <TVShowCard group={toTVShowGroup(g)} onClick={() => navigate({ view: "media", mediaKey: g.key })} />
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
          {themes.length > 1 && (
            <Tooltip title={t("deleteTheme")}>
              <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDeleteTheme(theme); }}>
                <DeleteOutlineIcon sx={{ fontSize: "0.85rem" }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Card>
    );
  }

  function renderMain() {
    if (nav.view === "root") {
      const seasonSet = new Set<string>();
      const episodeSet = new Set<string>();
      for (const p of allPosters) {
        if (p.media.show_tmdb_id != null && p.media.season_number != null) {
          seasonSet.add(`${p.media.show_tmdb_id}-${p.media.season_number}`);
          if (p.media.episode_number != null) {
            episodeSet.add(`${p.media.show_tmdb_id}-${p.media.season_number}-${p.media.episode_number}`);
          }
        }
      }
      return (
        <StudioWelcome
          showHero={false}
          creatorHandle={conn?.creatorDisplayName || conn?.creatorId || undefined}
          collectionCount={sidebarCollections.length}
          movieCount={sidebarMovies.length}
          tvShowCount={sidebarTvShows.length}
          seasonCount={seasonSet.size}
          episodeCount={episodeSet.size}
        />
      );
    }

    if (nav.view === "theme") {
      const theme = themes.find((th) => th.theme_id === nav.themeId);
      const groups = mediaGroupsForTheme(nav.themeId);
      const collectionGroups = groups.filter((g) => g.type === "collection");
      const showGroups = groups.filter((g) => g.type === "show");
      return <ThemeDetailView theme={theme ?? null} collectionGroups={collectionGroups} showGroups={showGroups} />;
    }

    if (nav.view === "list") {
      const { listType, themeId } = nav;

      function navigateToDetail(key: string) {
        const p = new URLSearchParams(searchParams.toString());
        p.set("view", "media");
        p.set("key", key);
        p.set("fromListType", listType);
        p.set("fromListThemeId", themeId);
        router.push(`/studio?${p.toString()}`);
      }

      if (listType === "collections") {
        function collStats(collId: number) {
          const themed = (p: PosterEntry) => activeThemeId === "" || p.media.theme_id === activeThemeId;

          const artworkMovieIds = new Set(
            allPosters.filter((p) =>
              p.media.type === "movie" && p.media.collection_tmdb_id === collId &&
              p.media.tmdb_id != null && themed(p)
            ).map((p) => p.media.tmdb_id!)
          );

          const hasCollPoster = allPosters.some((p) =>
            p.media.type === "collection" && p.media.tmdb_id === collId &&
            p.kind !== "logo" && p.kind !== "square" && themed(p)
          );
          const hasBackdrop = allPosters.some((p) =>
            p.media.type === "backdrop" && !p.media.show_tmdb_id &&
            (p.media.collection_tmdb_id === collId || p.media.tmdb_id === collId) && themed(p)
          );
          const hasSquare = allPosters.some((p) =>
            p.media.type === "collection" && p.media.tmdb_id === collId && p.kind === "square" && themed(p)
          );
          const hasLogo = allPosters.some((p) =>
            p.media.type === "collection" && p.media.tmdb_id === collId && p.kind === "logo" && themed(p)
          );

          return { artworkCount: artworkMovieIds.size, hasCollPoster, hasBackdrop, hasSquare, hasLogo };
        }

        function statusIcon(stats: ReturnType<typeof collStats>, movieCount: number | null) {
          const allExtras = stats.hasCollPoster && stats.hasBackdrop && stats.hasSquare && stats.hasLogo;
          const hasAnyExtras = stats.hasCollPoster || stats.hasBackdrop || stats.hasSquare || stats.hasLogo;
          const allPosters = movieCount !== null && movieCount > 0 && stats.artworkCount >= movieCount;
          const somePosters = stats.artworkCount > 0;

          if (allPosters && allExtras) {
            return <CheckCircleIcon sx={{ fontSize: "1.1rem", color: "success.main" }} />;
          }
          if (allPosters) {
            return <CheckCircleIcon sx={{ fontSize: "1.1rem", color: "warning.main" }} />;
          }
          if (somePosters) {
            return <CheckCircleOutlineIcon sx={{ fontSize: "1.1rem", color: "warning.main" }} />;
          }
          if (hasAnyExtras) {
            return <CheckCircleIcon sx={{ fontSize: "1.1rem", color: "text.disabled" }} />;
          }
          return <CheckCircleOutlineIcon sx={{ fontSize: "1.1rem", color: "text.disabled" }} />;
        }

        const checkCell = (has: boolean) => (
          <TableCell align="center" sx={{ py: 0.75 }}>
            {has && <CheckIcon sx={{ fontSize: "0.9rem", color: "success.main" }} />}
          </TableCell>
        );

        return (
          <Stack spacing={2}>
            {sidebarCollections.length === 0 ? (
              <EmptyListState
                icon={<LayersOutlinedIcon sx={{ fontSize: "4rem" }} />}
                title={t("noCollections")}
                description={t("noCollectionsHint")}
                actionLabel={t("addCollection")}
                onAction={() => setAddMovieOpen(true)}
              />
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 32, p: 0.75 }} />
                    <TableCell sx={{ fontWeight: 700 }}>{t("collections")}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("colMovies")}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("colMoviePosters")}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("sectionCollection")}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("sectionBackdrop")}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("sectionSquare")}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("sectionLogo")}</TableCell>
                    <TableCell sx={{ width: 32, p: 0 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sidebarCollections.map((g) => {
                    const tmdb = collectionTmdbMap.get(g.tmdbId);
                    const movieCount = tmdb ? tmdb.parts.length : null;
                    const stats = collStats(g.tmdbId);
                    return (
                      <TableRow
                        key={g.key}
                        hover
                        sx={{ cursor: "pointer" }}
                        onClick={() => navigateToDetail(g.key)}
                      >
                        <TableCell sx={{ py: 0.75, px: 1, width: 32 }}>
                          {statusIcon(stats, movieCount)}
                        </TableCell>
                        <TableCell sx={{ py: 0.75 }}>
                          <Typography variant="body2" noWrap>{g.title}</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ py: 0.75 }}>
                          <Typography variant="body2" color="text.secondary">
                            {movieCount ?? (collectionTmdbMap.has(g.tmdbId) ? "—" : "…")}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ py: 0.75 }}>
                          <Typography variant="body2" color={stats.artworkCount > 0 ? "text.primary" : "text.disabled"}>
                            {stats.artworkCount}
                          </Typography>
                        </TableCell>
                        {checkCell(stats.hasCollPoster)}
                        {checkCell(stats.hasBackdrop)}
                        {checkCell(stats.hasSquare)}
                        {checkCell(stats.hasLogo)}
                        <TableCell sx={{ py: 0, px: 0.5, width: 32 }} onClick={(e) => e.stopPropagation()}>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setRowMenuState({ anchor: e.currentTarget, group: g }); }}>
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Stack>
        );
      }

      if (listType === "movies") {
        function movieStats(tmdbId: number) {
          const themed = (p: PosterEntry) => activeThemeId === "" || p.media.theme_id === activeThemeId;
          const hasPoster = allPosters.some((p) =>
            p.media.type === "movie" && p.media.tmdb_id === tmdbId &&
            p.kind !== "logo" && p.kind !== "square" && themed(p)
          );
          const hasBackdrop = allPosters.some((p) =>
            p.media.type === "backdrop" && p.media.tmdb_id === tmdbId && themed(p)
          );
          const hasSquare = allPosters.some((p) =>
            p.media.type === "movie" && p.media.tmdb_id === tmdbId && p.kind === "square" && themed(p)
          );
          const hasLogo = allPosters.some((p) =>
            p.media.type === "movie" && p.media.tmdb_id === tmdbId && p.kind === "logo" && themed(p)
          );
          return { hasPoster, hasBackdrop, hasSquare, hasLogo };
        }

        function movieStatusIcon(stats: ReturnType<typeof movieStats>) {
          const allExtras = stats.hasBackdrop && stats.hasSquare && stats.hasLogo;
          if (stats.hasPoster && allExtras) return <CheckCircleIcon sx={{ fontSize: "1.1rem", color: "success.main" }} />;
          if (stats.hasPoster) return <CheckCircleOutlineIcon sx={{ fontSize: "1.1rem", color: "warning.main" }} />;
          if (stats.hasBackdrop || stats.hasSquare || stats.hasLogo) return <CheckCircleIcon sx={{ fontSize: "1.1rem", color: "text.disabled" }} />;
          return <CheckCircleOutlineIcon sx={{ fontSize: "1.1rem", color: "text.disabled" }} />;
        }

        const checkCell = (has: boolean) => (
          <TableCell align="center" sx={{ py: 0.75 }}>
            {has ? <CheckCircleOutlineIcon sx={{ fontSize: "1rem", color: "success.main" }} /> : null}
          </TableCell>
        );

        return (
          <Stack spacing={2}>
            {sidebarMovies.length === 0 ? (
              <EmptyListState
                icon={<MovieOutlinedIcon sx={{ fontSize: "4rem" }} />}
                title={t("noMovies")}
                description={t("noMoviesHint")}
                actionLabel={t("addMovie")}
                onAction={() => setAddMovieOpen(true)}
              />
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 32, p: 0.75 }} />
                    <TableCell sx={{ fontWeight: 700 }}>{t("movies")}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("colPoster")}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("sectionBackdrop")}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("sectionSquare")}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("sectionLogo")}</TableCell>
                    <TableCell sx={{ width: 32, p: 0 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sidebarMovies.map((g) => {
                    const stats = movieStats(g.tmdbId);
                    return (
                      <TableRow key={g.key} hover sx={{ cursor: "pointer" }} onClick={() => navigateToDetail(g.key)}>
                        <TableCell sx={{ py: 0.75, px: 1, width: 32 }}>{movieStatusIcon(stats)}</TableCell>
                        <TableCell sx={{ py: 0.75 }}><Typography variant="body2" noWrap>{g.title}</Typography></TableCell>
                        {checkCell(stats.hasPoster)}
                        {checkCell(stats.hasBackdrop)}
                        {checkCell(stats.hasSquare)}
                        {checkCell(stats.hasLogo)}
                        <TableCell sx={{ py: 0, px: 0.5, width: 32 }} onClick={(e) => e.stopPropagation()}>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setRowMenuState({ anchor: e.currentTarget, group: g }); }}>
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Stack>
        );
      }

      if (listType === "tv") {
        function tvShowStats(showId: number) {
          const themed = (p: PosterEntry) => activeThemeId === "" || p.media.theme_id === activeThemeId;
          const seasonPosterIds = new Set(
            allPosters.filter((p) =>
              p.media.type === "season" && p.media.show_tmdb_id === showId &&
              p.media.season_number != null && themed(p)
            ).map((p) => p.media.season_number!)
          );
          const episodeCardCount = allPosters.filter((p) =>
            p.media.type === "episode" && p.media.show_tmdb_id === showId && themed(p)
          ).length;
          const hasShowPoster = allPosters.some((p) =>
            p.media.type === "show" && p.media.tmdb_id === showId &&
            p.kind !== "logo" && p.kind !== "square" && themed(p)
          );
          const hasBackdrop = allPosters.some((p) =>
            p.media.type === "backdrop" && p.media.show_tmdb_id === showId && themed(p)
          );
          const hasSquare = allPosters.some((p) =>
            p.media.type === "show" && p.media.tmdb_id === showId && p.kind === "square" && themed(p)
          );
          const hasLogo = allPosters.some((p) =>
            p.media.type === "show" && p.media.tmdb_id === showId && p.kind === "logo" && themed(p)
          );
          return { seasonPosterCount: seasonPosterIds.size, episodeCardCount, hasShowPoster, hasBackdrop, hasSquare, hasLogo };
        }

        function tvStatusIcon(stats: ReturnType<typeof tvShowStats>, seasonCount: number | null) {
          const allExtras = stats.hasShowPoster && stats.hasBackdrop && stats.hasSquare && stats.hasLogo;
          const hasAnyExtras = stats.hasShowPoster || stats.hasBackdrop || stats.hasSquare || stats.hasLogo;
          const allSeasons = seasonCount !== null && seasonCount > 0 && stats.seasonPosterCount >= seasonCount;
          const someSeasons = stats.seasonPosterCount > 0;
          if (allSeasons && allExtras) return <CheckCircleIcon sx={{ fontSize: "1.1rem", color: "success.main" }} />;
          if (allSeasons) return <CheckCircleIcon sx={{ fontSize: "1.1rem", color: "warning.main" }} />;
          if (someSeasons) return <CheckCircleOutlineIcon sx={{ fontSize: "1.1rem", color: "warning.main" }} />;
          if (hasAnyExtras) return <CheckCircleIcon sx={{ fontSize: "1.1rem", color: "text.disabled" }} />;
          return <CheckCircleOutlineIcon sx={{ fontSize: "1.1rem", color: "text.disabled" }} />;
        }

        const checkCell = (has: boolean) => (
          <TableCell align="center" sx={{ py: 0.75 }}>
            {has ? <CheckCircleOutlineIcon sx={{ fontSize: "1rem", color: "success.main" }} /> : null}
          </TableCell>
        );

        return (
          <Stack spacing={2}>
            {sidebarTvShows.length === 0 ? (
              <EmptyListState
                icon={<TvOutlinedIcon sx={{ fontSize: "4rem" }} />}
                title={t("noTvShows")}
                description={t("noTvShowsHint")}
                actionLabel={t("addShow")}
                onAction={() => setAddShowOpen(true)}
              />
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 32, p: 0.75 }} />
                    <TableCell sx={{ fontWeight: 700 }}>{t("tvShows")}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("colSeasons")}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("colSeasonPosters")}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("colEpisodeCards")}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("colShowPoster")}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("sectionBackdrop")}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("sectionSquare")}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t("sectionLogo")}</TableCell>
                    <TableCell sx={{ width: 32, p: 0 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sidebarTvShows.map((g) => {
                    const tmdb = showTmdbMap.get(g.tmdbId);
                    const seasonCount = tmdb ? tmdb.seasons.filter((s) => s.season_number > 0).length : null;
                    const stats = tvShowStats(g.tmdbId);
                    return (
                      <TableRow key={g.key} hover sx={{ cursor: "pointer" }} onClick={() => navigateToDetail(g.key)}>
                        <TableCell sx={{ py: 0.75, px: 1, width: 32 }}>{tvStatusIcon(stats, seasonCount)}</TableCell>
                        <TableCell sx={{ py: 0.75 }}><Typography variant="body2" noWrap>{g.title}</Typography></TableCell>
                        <TableCell align="right" sx={{ py: 0.75 }}>
                          <Typography variant="body2" color="text.secondary">
                            {seasonCount ?? (showTmdbMap.has(g.tmdbId) ? "—" : "…")}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ py: 0.75 }}>
                          <Typography variant="body2" color={stats.seasonPosterCount > 0 ? "text.primary" : "text.disabled"}>
                            {stats.seasonPosterCount}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ py: 0.75 }}>
                          <Typography variant="body2" color={stats.episodeCardCount > 0 ? "text.primary" : "text.disabled"}>
                            {stats.episodeCardCount}
                          </Typography>
                        </TableCell>
                        {checkCell(stats.hasShowPoster)}
                        {checkCell(stats.hasBackdrop)}
                        {checkCell(stats.hasSquare)}
                        {checkCell(stats.hasLogo)}
                        <TableCell sx={{ py: 0, px: 0.5, width: 32 }} onClick={(e) => e.stopPropagation()}>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setRowMenuState({ anchor: e.currentTarget, group: g }); }}>
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Stack>
        );
      }
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
          <TvShowDetailView showTmdbId={showId} posters={posters} tmdbData={tmdbTvShowData} tmdbState={tmdbTvShowState} callbacks={studioCallbacks} />
        );
      }
      if (nav.mediaKey.startsWith("collection:")) {
        const collId = Number(nav.mediaKey.split(":")[1]);
        return (
          <CollectionDetailView collectionTmdbId={collId} posters={posters} allPosters={allPosters} tmdbData={tmdbCollectionData} tmdbState={tmdbCollectionState} callbacks={studioCallbacks} />
        );
      }
      if (nav.mediaKey.startsWith("movie:")) {
        const movieId = Number(nav.mediaKey.split(":")[1]);
        return (
          <MovieDetailView movieTmdbId={movieId} title={group?.title ?? ""} posters={posters} allPosters={allPosters} tmdbData={tmdbMovieData} tmdbState={tmdbMovieState} callbacks={studioCallbacks} />
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
    return <StudioWelcome sessionExpired={sessionExpired} />;
  }

  if (!loading && conn && !conn.creatorId) {
    return <CreatorHandlePrompt />;
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const isMovieView = nav.view === "media" && nav.mediaKey.startsWith("movie:");

  // Back-to-list params — set when navigating from a list view to a detail view
  const fromListType = searchParams.get("fromListType") as "collections" | "movies" | "tv" | null;
  const fromListThemeId = searchParams.get("fromListThemeId");
  // Page title — shown below breadcrumbs in the scrollable area.
  // When fromListType is set for a media view, the detail view renders its own heading.
  const toolbarHeading = (() => {
    if (nav.view === "root") return null;
    if (nav.view === "list") {
      return nav.listType === "collections" ? t("collections")
        : nav.listType === "movies" ? t("movies")
        : t("tvShows");
    }
    if (nav.view === "theme") {
      return themes.find((th) => th.theme_id === nav.themeId)?.name ?? t("title");
    }
    if (nav.view === "media") {
      if (isMovieView) return null; // MovieDetailView renders its own h5
      if (fromListType) return null; // detail view renders its own heading when coming from list
      const group = sidebarCollections.find((g) => g.key === nav.mediaKey)
        ?? sidebarTvShows.find((g) => g.key === nav.mediaKey)
        ?? sidebarMovies.find((g) => g.key === nav.mediaKey)
        ?? mediaGroups.find((g) => g.key === nav.mediaKey);
      if (nav.mediaKey.startsWith("collection:")) return tmdbCollectionData?.name ?? group?.title ?? t("title");
      if (nav.mediaKey.startsWith("show:")) return tmdbTvShowData?.name ?? group?.title ?? t("title");
      return group?.title ?? t("title");
    }
    return t("title");
  })();

  // ─── Breadcrumbs ─────────────────────────────────────────────────────────────


  const defaultThemeId = themes[0]?.theme_id ?? "";

  const makeCrumb = (lt: "collections" | "movies" | "tv", clickable: boolean): PageCrumb => {
    const label = lt === "collections" ? t("collections") : lt === "movies" ? t("movies") : t("tvShows");
    return {
      label,
      onClick: clickable ? () => navigate({ view: "list", listType: lt, themeId: activeThemeId || defaultThemeId }) : undefined,
    };
  };

  const studioBreadcrumbs: PageCrumb[] = (() => {
    const home: PageCrumb = {
      label: <HomeIcon sx={{ fontSize: "1rem", verticalAlign: "text-bottom" }} />,
      onClick: () => navigate({ view: "root" }),
    };
    const homeCurrent: PageCrumb = {
      label: <HomeIcon sx={{ fontSize: "1rem", verticalAlign: "text-bottom" }} />,
    };

    if (nav.view === "root") return [homeCurrent];

    if (nav.view === "list") return [home, makeCrumb(nav.listType, false)];

    if (nav.view === "media") {
      if (isMovieView) {
        const movieName = tmdbMovieData?.title ?? nav.mediaKey.replace("movie:", "");
        if (tmdbMovieData?.belongs_to_collection) {
          const coll = tmdbMovieData.belongs_to_collection;
          return [
            home,
            makeCrumb("collections", true),
            {
              label: coll.name,
              onClick: () => {
                const p = new URLSearchParams(searchParams.toString());
                p.set("view", "media"); p.set("key", `collection:${coll.id}`);
                p.delete("fromListType"); p.delete("fromListThemeId");
                router.push(`/studio?${p.toString()}`);
              },
            },
            { label: movieName },
          ];
        }
        return [home, makeCrumb("movies", true), { label: movieName }];
      }
      if (nav.mediaKey.startsWith("collection:")) {
        const name = tmdbCollectionData?.name ?? sidebarCollections.find((g) => g.key === nav.mediaKey)?.title ?? nav.mediaKey;
        return [home, makeCrumb("collections", true), { label: name }];
      }
      if (nav.mediaKey.startsWith("show:")) {
        const name = tmdbTvShowData?.name ?? sidebarTvShows.find((g) => g.key === nav.mediaKey)?.title ?? nav.mediaKey;
        return [home, makeCrumb("tv", true), { label: name }];
      }
      const group = sidebarMovies.find((g) => g.key === nav.mediaKey) ?? mediaGroups.find((g) => g.key === nav.mediaKey);
      return [home, { label: group?.title ?? nav.mediaKey }];
    }

    return [homeCurrent];
  })();

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
        {/* ── NEW THEME button ── */}
        <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}>
          <Button
            startIcon={<AddIcon />}
            size="small"
            fullWidth
            variant="text"
            sx={{ justifyContent: "flex-start", fontWeight: 700, color: "text.primary" }}
            onClick={() => { setEditingTheme(null); setThemeModalOpen(true); }}
          >
            {t("newTheme")}
          </Button>
        </Box>

        {/* ── One accordion per theme ── */}
        {themes.map((theme) => (
          <Accordion
            key={theme.theme_id}
            disableGutters
            elevation={0}
            expanded={expandedSections.has(theme.theme_id)}
            onChange={() => toggleSection(theme.theme_id)}
            sx={{ "&:before": { display: "none" }, bgcolor: "transparent" }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ fontSize: "1rem" }} />}
              sx={{ minHeight: 36, px: 1.5, "& .MuiAccordionSummary-content": { m: 0, alignItems: "center", gap: 1 } }}
            >
              <LayersOutlinedIcon sx={{ fontSize: "0.85rem", color: "text.secondary", flexShrink: 0 }} />
              <Typography variant="body2" fontWeight={700} noWrap sx={{ flex: 1 }}>{theme.name}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              {(() => {
                const activeList = nav.view === "list" ? nav : null;
                const isTheme = activeList?.themeId === theme.theme_id;
                return (
                  <List dense disablePadding>
                    <ListItemButton
                      selected={isTheme && activeList?.listType === "collections"}
                      onClick={() => navigate({ view: "list", listType: "collections", themeId: theme.theme_id })}
                      sx={{ pl: 4 }}
                    >
                      <MovieOutlinedIcon sx={{ fontSize: "0.85rem", mr: 1, color: "text.secondary", flexShrink: 0 }} />
                      <ListItemText primary={t("collections")} slotProps={{ primary: { variant: "body2", noWrap: true } }} />
                      {sidebarCollections.length > 0 && (() => {
                        const total = sidebarCollections.length;
                        const active = sidebarCollections.filter((g) =>
                          allPosters.some((p) =>
                            ((p.media.type === "collection" && p.media.tmdb_id === g.tmdbId) || p.media.collection_tmdb_id === g.tmdbId) &&
                            p.media.theme_id === theme.theme_id
                          )
                        ).length;
                        return (
                          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, ml: 0.5 }}>{active} / {total}</Typography>
                        );
                      })()}
                    </ListItemButton>
                    <ListItemButton
                      selected={isTheme && activeList?.listType === "movies"}
                      onClick={() => navigate({ view: "list", listType: "movies", themeId: theme.theme_id })}
                      sx={{ pl: 4 }}
                    >
                      <MovieOutlinedIcon sx={{ fontSize: "0.85rem", mr: 1, color: "text.secondary", flexShrink: 0 }} />
                      <ListItemText primary={t("movies")} slotProps={{ primary: { variant: "body2", noWrap: true } }} />
                      {(() => {
                        const total = sidebarMovies.length;
                        if (total === 0) return null;
                        const active = sidebarMovies.filter((g) =>
                          allPosters.some((p) =>
                            p.media.tmdb_id === g.tmdbId &&
                            (p.media.type === "movie" || p.media.type === "backdrop") &&
                            (theme.theme_id === "" || p.media.theme_id === theme.theme_id)
                          )
                        ).length;
                        return <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, ml: 0.5 }}>{active} / {total}</Typography>;
                      })()}
                    </ListItemButton>
                    <ListItemButton
                      selected={isTheme && activeList?.listType === "tv"}
                      onClick={() => navigate({ view: "list", listType: "tv", themeId: theme.theme_id })}
                      sx={{ pl: 4 }}
                    >
                      <TvOutlinedIcon sx={{ fontSize: "0.85rem", mr: 1, color: "text.secondary", flexShrink: 0 }} />
                      <ListItemText primary={t("tvShows")} slotProps={{ primary: { variant: "body2", noWrap: true } }} />
                      {(() => {
                        const total = sidebarTvShows.length;
                        if (total === 0) return null;
                        const active = sidebarTvShows.filter((g) =>
                          allPosters.some((p) =>
                            (p.media.tmdb_id === g.tmdbId || p.media.show_tmdb_id === g.tmdbId) &&
                            (theme.theme_id === "" || p.media.theme_id === theme.theme_id)
                          )
                        ).length;
                        return <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, ml: 0.5 }}>{active} / {total}</Typography>;
                      })()}
                    </ListItemButton>
                  </List>
                );
              })()}
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>

      {/* Main content */}
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Fixed toolbar */}
        <Box sx={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          minHeight: 48,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}>
          <Box sx={{ flex: 1 }} />
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
          {nav.view === "list" && (
            <IconButton
              size="small"
              onClick={() => nav.listType === "tv" ? setAddShowOpen(true) : setAddMovieOpen(true)}
              aria-label={nav.listType === "tv" ? t("addShow") : nav.listType === "collections" ? t("addCollection") : t("addMovie")}
            >
              <AddIcon />
            </IconButton>
          )}
          {zipContext && (
            <Button
              startIcon={<UnarchiveOutlinedIcon />}
              size="small"
              variant="outlined"
              onClick={() => { setZipImportConfig(zipContext); setZipImportOpen(true); }}
            >
              {t("importZip")}
            </Button>
          )}
          <Button
            startIcon={<FileUploadOutlinedIcon />}
            size="small"
            onClick={() => { setUploadPreFill({ themeId: activeThemeId }); setUploadDrawerOpen(true); }}
          >
            {t("upload")}
          </Button>
        </Box>

        {/* Scrollable content area */}
        <Box sx={{ flex: 1, overflowY: "auto", "& [data-type-chip]": { display: "none" } }}>
          <Box sx={{ px: 3, pt: 2, pb: 3 }}>
            <PageHeader
              crumbs={studioBreadcrumbs}
              title={toolbarHeading && nav.view !== "root" && !(
                nav.view === "list" && (
                  (nav.listType === "collections" && sidebarCollections.length === 0) ||
                  (nav.listType === "movies" && sidebarMovies.length === 0) ||
                  (nav.listType === "tv" && sidebarTvShows.length === 0)
                )
              ) ? toolbarHeading : undefined}
            />
            {loading ? (
              <Typography color="text.secondary">{tc("loading")}</Typography>
            ) : (
              renderMain()
            )}
          </Box>
        </Box>
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

      {/* Row context menu (⋮ on list view rows and root cards) */}
      <Menu anchorEl={rowMenuState?.anchor} open={!!rowMenuState} onClose={() => setRowMenuState(null)}>
        <MenuItem onClick={() => { setUnpinConfirm({ group: rowMenuState!.group }); setRowMenuState(null); }}>
          {t("removeFromStudio")}
        </MenuItem>
      </Menu>

      {/* Remove from Studio confirmation dialog */}
      <Dialog open={!!unpinConfirm} onClose={() => setUnpinConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("removeFromStudioTitle")}</DialogTitle>
        <DialogContent>
          <Typography>{t("removeFromStudioBody", { title: unpinConfirm?.group.title ?? "" })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnpinConfirm(null)}>{tc("cancel")}</Button>
          <Button variant="contained" onClick={() => unpinConfirm && handleUnpinGroup(unpinConfirm.group)}>
            {t("removeFromStudio")}
          </Button>
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

      {/* ZIP import dialog */}
      {zipImportConfig && (
        <ZipImportDialog
          open={zipImportOpen}
          onClose={() => setZipImportOpen(false)}
          config={zipImportConfig}
          conn={conn}
          onComplete={() => { void loadData(); }}
          allPosters={allPosters}
          themes={themes}
        />
      )}

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

      {/* Delete theme confirmation — requires typing the theme name */}
      <Dialog open={!!deleteThemeConfirm} onClose={() => setDeleteThemeConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("deleteThemeTitle")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2">{t("deleteThemeBody", { title: deleteThemeConfirm?.name ?? "", count: deleteThemeConfirm?.poster_count ?? 0 })}</Typography>
            <TextField
              label={t("deleteThemeTypeLabel")}
              value={deleteThemeNameInput}
              onChange={(e) => setDeleteThemeNameInput(e.target.value)}
              placeholder={deleteThemeConfirm?.name ?? ""}
              size="small"
              fullWidth
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteThemeConfirm(null)}>{tc("cancel")}</Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleteThemeNameInput !== deleteThemeConfirm?.name}
            onClick={() => void confirmDeleteTheme()}
          >
            {t("deleteTheme")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
