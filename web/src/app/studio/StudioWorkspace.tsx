"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

import { ARTWORK_LANGUAGE_CODES, getLanguageLabel, getLanguageFlag } from "@/lib/artwork-languages";
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
import Snackbar from "@mui/material/Snackbar";
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
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import AddIcon from "@mui/icons-material/Add";
import HomeIcon from "@mui/icons-material/Home";
import CheckIcon from "@mui/icons-material/Check";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import TvOutlinedIcon from "@mui/icons-material/TvOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import LanguageIcon from "@mui/icons-material/Language";
import TableRowsOutlinedIcon from "@mui/icons-material/TableRowsOutlined";

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
import ArtworkCardFrame from "@/components/ArtworkCardFrame";
import ArtworkPlaceholder from "@/components/ArtworkPlaceholder";
import { cardMediaSurfaceSx } from "@/components/cardSurface";
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

function dedupeByLogicalSlot(posters: PosterEntry[]): PosterEntry[] {
  const latestByKey = new Map<string, PosterEntry>();
  for (const poster of posters) {
    let key: string;
    if (poster.media.type === "collection") {
      key = [
        "collection",
        poster.kind ?? "poster",
        poster.media.tmdb_id ?? "",
        poster.language ?? "",
        poster.media.theme_id ?? "",
      ].join("|");
    } else if (poster.media.type === "show") {
      key = [
        "show",
        poster.kind ?? "poster",
        poster.media.tmdb_id ?? "",
        poster.language ?? "",
        poster.media.theme_id ?? "",
      ].join("|");
    } else {
      key = [
        poster.media.type,
        poster.kind ?? "poster",
        poster.media.tmdb_id ?? "",
        poster.media.show_tmdb_id ?? "",
        poster.media.collection_tmdb_id ?? "",
        poster.media.season_number ?? "",
        poster.media.episode_number ?? "",
        poster.language ?? "",
        poster.media.theme_id ?? "",
      ].join("|");
    }
    latestByKey.set(key, poster);
  }
  return [...latestByKey.values()];
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
  activeLanguage: string;
  handleMoveAllPosters: (posterIds: string[], themeId: string | null) => void;
  onChangeLanguage: (posterId: string, lang: string | null) => void;
  handleChangeLanguageAllPosters: (posterIds: string[], lang: string | null) => void;
};

// ─── Module-scope sub-components ─────────────────────────────────────────────

const STUDIO_GLASS_PANEL_SX = {
  backgroundColor: (theme: { palette: { mode: "light" | "dark" } }) =>
    theme.palette.mode === "light"
      ? "rgba(255, 255, 255, 0.1)"
      : "rgba(18, 18, 20, 0.1)",
  backdropFilter: "blur(16px) saturate(150%)",
  WebkitBackdropFilter: "blur(16px) saturate(150%)",
  boxShadow: (theme: { palette: { mode: "light" | "dark" } }) =>
    theme.palette.mode === "light"
      ? "inset 0 1px 0 rgba(255,255,255,0.5)"
      : "inset 0 1px 0 rgba(255,255,255,0.08)",
} as const;

function StudioStickySelectionBar({
  label,
  checked,
  indeterminate,
  selectedCount,
  onToggle,
}: {
  label: string;
  checked: boolean;
  indeterminate: boolean;
  selectedCount: number;
  onToggle: () => void;
}) {
  return (
    <Box
      sx={{
        px: 3,
        pt: 0,
        pb: 1.5,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ minHeight: 24 }}>
        <Checkbox
          size="small"
          checked={checked}
          indeterminate={indeterminate}
          onChange={onToggle}
          sx={{ p: 0 }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ cursor: "pointer", "&:hover": { color: "text.primary" } }}
          onClick={onToggle}
        >
          {label}
        </Typography>
        {selectedCount > 0 && (
          <Typography variant="caption" color="text.disabled">
            {selectedCount} selected
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

// Session-level cache for placeholder images — avoids re-fetching on every navigation
const placeholderCache = new Map<string, string | null>();
async function cachedFetch(key: string, fetcher: () => Promise<string | null>): Promise<string | null> {
  if (placeholderCache.has(key)) return placeholderCache.get(key)!;
  const result = await fetcher();
  placeholderCache.set(key, result);
  return result;
}

function StudioStatusBar({ published }: { published: boolean }) {
  return (
    <Box sx={{ bgcolor: published ? "success.main" : "warning.main", height: 3 }} />
  );
}

/** Language badge for the top-left of Studio cards. Shows flag + uppercase code. */
function LanguageChip({ language }: { language: string }) {
  const flag = getLanguageFlag(language);
  return (
    <Box sx={{ position: "absolute", top: 3, left: 0, pointerEvents: "none", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.9))" }}>
      <CardChip label={flag ? `${language.toUpperCase()} ${flag}` : language.toUpperCase()} color="light" />
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
        chip={false}
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
          <Box
            sx={{
              ...cardMediaSurfaceSx,
            }}
          >
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
      {poster.language && <LanguageChip language={poster.language} />}
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
            language: poster.language ?? undefined,
          })}
          onMove={(themeId) => callbacks.onMove(poster.poster_id, themeId)}
          onDelete={() => callbacks.onDelete(poster.poster_id)}
          onTogglePublished={() => callbacks.onTogglePublished(poster.poster_id, published)}
          onChangeLanguage={(lang) => callbacks.onChangeLanguage(poster.poster_id, lang)}
        />
      </Box>
    </Box>
  );
}

function StudioTvPlaceholderCard({ label, imagePath, aspectRatio = "2 / 3", noChrome = false, isTransparent = false, chipLabel, chipColor = "warning", subtitle, subtitleHref, placeholderSource, activeLanguage, onUpload, onCardClick }: {
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
  /** Active studio language — shows language badge instead of type chip when set. */
  activeLanguage?: string;
  onUpload: () => void;
  /** When set, clicking anywhere on the card (outside the upload menu) navigates. */
  onCardClick?: () => void;
}) {
  const isLandscape = aspectRatio !== "2 / 3" && aspectRatio !== "1 / 1";
  // imagePath may be a full URL (fanart.tv / TMDB logo) or a TMDB path fragment
  const imgUrl = !imagePath ? null
    : imagePath.startsWith("http") ? imagePath
    : isLandscape ? tmdbStillUrl(imagePath) : tmdbImageUrl(imagePath);
  const overlaySource = placeholderSource ?? (imgUrl ? null : undefined);
  return (
    <ArtworkCardFrame
      media={
        <ArtworkPlaceholder
          aspectRatio={aspectRatio}
          alt={label}
          imageUrl={imgUrl}
          fit={isTransparent ? "contain" : "cover"}
          source={overlaySource}
        />
      }
      title={label}
      subtitle={subtitle}
      subtitleHref={subtitleHref}
      topLeftSlot={activeLanguage ? <LanguageChip language={activeLanguage} /> : <CardChip label={chipLabel} color={chipColor} />}
      menuSlot={<PosterActionsMenu onUpload={onUpload} />}
      statusBar={<Box sx={{ bgcolor: "error.main", height: 3 }} />}
      onClick={onCardClick}
      surfaceSx={noChrome ? undefined : undefined}
    />
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
  const isMissingArtwork = !imgUrl;
  return (
    <ArtworkCardFrame
      media={
        <ArtworkPlaceholder
          aspectRatio={aspectRatio}
          alt={movie.title}
          imageUrl={imgUrl}
          fit={isTransparent ? "contain" : "cover"}
          source={imgUrl ? "THEMOVIEDB.ORG" : (isMissingArtwork ? null : undefined)}
        />
      }
      title={movie.title}
      subtitle={subtitle ?? year ?? undefined}
      topLeftSlot={callbacks.activeLanguage ? <LanguageChip language={callbacks.activeLanguage} /> : <CardChip label={chipLabel} color={chipColor} />}
      menuSlot={
        <PosterActionsMenu
          onUpload={() => callbacks.onOpenUpload({ mediaType: uploadMediaType, kind: uploadKind, tmdbId: String(movie.id), title: movie.title, year, collectionTmdbId: String(collectionTmdbId), themeId: callbacks.activeThemeId, language: callbacks.activeLanguage || undefined, drawerLabel })}
        />
      }
      statusBar={<Box sx={{ bgcolor: "error.main", height: 3 }} />}
      onClick={onCardClick}
    />
  );
}

function StudioCollectionSectionHeading({
  label,
  ids,
  selected,
  setSelected,
  stats,
}: {
  label: string;
  ids?: string[];
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  stats?: { published: number; draft: number; missing: number };
}) {
  const sectionIds = ids ?? [];
  const hasPosters = sectionIds.length > 0;
  const allChecked = hasPosters && sectionIds.every((id) => selected.has(id));
  const someChecked = hasPosters && sectionIds.some((id) => selected.has(id));
  const statParts = [
    stats && stats.published > 0 ? { label: `${stats.published} PUBLISHED`, color: "success.main" } : null,
    stats && stats.draft > 0 ? { label: `${stats.draft} DRAFT`, color: "warning.main" } : null,
    stats && stats.missing > 0 ? { label: `${stats.missing} MISSING`, color: "error.main" } : null,
  ].filter(Boolean) as Array<{ label: string; color: string }>;
  function toggle() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) { sectionIds.forEach((id) => next.delete(id)); }
      else { sectionIds.forEach((id) => next.add(id)); }
      return next;
    });
  }
  return (
    <Stack spacing={0.35}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
        {hasPosters && (
          <Checkbox size="small" checked={allChecked} indeterminate={someChecked && !allChecked} onChange={toggle} sx={{ p: 0 }} />
        )}
        <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
          {label}
        </Typography>
      </Stack>
      {statParts.length > 0 && (
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: "wrap", minHeight: 18 }}>
          {statParts.map((part, index) => (
            <React.Fragment key={part.label}>
              {index > 0 && (
                <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 700 }}>
                  |
                </Typography>
              )}
              <Typography variant="caption" sx={{ fontWeight: 800, color: part.color, letterSpacing: "0.02em" }}>
                {part.label}
              </Typography>
            </React.Fragment>
          ))}
        </Stack>
      )}
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

  type AsyncPlaceholderResult = { key: string; url: string | null; source: "THEMOVIEDB.ORG" | "FANART.TV" | null };
  const [asyncResult, setAsyncResult] = useState<AsyncPlaceholderResult | null>(null);

  // Compute request key — null means no async fetch needed for this kind
  const requestKey =
    uploadKind === "logo" ? `logo:${movieTmdbId}`
    : uploadKind === "square" ? `square:${movieTmdbId}`
    : null;

  useEffect(() => {
    if (!requestKey) return;
    let cancelled = false;
    if (uploadKind === "logo") {
      void cachedFetch(requestKey, () => fetchMovieLogo(movieTmdbId)).then((url) => {
        if (!cancelled) setAsyncResult({ key: requestKey, url: url ?? null, source: url ? "THEMOVIEDB.ORG" : null });
      });
    } else if (uploadKind === "square") {
      void cachedFetch(requestKey, () => fetchMovieSquare(movieTmdbId)).then((url) => {
        if (!cancelled) setAsyncResult({ key: requestKey, url: url ?? null, source: url ? "FANART.TV" : null });
      });
    }
    return () => { cancelled = true; };
  }, [requestKey, movieTmdbId, uploadKind]);

  const chipLabel = uploadKind === "square" ? tp("square")
    : uploadKind === "logo" ? tp("logo")
    : uploadType === "backdrop" ? tp("backdrop")
    : tp("movie");
  const chipColor: "success" | "warning" = (uploadKind === "square" || uploadKind === "logo" || uploadType === "backdrop") ? "warning" : "success";

  const isTransparent = uploadKind === "logo" || uploadKind === "square";
  const rawImgPath = uploadType === "backdrop" ? tmdbData?.backdrop_path : tmdbData?.poster_path;
  const syncImgUrl = isTransparent || !rawImgPath ? null : tmdbImageUrl(rawImgPath);
  // Treat async result as stale if its key doesn't match current request — avoids synchronous reset in effect
  const resolvedAsync = asyncResult?.key === requestKey ? asyncResult : null;
  const imgUrl = (resolvedAsync?.url) ?? syncImgUrl;
  const placeholderSource: "THEMOVIEDB.ORG" | "FANART.TV" | null =
    (resolvedAsync?.source) ?? (syncImgUrl ? "THEMOVIEDB.ORG" : null);

  return (
    <ArtworkCardFrame
      media={
        <ArtworkPlaceholder
          aspectRatio={aspectRatio}
          alt={cleanTitle}
          imageUrl={imgUrl}
          fit={isTransparent ? "contain" : "cover"}
          source={placeholderSource ?? (imgUrl ? undefined : null)}
        />
      }
      title={cleanTitle}
      subtitle={year ?? undefined}
      topLeftSlot={callbacks.activeLanguage ? <LanguageChip language={callbacks.activeLanguage} /> : <CardChip label={chipLabel} color={chipColor} />}
      menuSlot={
        <PosterActionsMenu
          onUpload={() => callbacks.onOpenUpload({ mediaType: uploadType, tmdbId: String(movieTmdbId), title: cleanTitle, year, themeId: callbacks.activeThemeId, kind: uploadKind, language: callbacks.activeLanguage || undefined, drawerLabel: uploadKind === "square" ? t("drawerLabelSquareArtwork") : uploadKind === "logo" ? t("drawerLabelLogo") : uploadType === "backdrop" ? t("drawerLabelBackdrop") : t("drawerLabelMoviePoster") })}
        />
      }
      statusBar={<Box sx={{ bgcolor: "error.main", height: 3 }} />}
    />
  );
}

// ─── Detail view components (module scope) ────────────────────────────────────

function SeasonEpisodesView({ showTmdbId, seasonNumber, posters, tmdbData, callbacks, setHeaderExtra }: {
  showTmdbId: number;
  seasonNumber: number;
  posters: PosterEntry[];
  tmdbData: TmdbTvShow | null;
  callbacks: StudioCallbacks;
  setHeaderExtra: (node: React.ReactNode | null) => void;
}) {
  const t = useTranslations("studio");
  const tc = useTranslations("common");
  const tp = useTranslations("posterCard");
  const locale = useLocale();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  type EpisodeResult = { key: string; episodes: TmdbEpisode[]; status: "ok" | "error" };
  const [episodeResult, setEpisodeResult] = useState<EpisodeResult | null>(null);

  const episodesRequestKey = `${showTmdbId}:${seasonNumber}`;
  // Derive loading: result hasn't resolved for the current request key yet
  const episodesLoading = episodeResult?.key !== episodesRequestKey;
  const tmdbEpisodes = episodeResult?.key === episodesRequestKey ? episodeResult.episodes : [];

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
    let cancelled = false;
    fetchTmdbTvSeason(showTmdbId, seasonNumber)
      .then((data) => {
        if (!cancelled) setEpisodeResult({ key: episodesRequestKey, episodes: data?.episodes ?? [], status: "ok" });
      })
      .catch(() => {
        if (!cancelled) setEpisodeResult({ key: episodesRequestKey, episodes: [], status: "error" });
      });
    return () => { cancelled = true; };
  }, [showTmdbId, seasonNumber, episodesRequestKey]);

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
  const allSelectedPosters = epPostersForSeason;

  useEffect(() => {
    setHeaderExtra(epPostersForSeason.length > 0 ? (
      <StudioStickySelectionBar
        label={selected.size > 0 && selected.size === epPostersForSeason.length ? t("deselectAll") : t("selectAll")}
        checked={selected.size > 0 && selected.size === epPostersForSeason.length}
        indeterminate={selected.size > 0 && selected.size < epPostersForSeason.length}
        selectedCount={selected.size}
        onToggle={() => (selected.size > 0 && selected.size === epPostersForSeason.length) ? selectNone() : setSelected(new Set(epPostersForSeason.map((p) => p.poster_id)))}
      />
    ) : null);
  }, [epPostersForSeason.length, selected.size, t, setHeaderExtra]);

  return (
    <Stack spacing={3}>
      {episodesLoading && (
        <Typography variant="caption" color="text.disabled">{t("loadingEpisodes")}</Typography>
      )}
      {(tmdbEpisodes.length > 0 || epPostersForSeason.length > 0) && (
        <Stack spacing={1}>
          <StudioCollectionSectionHeading
            label={t("sectionEpisodes")}
            ids={epPostersForSeason.map((p) => p.poster_id)}
            selected={selected}
            setSelected={setSelected}
            stats={{ published: publishedEps, draft: draftEps, missing: missingEps }}
          />
          <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
            {tmdbEpisodes.length > 0
              ? tmdbEpisodes.map((ep: TmdbEpisode) => {
                  const existing = uploadedEpisodePosters.get(ep.episode_number);
                  const epLabel = `Episode ${String(ep.episode_number).padStart(2, "0")}`;
                  const epSubtitle = ep.name && !/^episode\s+\d+$/i.test(ep.name.trim()) ? ep.name : undefined;
                  return (
                    <Box key={ep.episode_number}>
                      {existing
                        ? <StudioPosterCard poster={existing} selected={selected.has(existing.poster_id)} onToggleSelect={() => toggleSelect(existing.poster_id)} callbacks={callbacks} titleOverride={epLabel} subtitle={epSubtitle} />
                        : <StudioTvPlaceholderCard label={epLabel} subtitle={epSubtitle} imagePath={ep.still_path} aspectRatio="16 / 9" noChrome chipLabel={tp("episode")} chipColor="success" onUpload={() => callbacks.onOpenUpload({ mediaType: "episode", showTmdbId: String(showTmdbId), tmdbId: String(showTmdbId), seasonNumber: String(seasonNumber), episodeNumber: String(ep.episode_number), title: ep.name, themeId: callbacks.activeThemeId, language: callbacks.activeLanguage || undefined })} activeLanguage={callbacks.activeLanguage || undefined} />
                      }
                    </Box>
                  );
                })
              : epPostersForSeason.sort((a, b) => (a.media.episode_number ?? 0) - (b.media.episode_number ?? 0)).map((p) => {
                  const epLabel = p.media.episode_number != null ? `Episode ${String(p.media.episode_number).padStart(2, "0")}` : (p.media.title ?? "Episode");
                  const epSubtitle = p.media.title && !/^episode\s+\d+$/i.test(p.media.title.trim()) ? p.media.title : undefined;
                  return (
                    <Box key={p.poster_id}>
                      <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} titleOverride={epLabel} subtitle={epSubtitle} />
                    </Box>
                  );
                })
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
                <Select size="small" displayEmpty value="" onChange={(e) => { const val = e.target.value as string; void callbacks.handleChangeLanguageAllPosters([...selected], val === "__textless__" ? null : val); selectNone(); }} sx={{ fontSize: "0.75rem", minWidth: 160 }} renderValue={() => t("changeLanguage")}>
                  <MenuItem value="__textless__">{t("languageNeutral")}</MenuItem>
                  {ARTWORK_LANGUAGE_CODES.map((code) => (<MenuItem key={code} value={code}>{getLanguageLabel(code, locale)}</MenuItem>))}
                </Select>
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

function TvShowDetailView({ showTmdbId, posters, tmdbData, tmdbState, callbacks, setHeaderExtra }: {
  showTmdbId: number;
  posters: PosterEntry[];
  tmdbData: TmdbTvShow | null;
  tmdbState: "idle" | "loading" | "ok" | "error";
  callbacks: StudioCallbacks;
  setHeaderExtra: (node: React.ReactNode | null) => void;
}) {
  const t = useTranslations("studio");
  const tc = useTranslations("common");
  const tp = useTranslations("posterCard");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const debugEnabled = searchParams.get("debug") === "true";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const showYear = tmdbData?.first_air_date?.slice(0, 4) ?? undefined;

  type TvAsyncArt = { key: number; logoUrl: string | null; squareUrl: string | null };
  const [tvAsyncArt, setTvAsyncArt] = useState<TvAsyncArt | null>(null);
  // Treat as stale if key doesn't match — avoids synchronous reset in effect
  const tvLogoUrl = tvAsyncArt?.key === showTmdbId ? tvAsyncArt.logoUrl : null;
  const tvSquareUrl = tvAsyncArt?.key === showTmdbId ? tvAsyncArt.squareUrl : null;
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchTvLogo(showTmdbId),
      fetchTvSquare(showTmdbId),
    ]).then(([logo, square]) => {
      if (!cancelled) setTvAsyncArt({ key: showTmdbId, logoUrl: logo ?? null, squareUrl: square ?? null });
    });
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
      language: callbacks.activeLanguage || undefined,
    });
    return () => { callbacks.onZipContextReady(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTmdbId, tmdbData, callbacks.activeThemeId, callbacks.activeLanguage]);

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
  const posterPublished = allPosterItems.filter((p) => p.published !== false).length;
  const posterDraft = allPosterItems.filter((p) => p.published === false).length;
  const posterMissing = (showPosters.length === 0 ? 1 : 0) + seasons.filter((s) => (uploadedSeasonPosters.get(s.season_number) ?? []).length === 0).length;
  const backdropPublished = allBackdropItems.filter((p) => p.published !== false).length;
  const backdropDraft = allBackdropItems.filter((p) => p.published === false).length;
  const backdropMissing = (backdropPosters.length === 0 ? 1 : 0) + seasons.filter((s) => (uploadedSeasonBackdrops.get(s.season_number) ?? []).length === 0).length;
  const squarePublished = showSquarePosters.filter((p) => p.published !== false).length;
  const squareDraft = showSquarePosters.filter((p) => p.published === false).length;
  const logoPublished = showLogoPosters.filter((p) => p.published !== false).length;
  const logoDraft = showLogoPosters.filter((p) => p.published === false).length;
  const tedRelevantPosters = showTmdbId === 201834
    ? posters.filter((p) => (p.media.tmdb_id ?? p.media.show_tmdb_id) === showTmdbId)
    : [];

  useEffect(() => {
    if (!debugEnabled || showTmdbId !== 201834) return;
    const relevantPosters = posters.filter((p) => (p.media.tmdb_id ?? p.media.show_tmdb_id) === showTmdbId);
    console.log("[Studio debug][ted]", {
      showTmdbId,
      activeThemeId: callbacks.activeThemeId,
      activeLanguage: callbacks.activeLanguage,
      postersCount: posters.length,
      relevantPosters: relevantPosters.map((p) => ({
        poster_id: p.poster_id,
        media_type: p.media.type,
        tmdb_id: p.media.tmdb_id ?? null,
        show_tmdb_id: p.media.show_tmdb_id ?? null,
        kind: p.kind ?? null,
        theme_id: p.media.theme_id ?? null,
        language: p.language ?? null,
        published: p.published ?? null,
        title: p.media.title ?? null,
      })),
      showPosters: showPosters.map((p) => ({
        poster_id: p.poster_id,
        media_type: p.media.type,
        kind: p.kind ?? null,
        theme_id: p.media.theme_id ?? null,
        language: p.language ?? null,
        published: p.published ?? null,
        title: p.media.title ?? null,
      })),
    });
  }, [showTmdbId, posters, showPosters, callbacks.activeThemeId, callbacks.activeLanguage, debugEnabled]);

  useEffect(() => {
    setHeaderExtra(allIds.length > 0 ? (
      <StudioStickySelectionBar
        label={allSelected ? t("deselectAll") : t("selectAll")}
        checked={allSelected}
        indeterminate={selected.size > 0 && !allSelected}
        selectedCount={selected.size}
        onToggle={() => allSelected ? selectNone() : selectAll()}
      />
    ) : null);
  }, [allIds.length, allSelected, selected.size, t, setHeaderExtra]);

  if (!isNaN(activeSeasonNumber)) {
    return (
      <SeasonEpisodesView
        showTmdbId={showTmdbId}
        seasonNumber={activeSeasonNumber}
        posters={posters}
        tmdbData={tmdbData}
        callbacks={callbacks}
        setHeaderExtra={setHeaderExtra}
      />
    );
  }

  return (
    <Box>
    <Stack spacing={3} sx={{ position: "relative", zIndex: 1 }}>
      {tmdbState === "error" && (
        <Alert severity="warning">
          TMDB data couldn&apos;t be loaded for show ID <strong>{showTmdbId}</strong> — placeholders won&apos;t be shown.
        </Alert>
      )}

      {debugEnabled && showTmdbId === 201834 && (
        <Alert severity="info" sx={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "0.75rem" }}>
          {[
            `DEBUG ted`,
            `theme=${callbacks.activeThemeId || "(none)"}`,
            `language=${callbacks.activeLanguage || "(none)"}`,
            `posters.length=${posters.length}`,
            `tedRelevantPosters=${tedRelevantPosters.length}`,
            `showPosters=${showPosters.length}`,
            ...tedRelevantPosters.map((p) => `- ${p.poster_id} type=${p.media.type} kind=${p.kind ?? "poster"} published=${String(p.published)} theme=${p.media.theme_id ?? "(none)"} lang=${p.language ?? "(none)"} title=${p.media.title ?? "(none)"}`),
          ].join("\n")}
        </Alert>
      )}

      {/* POSTERS: show poster + one slot per season (clickable → season detail) */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading
          label={t("sectionTvShowPoster")}
          ids={allPosterItems.map((p) => p.poster_id)}
          selected={selected}
          setSelected={setSelected}
          stats={{ published: posterPublished, draft: posterDraft, missing: posterMissing }}
        />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {showPosters.length > 0
            ? showPosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} titleOverride={tmdbData?.name ?? undefined} subtitle={showYear} />
                </Box>
              ))
            : (
                <Box>
                  <StudioTvPlaceholderCard label={showDisplayTitle ?? (tmdbData?.name ?? "Show")} imagePath={tmdbData?.poster_path} placeholderSource={tmdbData?.poster_path ? "THEMOVIEDB.ORG" : undefined} chipLabel={tp("tvBoxSet")} chipColor="error" subtitle={showCountsSubtitle} noChrome onUpload={() => callbacks.onOpenUpload({ mediaType: "show", tmdbId: String(showTmdbId), title: tmdbData?.name ?? "", themeId: callbacks.activeThemeId, language: callbacks.activeLanguage || undefined })} activeLanguage={callbacks.activeLanguage || undefined} />
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
                <StudioTvPlaceholderCard label={t("seasonTitle", { n: String(sn).padStart(2, "0") })} imagePath={season.poster_path} placeholderSource={season.poster_path ? "THEMOVIEDB.ORG" : undefined} chipLabel={tp("season")} chipColor="info" subtitle={episodeCountSubtitle} noChrome onCardClick={() => navigateToSeason(sn)} onUpload={() => callbacks.onOpenUpload({ mediaType: "season", showTmdbId: String(showTmdbId), tmdbId: String(showTmdbId), seasonNumber: String(sn), title: tmdbData?.name ?? "", themeId: callbacks.activeThemeId, language: callbacks.activeLanguage || undefined })} activeLanguage={callbacks.activeLanguage || undefined} />
              </Box>
            );
          })}
        </Box>
      </Stack>

      {/* BACKDROPS: show backdrop + one slot per season */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading
          label={t("sectionTvShowBackdrop")}
          ids={allBackdropItems.map((p) => p.poster_id)}
          selected={selected}
          setSelected={setSelected}
          stats={{ published: backdropPublished, draft: backdropDraft, missing: backdropMissing }}
        />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {backdropPosters.length > 0
            ? backdropPosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} subtitle={showYear} />
                </Box>
              ))
            : (
                <Box>
                  <StudioTvPlaceholderCard label={tmdbData?.name ?? "Show"} imagePath={tmdbData?.backdrop_path} placeholderSource={tmdbData?.backdrop_path ? "THEMOVIEDB.ORG" : undefined} aspectRatio="16 / 9" noChrome chipLabel={tp("backdrop")} chipColor="warning" subtitle={showYear} onUpload={() => callbacks.onOpenUpload({ mediaType: "backdrop", showTmdbId: String(showTmdbId), tmdbId: String(showTmdbId), title: tmdbData?.name ?? "", themeId: callbacks.activeThemeId, language: callbacks.activeLanguage || undefined })} activeLanguage={callbacks.activeLanguage || undefined} />
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
                <StudioTvPlaceholderCard label={t("seasonTitle", { n: String(sn).padStart(2, "0") })} imagePath={null} aspectRatio="16 / 9" noChrome chipLabel={tp("backdrop")} chipColor="warning" onCardClick={() => navigateToSeason(sn)} onUpload={() => callbacks.onOpenUpload({ mediaType: "backdrop", showTmdbId: String(showTmdbId), tmdbId: String(showTmdbId), seasonNumber: String(sn), title: tmdbData?.name ?? "", themeId: callbacks.activeThemeId, language: callbacks.activeLanguage || undefined })} activeLanguage={callbacks.activeLanguage || undefined} />
              </Box>
            );
          })}
        </Box>
      </Stack>

      {/* SQUARE */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading
          label={t("sectionSquareArtwork")}
          ids={showSquarePosters.map((p) => p.poster_id)}
          selected={selected}
          setSelected={setSelected}
          stats={{ published: squarePublished, draft: squareDraft, missing: showSquarePosters.length === 0 ? 1 : 0 }}
        />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {showSquarePosters.length > 0
            ? showSquarePosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} subtitle={showYear} />
                </Box>
              ))
            : (
                <Box>
                  <StudioTvPlaceholderCard label={tmdbData?.name ?? "Show"} imagePath={tvSquareUrl} placeholderSource={tvSquareUrl ? "FANART.TV" : undefined} aspectRatio="1 / 1" noChrome isTransparent chipLabel={tp("square")} chipColor="warning" subtitle={showYear} onUpload={() => callbacks.onOpenUpload({ mediaType: "show", kind: "square", tmdbId: String(showTmdbId), title: tmdbData?.name ?? "", themeId: callbacks.activeThemeId, language: callbacks.activeLanguage || undefined })} activeLanguage={callbacks.activeLanguage || undefined} />
                </Box>
              )
          }
        </Box>
      </Stack>

      {/* LOGO */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading
          label={t("sectionLogo")}
          ids={showLogoPosters.map((p) => p.poster_id)}
          selected={selected}
          setSelected={setSelected}
          stats={{ published: logoPublished, draft: logoDraft, missing: showLogoPosters.length === 0 ? 1 : 0 }}
        />
        <Box sx={{ display: "grid", gridTemplateColumns: BACKDROP_GRID_COLS, gap: GRID_GAP }}>
          {showLogoPosters.length > 0
            ? showLogoPosters.map((p) => (
                <Box key={p.poster_id}>
                  <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} subtitle={showYear} />
                </Box>
              ))
            : (
                <Box>
                  <StudioTvPlaceholderCard label={tmdbData?.name ?? "Show"} imagePath={tvLogoUrl} placeholderSource={tvLogoUrl ? "THEMOVIEDB.ORG" : undefined} aspectRatio="16 / 9" noChrome isTransparent chipLabel={tp("logo")} chipColor="warning" subtitle={showYear} onUpload={() => callbacks.onOpenUpload({ mediaType: "show", kind: "logo", tmdbId: String(showTmdbId), title: tmdbData?.name ?? "", themeId: callbacks.activeThemeId, language: callbacks.activeLanguage || undefined })} activeLanguage={callbacks.activeLanguage || undefined} />
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
                <Select size="small" displayEmpty value="" onChange={(e) => { const val = e.target.value as string; void callbacks.handleChangeLanguageAllPosters([...selected], val === "__textless__" ? null : val); selectNone(); }} sx={{ fontSize: "0.75rem", minWidth: 160 }} renderValue={() => t("changeLanguage")}>
                  <MenuItem value="__textless__">{t("languageNeutral")}</MenuItem>
                  {ARTWORK_LANGUAGE_CODES.map((code) => (<MenuItem key={code} value={code}>{getLanguageLabel(code, locale)}</MenuItem>))}
                </Select>
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

function CollectionDetailView({ collectionTmdbId, posters, allPosters, tmdbData, tmdbState, callbacks, setHeaderExtra }: { collectionTmdbId: number; posters: PosterEntry[]; allPosters: PosterEntry[]; tmdbData: TmdbCollection | null; tmdbState: "idle" | "loading" | "ok" | "error"; callbacks: StudioCallbacks; setHeaderExtra: (node: React.ReactNode | null) => void; }) {
  const t = useTranslations("studio");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
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
      language: callbacks.activeLanguage || undefined,
    });
    return () => { callbacks.onZipContextReady(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionTmdbId, tmdbData, callbacks.activeThemeId, callbacks.activeLanguage]);

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

  const collectionPosters = dedupeByLogicalSlot(posters.filter((p) => p.media.type === "collection" && p.kind !== "logo" && p.kind !== "square" && matchesTheme(p)));
  const collectionSquarePosters = dedupeByLogicalSlot(posters.filter((p) => p.media.type === "collection" && p.kind === "square" && matchesTheme(p)));
  const collectionLogoPosters = dedupeByLogicalSlot(posters.filter((p) => p.media.type === "collection" && p.kind === "logo" && matchesTheme(p)));

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
  const draftMovieCount = collectionMovieEntries.filter((p) => p.published === false).length;
  const totalMovieCount = tmdbMovies.length || uploadedMoviesByTmdbId.size;
  const missingMovieCount = tmdbMovies.length > 0 ? Math.max(0, tmdbMovies.length - collectionMovieEntries.length) : 0;
  const movieCountLabel = totalMovieCount > 0
    ? `${totalMovieCount} MOVIE${totalMovieCount !== 1 ? "S" : ""}`
    : "NO MOVIES";
  const collectionPosterPublished = collectionPosters.filter((p) => p.published !== false).length;
  const collectionPosterDraft = collectionPosters.filter((p) => p.published === false).length;
  const collectionBackdropPublished = backdropPosters.filter((p) => p.published !== false).length;
  const collectionBackdropDraft = backdropPosters.filter((p) => p.published === false).length;
  const collectionSquarePublished = collectionSquarePosters.filter((p) => p.published !== false).length;
  const collectionSquareDraft = collectionSquarePosters.filter((p) => p.published === false).length;
  const collectionLogoPublished = collectionLogoPosters.filter((p) => p.published !== false).length;
  const collectionLogoDraft = collectionLogoPosters.filter((p) => p.published === false).length;

  useEffect(() => {
    setHeaderExtra(allIds.length > 0 ? (
      <StudioStickySelectionBar
        label={allSelected ? t("deselectAll") : t("selectAll")}
        checked={allSelected}
        indeterminate={selected.size > 0 && !allSelected}
        selectedCount={selected.size}
        onToggle={() => allSelected ? selectNone() : selectAll()}
      />
    ) : null);
  }, [allIds.length, allSelected, selected.size, t, setHeaderExtra]);

  return (
    <Stack spacing={3}>
      {tmdbState === "error" && (
        <Alert severity="warning">
          TMDB data couldn&apos;t be loaded for collection ID <strong>{collectionTmdbId}</strong> — the ID on this poster may be wrong.
          Check <strong>themoviedb.org/collection/{collectionTmdbId}</strong> to verify, then re-upload with the correct ID.
        </Alert>
      )}

      {/* Collection poster */}
      <Stack spacing={1}>
        <StudioCollectionSectionHeading
          label={t("sectionCollection")}
          ids={collectionPosters.map((p) => p.poster_id)}
          selected={selected}
          setSelected={setSelected}
          stats={{ published: collectionPosterPublished, draft: collectionPosterDraft, missing: collectionPosters.length === 0 ? 1 : 0 }}
        />
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
              label={t("moviesHeading")}
              ids={movieIds}
              selected={selected}
              setSelected={setSelected}
              stats={{ published: publishedMovieCount, draft: draftMovieCount, missing: missingMovieCount }}
            />
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: POSTER_GRID_COLS,
                gap: GRID_GAP,
              }}
            >
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
        <StudioCollectionSectionHeading
          label={t("sectionBackdrop")}
          ids={backdropPosters.map((p) => p.poster_id)}
          selected={selected}
          setSelected={setSelected}
          stats={{ published: collectionBackdropPublished, draft: collectionBackdropDraft, missing: backdropPosters.length === 0 ? 1 : 0 }}
        />
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
        <StudioCollectionSectionHeading
          label={t("sectionSquareArtwork")}
          ids={collectionSquarePosters.map((p) => p.poster_id)}
          selected={selected}
          setSelected={setSelected}
          stats={{ published: collectionSquarePublished, draft: collectionSquareDraft, missing: collectionSquarePosters.length === 0 ? 1 : 0 }}
        />
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
        <StudioCollectionSectionHeading
          label={t("sectionLogo")}
          ids={collectionLogoPosters.map((p) => p.poster_id)}
          selected={selected}
          setSelected={setSelected}
          stats={{ published: collectionLogoPublished, draft: collectionLogoDraft, missing: collectionLogoPosters.length === 0 ? 1 : 0 }}
        />
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
              <Select size="small" displayEmpty value="" onChange={(e) => { const val = e.target.value as string; void callbacks.handleChangeLanguageAllPosters([...selected], val === "__textless__" ? null : val); selectNone(); }} sx={{ fontSize: "0.75rem", minWidth: 160 }} renderValue={() => t("changeLanguage")}>
                <MenuItem value="__textless__">{t("languageNeutral")}</MenuItem>
                {ARTWORK_LANGUAGE_CODES.map((code) => (<MenuItem key={code} value={code}>{getLanguageLabel(code, locale)}</MenuItem>))}
              </Select>
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

function MovieDetailView({ movieTmdbId, title, posters, allPosters, tmdbData, tmdbState, callbacks, setHeaderExtra }: {
  movieTmdbId: number;
  title: string;
  posters: PosterEntry[];
  allPosters: PosterEntry[];
  tmdbData: import("@/lib/tmdb").TmdbMovieDetail | null;
  tmdbState: "idle" | "loading" | "ok" | "error";
  callbacks: StudioCallbacks;
  setHeaderExtra: (node: React.ReactNode | null) => void;
}) {
  const t = useTranslations("studio");
  const tc = useTranslations("common");
  const locale = useLocale();
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

  useEffect(() => {
    setHeaderExtra(allIds.length > 0 ? (
      <StudioStickySelectionBar
        label={allSelected ? t("deselectAll") : t("selectAll")}
        checked={allSelected}
        indeterminate={selected.size > 0 && !allSelected}
        selectedCount={selected.size}
        onToggle={() => allSelected ? selectNone() : selectAll()}
      />
    ) : null);
  }, [allIds.length, allSelected, selected.size, t, setHeaderExtra]);

  const movieArtworkSections = [
    {
      key: "posters",
      label: t("sectionPosters"),
      ids: moviePosters.map((p) => p.poster_id),
      content: (
        moviePosters.length > 0
          ? moviePosters.map((p) => (
              <Box key={p.poster_id}>
                <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} titleOverride={cleanTitle} subtitle={year} />
              </Box>
            ))
          : tmdbState !== "loading" ? [
              <Box key="movie-placeholder">
                <StudioMoviePlaceholder tmdbData={tmdbData} movieTmdbId={movieTmdbId} cleanTitle={cleanTitle} year={year} aspectRatio="2 / 3" uploadType="movie" callbacks={callbacks} />
              </Box>,
            ] : []
      ),
    },
    {
      key: "backdrop",
      label: t("sectionBackdrop"),
      ids: backdropPosters.map((p) => p.poster_id),
      content: (
        backdropPosters.length > 0
          ? backdropPosters.map((p) => (
              <Box key={p.poster_id}>
                <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} titleOverride={cleanTitle} subtitle={year} />
              </Box>
            ))
          : tmdbState !== "loading" ? [
              <Box key="backdrop-placeholder">
                <StudioMoviePlaceholder tmdbData={tmdbData} movieTmdbId={movieTmdbId} cleanTitle={cleanTitle} year={year} aspectRatio="16 / 9" uploadType="backdrop" callbacks={callbacks} />
              </Box>,
            ] : []
      ),
    },
    {
      key: "square",
      label: t("sectionSquareArtwork"),
      ids: movieSquarePosters.map((p) => p.poster_id),
      content: (
        movieSquarePosters.length > 0
          ? movieSquarePosters.map((p) => (
              <Box key={p.poster_id}>
                <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} titleOverride={cleanTitle} subtitle={year} />
              </Box>
            ))
          : tmdbState !== "loading" ? [
              <Box key="square-placeholder">
                <StudioMoviePlaceholder tmdbData={tmdbData} movieTmdbId={movieTmdbId} cleanTitle={cleanTitle} year={year} aspectRatio="1 / 1" uploadType="movie" uploadKind="square" callbacks={callbacks} />
              </Box>,
            ] : []
      ),
    },
    {
      key: "logo",
      label: t("sectionLogo"),
      ids: movieLogoPosters.map((p) => p.poster_id),
      content: (
        movieLogoPosters.length > 0
          ? movieLogoPosters.map((p) => (
              <Box key={p.poster_id}>
                <StudioPosterCard poster={p} selected={selected.has(p.poster_id)} onToggleSelect={() => toggleSelect(p.poster_id)} callbacks={callbacks} titleOverride={cleanTitle} subtitle={year} />
              </Box>
            ))
          : tmdbState !== "loading" ? [
              <Box key="logo-placeholder">
                <StudioMoviePlaceholder tmdbData={tmdbData} movieTmdbId={movieTmdbId} cleanTitle={cleanTitle} year={year} aspectRatio="16 / 9" uploadType="movie" uploadKind="logo" callbacks={callbacks} />
              </Box>,
            ] : []
      ),
    },
  ];

  return (
    <Box>
    <Stack spacing={3} sx={{ position: "relative", zIndex: 1 }}>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 2,
          alignItems: "flex-start",
          "& > *": {
            flex: "1 1 260px",
            minWidth: 240,
            maxWidth: 340,
          },
        }}
      >
        {movieArtworkSections.map((section) => (
          <Stack key={section.key} spacing={1}>
            <StudioCollectionSectionHeading label={section.label} ids={section.ids} selected={selected} setSelected={setSelected} />
            {section.content}
          </Stack>
        ))}
      </Box>

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
                <Select size="small" displayEmpty value="" onChange={(e) => { const val = e.target.value as string; void callbacks.handleChangeLanguageAllPosters([...selected], val === "__textless__" ? null : val); selectNone(); }} sx={{ fontSize: "0.75rem", minWidth: 160 }} renderValue={() => t("changeLanguage")}>
                  <MenuItem value="__textless__">{t("languageNeutral")}</MenuItem>
                  {ARTWORK_LANGUAGE_CODES.map((code) => (<MenuItem key={code} value={code}>{getLanguageLabel(code, locale)}</MenuItem>))}
                </Select>
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

// ─── A-Z rail helpers ────────────────────────────────────────────────────────

const STUDIO_RAIL_LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];
const STUDIO_AZ_SCROLL_MARGIN = 80;

function studioSortKey(title: string) {
  return title.replace(/^(the|a|an)\s+/i, "").trim().toLowerCase();
}
function studioFirstLetter(title: string): string {
  const ch = studioSortKey(title)[0]?.toUpperCase() ?? "#";
  return /[A-Z]/.test(ch) ? ch : "#";
}
function studioGroupByLetter<T extends { title: string }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const letter = studioFirstLetter(item.title);
    if (!map.has(letter)) map.set(letter, []);
    map.get(letter)!.push(item);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function StudioAZRail({ available, scrollContainerRef }: {
  available: Set<string>;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
}) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const update = () => {
      const top = container.getBoundingClientRect().top;
      let found: string | null = null;
      for (const letter of STUDIO_RAIL_LETTERS) {
        if (!available.has(letter)) continue;
        const el = document.getElementById(`studio-az-${letter}`);
        if (el && el.getBoundingClientRect().top <= top + STUDIO_AZ_SCROLL_MARGIN + 8) found = letter;
      }
      setCurrent(found);
    };
    let raf: number | null = null;
    const onScroll = () => { if (raf !== null) return; raf = requestAnimationFrame(() => { raf = null; update(); }); };
    container.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => { container.removeEventListener("scroll", onScroll); if (raf !== null) cancelAnimationFrame(raf); };
  }, [available, scrollContainerRef]);

  return (
    <Box sx={{ position: "fixed", right: 6, top: "50%", transform: "translateY(-50%)", zIndex: 100, display: { xs: "none", md: "flex" }, flexDirection: "column", alignItems: "center", userSelect: "none" }}>
      {STUDIO_RAIL_LETTERS.map((letter) => {
        const active = available.has(letter);
        const isCurrent = letter === current;
        return (
          <Box key={letter} onClick={() => active && document.getElementById(`studio-az-${letter}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            sx={{ width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontSize: "0.6rem", fontWeight: isCurrent ? 900 : 700, bgcolor: isCurrent ? "warning.main" : "transparent", color: isCurrent ? "warning.contrastText" : active ? "text.secondary" : "text.disabled", cursor: active ? "pointer" : "default", "&:hover": active && !isCurrent ? { bgcolor: "warning.main", color: "warning.contrastText", opacity: 0.6 } : {} }}>
            {letter}
          </Box>
        );
      })}
    </Box>
  );
}

// ─── TMDB placeholder cards for grid view ────────────────────────────────────

/** Strips a trailing "(YYYY)" year from a title, returning the clean title and year separately. */
function stripYear(title: string): { cleanTitle: string; year: string | null } {
  const m = title.match(/^(.*)\s+\((\d{4})\)$/);
  if (m) return { cleanTitle: m[1], year: m[2] };
  return { cleanTitle: title, year: null };
}

/** Shared sx for the status icon overlay (bottom-right of image area). */
const GRID_STATUS_SX = {
  position: "absolute", bottom: 6, right: 6,
  lineHeight: 0, pointerEvents: "none",
  "& svg": {
    fontSize: "1.2rem",
    filter: "drop-shadow(0 0 2px rgba(255,255,255,0.9)) drop-shadow(0 1px 4px rgba(0,0,0,0.85))",
  },
} as const;

/** Shared sx for the kebab menu button (top-right of image area). */
const GRID_KEBAB_SX = {
  position: "absolute", top: 4, right: 4,
  bgcolor: "rgba(0,0,0,0.55)", color: "common.white",
  "&:hover": { bgcolor: "rgba(0,0,0,0.8)" },
  width: 28, height: 28,
} as const;

function TmdbPosterPlaceholder({ title, subtitle, posterPath, onClick, statusIcon, onMenuOpen }: {
  title: string;
  subtitle?: string;
  posterPath: string | null | undefined;
  onClick?: () => void;
  statusIcon?: React.ReactNode;
  onMenuOpen?: (anchor: HTMLElement) => void;
}) {
  const imgUrl = tmdbImageUrl(posterPath ?? null);
  return (
    <ArtworkCardFrame
      media={
        <ArtworkPlaceholder
          aspectRatio="2 / 3"
          alt={title}
          imageUrl={imgUrl}
          source={imgUrl ? "THEMOVIEDB.ORG" : null}
        />
      }
      title={title}
      subtitle={subtitle}
      statusBar={<Box sx={{ bgcolor: "error.main", height: 3 }} />}
      bottomRightSlot={statusIcon}
      menuSlot={onMenuOpen ? (
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onMenuOpen(e.currentTarget); }} sx={GRID_KEBAB_SX}>
          <MoreVertIcon sx={{ fontSize: "1rem" }} />
        </IconButton>
      ) : undefined}
      onClick={onClick}
    />
  );
}

function MovieGridPlaceholder({ tmdbId, title, onClick, statusIcon, onMenuOpen }: { tmdbId: number; title: string; onClick?: () => void; statusIcon?: React.ReactNode; onMenuOpen?: (anchor: HTMLElement) => void }) {
  const { cleanTitle, year: parsedYear } = stripYear(title);
  const [posterPath, setPosterPath] = useState<string | null | undefined>(undefined);
  const [tmdbYear, setTmdbYear] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetchTmdbMovie(tmdbId)
      .then((data) => {
        if (cancelled) return;
        setPosterPath(data?.poster_path ?? null);
        setTmdbYear(data?.release_date?.slice(0, 4) ?? null);
      })
      .catch(() => { if (!cancelled) { setPosterPath(null); setTmdbYear(null); } });
    return () => { cancelled = true; };
  }, [tmdbId]);
  const year = parsedYear ?? tmdbYear ?? undefined;
  return <TmdbPosterPlaceholder title={cleanTitle} subtitle={year} posterPath={posterPath} onClick={onClick} statusIcon={statusIcon} onMenuOpen={onMenuOpen} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StudioWorkspace() {
  const t = useTranslations("studio");
  const tc = useTranslations("common");
  const tSections = useTranslations("sections");
  const locale = useLocale();

  const [conn, setConn] = useState<{ nodeUrl: string; adminToken: string; creatorId: string; creatorDisplayName: string } | null>(null);
  const [themes, setThemes] = useState<CreatorTheme[]>([]);
  const [allPosters, setAllPosters] = useState<PosterEntry[]>([]);
  const [listViewMode, setListViewMode] = useState<"table" | "grid">("table");
  const scrollContentRef = useRef<HTMLElement | null>(null);
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNav = useMemo(() => navFromParams(searchParams), [searchParams]);
  const rawThemeFilter = searchParams.get("themeFilter") ?? "";
  const activeThemeId = rawThemeFilter && themes.some((theme) => theme.theme_id === rawThemeFilter)
    ? rawThemeFilter
    : (themes[0]?.theme_id ?? "");
  function setActiveThemeId(id: string) {
    router.push(`/studio${navToSearch(rawNav, id || undefined)}`);
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
  const [activeLanguage, setActiveLanguage] = useState("en");
  const [languageToast, setLanguageToast] = useState<string | null>(null);
  const [detailHeaderExtra, setDetailHeaderExtra] = useState<React.ReactNode | null>(null);

  useEffect(() => {
    if (rawNav.view !== "media") setDetailHeaderExtra(null);
  }, [rawNav.view]);

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
  const pinnedMoviesRef = { current: pinnedMovies };
  pinnedMoviesRef.current = pinnedMovies;
  function savePinnedMovies(next: { tmdbId: number; title: string }[], c = conn) {
    setPinnedMovies(next);
    if (c) void saveSetting(c.nodeUrl, c.adminToken, c.creatorId, "studio_pinned_movies", next);
  }

  function savePinnedCollectionAndAbsorbMovies(
    collection: { tmdbId: number; title: string },
    options?: { absorbMovieId?: number }
  ) {
    const nextCollections = pinnedCollections.filter((c) => c.tmdbId !== collection.tmdbId);
    nextCollections.push(collection);
    savePinnedCollections(nextCollections);

    const absorbMovieId = options?.absorbMovieId;
    if (absorbMovieId != null) {
      const filtered = pinnedMoviesRef.current.filter((m) => m.tmdbId !== absorbMovieId);
      if (filtered.length !== pinnedMoviesRef.current.length) {
        savePinnedMovies(filtered);
      }
    }

    void fetchTmdbCollection(collection.tmdbId).then((data) => {
      const partIds = new Set((data?.parts ?? []).map((part) => part.id));
      if (partIds.size === 0) return;
      const filtered = pinnedMoviesRef.current.filter((m) => !partIds.has(m.tmdbId));
      if (filtered.length !== pinnedMoviesRef.current.length) {
        savePinnedMovies(filtered);
      }
    }).catch(() => undefined);
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
    if (rawNav.view === "media" && rawNav.mediaKey === group.key) navigate({ view: "root" });
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
    if (rawNav.view === "media" && rawNav.mediaKey === group.key) navigate({ view: "root" });
    setDeleteGroupConfirm(null);
    await loadData();
  }

  // Add TV show dialog
  const [addShowOpen, setAddShowOpen] = useState(false);
  const [addShowInput, setAddShowInput] = useState("");
  const [addShowLookup, setAddShowLookup] = useState<{ tmdbId: number; title: string } | null>(null);
  const [addShowState, setAddShowState] = useState<"idle" | "loading" | "found" | "results" | "error">("idle");
  const [addShowResults, setAddShowResults] = useState<TmdbSearchResult[]>([]);

  useEffect(() => {
    const node = stickyHeaderRef.current;
    if (!node) return;
    const update = () => setStickyHeaderHeight(node.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(() => update());
    observer.observe(node);
    return () => observer.disconnect();
  }, [rawNav.view, searchParams, tmdbCollectionData, tmdbTvShowData, tmdbMovieData, themes]);

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
      savePinnedCollectionAndAbsorbMovies({
        tmdbId: addMovieResult.collectionId,
        title: addMovieResult.collectionName,
      });
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

  // Add collection dialog — searches TMDB collections directly
  const [addCollectionOpen, setAddCollectionOpen] = useState(false);
  const [addCollectionInput, setAddCollectionInput] = useState("");
  const [addCollectionState, setAddCollectionState] = useState<"idle" | "loading" | "found" | "results" | "error">("idle");
  const [addCollectionLookup, setAddCollectionLookup] = useState<{ tmdbId: number; title: string } | null>(null);
  const [addCollectionResults, setAddCollectionResults] = useState<TmdbSearchResult[]>([]);

  async function handleLookupCollection() {
    const raw = addCollectionInput.trim();
    if (!raw) return;
    setAddCollectionState("loading");
    setAddCollectionLookup(null);
    setAddCollectionResults([]);
    const numId = Number(raw);
    if (numId) {
      const data = await fetchTmdbCollection(numId);
      if (data) {
        setAddCollectionLookup({ tmdbId: data.id, title: data.name });
        setAddCollectionState("found");
        return;
      }
    }
    const results = await fetchTmdbSearchCollection(raw);
    if (results.length === 1) {
      setAddCollectionLookup({ tmdbId: results[0].id, title: results[0].name });
      setAddCollectionState("found");
    } else if (results.length > 1) {
      setAddCollectionResults(results.slice(0, 8));
      setAddCollectionState("results");
    } else {
      setAddCollectionState("error");
    }
  }

  function handleAddCollection() {
    if (!addCollectionLookup) return;
    savePinnedCollectionAndAbsorbMovies(addCollectionLookup);
    navigate({ view: "media", mediaKey: `collection:${addCollectionLookup.tmdbId}` });
    closeAddCollection();
  }

  function closeAddCollection() {
    setAddCollectionOpen(false);
    setAddCollectionInput("");
    setAddCollectionState("idle");
    setAddCollectionLookup(null);
    setAddCollectionResults([]);
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
      // Load all posters from node, following pagination so recently updated
      // draft items do not disappear after metadata changes.
      const posters: PosterEntry[] = [];
      let cursor: string | null = null;
      do {
        const url = new URL(`${c.nodeUrl}/v1/posters`);
        url.searchParams.set("limit", "200");
        url.searchParams.set("include_drafts", "true");
        if (cursor) url.searchParams.set("cursor", cursor);

        const postersRes = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${c.adminToken}` },
        });
        if (!postersRes.ok) break;
        const postersJson = await postersRes.json() as { results?: PosterEntry[]; next_cursor?: string | null };
        posters.push(...(postersJson.results ?? []));
        cursor = postersJson.next_cursor ?? null;
      } while (cursor);
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
      const [pinnedColsFromNode, pinnedShowsFromNode, pinnedMoviesFromNode, defaultLang, savedViewMode] = await Promise.all([
        fetchSetting<{ tmdbId: number; title: string }[]>(c.nodeUrl, c.adminToken, cid, "studio_pinned_collections"),
        fetchSetting<{ tmdbId: number; title: string }[]>(c.nodeUrl, c.adminToken, cid, "studio_pinned_tv_shows"),
        fetchSetting<{ tmdbId: number; title: string }[]>(c.nodeUrl, c.adminToken, cid, "studio_pinned_movies"),
        fetchSetting<string>(c.nodeUrl, c.adminToken, cid, "studio_default_language"),
        fetchSetting<string>(c.nodeUrl, c.adminToken, cid, "studio_list_view_mode"),
      ]);
      setActiveLanguage(defaultLang ?? "en");
      if (savedViewMode === "grid" || savedViewMode === "table") setListViewMode(savedViewMode);
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

  function switchLanguage(lang: string) {
    setActiveLanguage(lang);
    const label = lang === "" ? t("languageNeutral") : getLanguageLabel(lang, locale);
    setLanguageToast(t("nowShowingLanguage", { language: label }));
  }

  function handleListViewMode(mode: "table" | "grid") {
    setListViewMode(mode);
    if (conn) void saveSetting(conn.nodeUrl, conn.adminToken, conn.creatorId, "studio_list_view_mode", mode);
  }

  const handleChangeLanguage = useCallback(async (posterId: string, lang: string | null) => {
    if (!conn) return;
    await fetch(`${conn.nodeUrl}/v1/admin/posters/${encodeURIComponent(posterId)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${conn.adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(lang === null ? { clear_language: true } : { language: lang }),
    }).catch(() => undefined);
    await loadData();
  }, [conn, loadData]);

  const handleChangeLanguageAllPosters = useCallback(async (posterIds: string[], lang: string | null) => {
    if (!conn || posterIds.length === 0) return;
    await Promise.all(posterIds.map((id) =>
      fetch(`${conn.nodeUrl}/v1/admin/posters/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${conn.adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(lang === null ? { clear_language: true } : { language: lang }),
      }).catch(() => undefined)
    ));
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
    activeLanguage,
    handleMoveAllPosters,
    onChangeLanguage: handleChangeLanguage,
    handleChangeLanguageAllPosters,
  }), [conn, themes, loadData, handleMovePoster, handleDeletePoster, handleTogglePublished, activeThemeId, activeLanguage, handleMoveAllPosters, handleChangeLanguage, handleChangeLanguageAllPosters]);

  // ─── Derived views ──────────────────────────────────────────────────────────

  // When a language is active, filter the poster set so detail views only show that language.
  const visiblePosters = useMemo(() => {
    if (activeLanguage === "") return allPosters.filter((p) => p.language == null);
    return allPosters.filter((p) => p.language === activeLanguage);
  }, [allPosters, activeLanguage]);

  const mediaGroups = useMemo(() => groupByMedia(allPosters), [allPosters]);

  // Fetch TMDB collection data when navigating into a collection view and pass it as a prop.
  useEffect(() => {
    if (rawNav.view !== "media" || !rawNav.mediaKey.startsWith("collection:")) {
      setTmdbCollectionData(null);
      setTmdbCollectionState("idle");
      return;
    }
    const collId = Number(rawNav.mediaKey.split(":")[1]);
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
  }, [rawNav]);

  // Fetch TMDB TV show data when navigating into a show view
  useEffect(() => {
    if (rawNav.view !== "media" || !rawNav.mediaKey.startsWith("show:")) {
      setTmdbTvShowData(null);
      setTmdbTvShowState("idle");
      return;
    }
    const showId = Number(rawNav.mediaKey.split(":")[1]);
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
  }, [rawNav]);

  // Fetch TMDB movie data when navigating into a standalone movie view
  useEffect(() => {
    if (rawNav.view !== "media" || !rawNav.mediaKey.startsWith("movie:")) {
      setTmdbMovieData(null);
      setTmdbMovieState("idle");
      return;
    }
    const movieId = Number(rawNav.mediaKey.split(":")[1]);
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
  }, [rawNav]);

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

  const nav = useMemo<NavState>(() => {
    const themeIds = new Set(themes.map((theme) => theme.theme_id));
    const knownKeys = new Set([
      ...sidebarCollections.map((group) => group.key),
      ...sidebarTvShows.map((group) => group.key),
      ...sidebarMovies.map((group) => group.key),
      ...mediaGroups.map((group) => group.key),
    ]);

    if (rawNav.view === "theme") {
      return themeIds.has(rawNav.themeId) ? rawNav : { view: "root" };
    }

    if (rawNav.view === "list") {
      return themeIds.has(rawNav.themeId) ? rawNav : { view: "root" };
    }

    if (rawNav.view === "media") {
      return knownKeys.has(rawNav.mediaKey) ? rawNav : { view: "root" };
    }

    return rawNav;
  }, [mediaGroups, rawNav, sidebarCollections, sidebarMovies, sidebarTvShows, themes]);

  useEffect(() => {
    if (loading) return;

    const themeIds = new Set(themes.map((theme) => theme.theme_id));
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;

    const scrubThemeParam = (name: "themeId" | "themeFilter" | "fromListThemeId") => {
      const value = params.get(name);
      if (value && !themeIds.has(value)) {
        params.delete(name);
        changed = true;
      }
    };

    scrubThemeParam("themeId");
    scrubThemeParam("themeFilter");
    scrubThemeParam("fromListThemeId");

    if (rawNav.view === "theme" && !themeIds.has(rawNav.themeId)) {
      params.delete("view");
      params.delete("themeId");
      changed = true;
    }

    if (rawNav.view === "list" && !themeIds.has(rawNav.themeId)) {
      params.delete("view");
      params.delete("type");
      params.delete("themeId");
      params.delete("fromListType");
      params.delete("fromListThemeId");
      changed = true;
    }

    if (rawNav.view === "media") {
      const knownKeys = new Set([
        ...sidebarCollections.map((group) => group.key),
        ...sidebarTvShows.map((group) => group.key),
        ...sidebarMovies.map((group) => group.key),
        ...mediaGroups.map((group) => group.key),
      ]);

      if (!knownKeys.has(rawNav.mediaKey)) {
        params.delete("view");
        params.delete("key");
        params.delete("season");
        params.delete("fromListType");
        params.delete("fromListThemeId");
        changed = true;
      }
    }

    if (!changed) return;

    const next = params.toString();
    router.replace(next ? `/studio?${next}` : "/studio");
  }, [loading, mediaGroups, rawNav, rawThemeFilter, router, searchParams, sidebarCollections, sidebarMovies, sidebarTvShows, themes]);

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
      return visiblePosters.filter((p) =>
        (p.media.type === "show" && p.media.tmdb_id === showId) ||
        ((p.media.type === "season" || p.media.type === "episode") && p.media.show_tmdb_id === showId) ||
        (p.media.type === "backdrop" && (p.media.show_tmdb_id || null) === showId)
      );
    }
    if (type === "collection") {
      const collId = Number(id);
      return visiblePosters.filter((p) =>
        (p.media.type === "collection" && p.media.tmdb_id === collId) ||
        (p.media.type === "movie" && p.media.collection_tmdb_id === collId) ||
        (p.media.type === "backdrop" && p.media.collection_tmdb_id === collId)
      );
    }
    return visiblePosters.filter(
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
                    onChangeLanguage={(lang) => void handleChangeLanguage(p.poster_id, lang)}
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
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
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
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
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
          trendingActions={{
            pinnedCollections,
            pinnedMovies,
            pinnedTvShows,
            onAddCollection: (id, title) => {
              savePinnedCollectionAndAbsorbMovies({ tmdbId: id, title });
              navigate({ view: "media", mediaKey: `collection:${id}` });
            },
            onAddMovie: (id, title) => {
              const next = pinnedMovies.filter((m) => m.tmdbId !== id);
              next.push({ tmdbId: id, title });
              savePinnedMovies(next);
              navigate({ view: "media", mediaKey: `movie:${id}` });
            },
            onAddShow: (id, title) => {
              const next = pinnedTvShows.filter((s) => s.tmdbId !== id);
              next.push({ tmdbId: id, title });
              savePinnedTvShows(next);
              navigate({ view: "media", mediaKey: `show:${id}` });
            },
            onNavigate: (mediaKey) => navigate({ view: "media", mediaKey }),
          }}
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

        if (listViewMode === "grid") {
          const collLetterGroups = studioGroupByLetter(sidebarCollections);
          const collActiveLetters = new Set(sidebarCollections.map((g) => studioFirstLetter(g.title)));
          return (
            <>
              <StudioAZRail available={collActiveLetters} scrollContainerRef={scrollContentRef} />
              <Stack spacing={1}>
                {sidebarCollections.length === 0 ? (
                  <EmptyListState
                    icon={<LayersOutlinedIcon sx={{ fontSize: "4rem" }} />}
                    title={t("noCollections")}
                    description={t("noCollectionsHint")}
                    actionLabel={t("addCollection")}
                    onAction={() => setAddCollectionOpen(true)}
                  />
                ) : collLetterGroups.map(([letter, group], idx) => (
                  <Box key={letter} sx={{ pt: idx === 0 ? 0 : "20px" }}>
                    <Box id={`studio-az-${letter}`} sx={{ scrollMarginTop: STUDIO_AZ_SCROLL_MARGIN }} />
                    <Typography variant="overline" sx={{ fontSize: "1.1rem", fontWeight: 700, lineHeight: 1, display: "block", mb: 2 }}>{letter}</Typography>
                    <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                      {group.map((g) => {
                        const tmdb = collectionTmdbMap.get(g.tmdbId);
                        const stats = collStats(g.tmdbId);
                        const icon = statusIcon(stats, tmdb?.parts.length ?? null);
                        const handleMenuOpen = (anchor: HTMLElement) => setRowMenuState({ anchor, group: g });
                        const gridImageWrapper = (img: React.ReactElement) => (
                          <Box sx={{ position: "relative" }}>
                            <Box sx={cardMediaSurfaceSx}>
                              {img}
                              <Box sx={GRID_STATUS_SX}>{icon}</Box>
                              <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleMenuOpen(e.currentTarget); }} sx={GRID_KEBAB_SX}>
                                <MoreVertIcon sx={{ fontSize: "1rem" }} />
                              </IconButton>
                            </Box>
                          </Box>
                        );
                        return (
                          <Box key={g.key}>
                            {g.previewUrls.length > 0 ? (
                              <CollectionCard
                                group={toCollectionGroup(g)}
                                onClick={() => navigateToDetail(g.key)}
                                imageWrapper={gridImageWrapper}
                              />
                            ) : (
                              <TmdbPosterPlaceholder title={g.title} subtitle={tmdb?.parts.length ? tSections("movieCount", { count: tmdb.parts.length }) : undefined} posterPath={tmdb?.poster_path} onClick={() => navigateToDetail(g.key)} statusIcon={icon} onMenuOpen={handleMenuOpen} />
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                ))}
              </Stack>
            </>
          );
        }

        return (
          <Stack spacing={2}>
            {sidebarCollections.length === 0 ? (
              <EmptyListState
                icon={<LayersOutlinedIcon sx={{ fontSize: "4rem" }} />}
                title={t("noCollections")}
                description={t("noCollectionsHint")}
                actionLabel={t("addCollection")}
                onAction={() => setAddCollectionOpen(true)}
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

        if (listViewMode === "grid") {
          const movieLetterGroups = studioGroupByLetter(sidebarMovies);
          const movieActiveLetters = new Set(sidebarMovies.map((g) => studioFirstLetter(g.title)));
          return (
            <>
              <StudioAZRail available={movieActiveLetters} scrollContainerRef={scrollContentRef} />
              <Stack spacing={1}>
                {sidebarMovies.length === 0 ? (
                  <EmptyListState
                    icon={<MovieOutlinedIcon sx={{ fontSize: "4rem" }} />}
                    title={t("noMovies")}
                    description={t("noMoviesHint")}
                    actionLabel={t("addMovie")}
                    onAction={() => setAddMovieOpen(true)}
                  />
                ) : movieLetterGroups.map(([letter, group], idx) => (
                  <Box key={letter} sx={{ pt: idx === 0 ? 0 : "20px" }}>
                    <Box id={`studio-az-${letter}`} sx={{ scrollMarginTop: STUDIO_AZ_SCROLL_MARGIN }} />
                    <Typography variant="overline" sx={{ fontSize: "1.1rem", fontWeight: 700, lineHeight: 1, display: "block", mb: 2 }}>{letter}</Typography>
                    <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                      {group.map((g) => {
                        const stats = movieStats(g.tmdbId);
                        const icon = movieStatusIcon(stats);
                        const poster = allPosters.find((p) =>
                          p.media.tmdb_id === g.tmdbId && p.media.type === "movie" &&
                          p.kind !== "logo" && p.kind !== "square" &&
                          (activeThemeId === "" || p.media.theme_id === activeThemeId)
                        );
                        const handleMenuOpen = (anchor: HTMLElement) => setRowMenuState({ anchor, group: g });
                        const gridImageWrapper = (img: React.ReactElement) => (
                          <Box sx={{ position: "relative" }}>
                            {img}
                            <Box sx={GRID_STATUS_SX}>{icon}</Box>
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleMenuOpen(e.currentTarget); }} sx={GRID_KEBAB_SX}>
                              <MoreVertIcon sx={{ fontSize: "1rem" }} />
                            </IconButton>
                          </Box>
                        );
                        return (
                          <Box key={g.key}>
                            {poster ? (
                              <PosterCard poster={poster} chip={false} onClick={() => navigateToDetail(g.key)} imageWrapper={gridImageWrapper} />
                            ) : (
                              <MovieGridPlaceholder tmdbId={g.tmdbId} title={g.title} onClick={() => navigateToDetail(g.key)} statusIcon={icon} onMenuOpen={handleMenuOpen} />
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                ))}
              </Stack>
            </>
          );
        }

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

        if (listViewMode === "grid") {
          const tvLetterGroups = studioGroupByLetter(sidebarTvShows);
          const tvActiveLetters = new Set(sidebarTvShows.map((g) => studioFirstLetter(g.title)));
          return (
            <>
              <StudioAZRail available={tvActiveLetters} scrollContainerRef={scrollContentRef} />
              <Stack spacing={1}>
                {sidebarTvShows.length === 0 ? (
                  <EmptyListState
                    icon={<TvOutlinedIcon sx={{ fontSize: "4rem" }} />}
                    title={t("noTvShows")}
                    description={t("noTvShowsHint")}
                    actionLabel={t("addShow")}
                    onAction={() => setAddShowOpen(true)}
                  />
                ) : tvLetterGroups.map(([letter, group], idx) => (
                  <Box key={letter} sx={{ pt: idx === 0 ? 0 : "20px" }}>
                    <Box id={`studio-az-${letter}`} sx={{ scrollMarginTop: STUDIO_AZ_SCROLL_MARGIN }} />
                    <Typography variant="overline" sx={{ fontSize: "1.1rem", fontWeight: 700, lineHeight: 1, display: "block", mb: 2 }}>{letter}</Typography>
                    <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                      {group.map((g) => {
                        const tmdb = showTmdbMap.get(g.tmdbId);
                        const seasonCount = tmdb ? tmdb.seasons.filter((s) => s.season_number > 0).length : null;
                        const stats = tvShowStats(g.tmdbId);
                        const icon = tvStatusIcon(stats, seasonCount);
                        const { cleanTitle: tvTitle, year: tvParsedYear } = stripYear(g.title);
                        const tvYear = tvParsedYear ?? tmdb?.first_air_date?.slice(0, 4) ?? undefined;
                        const tvYearNum = tvYear ? parseInt(tvYear) : undefined;
                        const handleMenuOpen = (anchor: HTMLElement) => setRowMenuState({ anchor, group: g });
                        const gridImageWrapper = (img: React.ReactElement) => (
                          <Box sx={{ position: "relative" }}>
                            {img}
                            <Box sx={GRID_STATUS_SX}>{icon}</Box>
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleMenuOpen(e.currentTarget); }} sx={GRID_KEBAB_SX}>
                              <MoreVertIcon sx={{ fontSize: "1rem" }} />
                            </IconButton>
                          </Box>
                        );
                        return (
                          <Box key={g.key}>
                            {g.previewUrls.length > 0 ? (
                              <TVShowCard
                                group={{ key: g.key, title: tvTitle, showTmdbId: g.tmdbId, creatorId: "", creatorName: "", hasBoxSet: true, coverPreviews: g.previewUrls, seasonCount: stats.seasonPosterCount, episodeCount: stats.episodeCardCount, year: tvYearNum }}
                                onClick={() => navigateToDetail(g.key)}
                                imageWrapper={gridImageWrapper}
                              />
                            ) : (
                              <TmdbPosterPlaceholder title={tvTitle} subtitle={tvYear} posterPath={tmdb?.poster_path} onClick={() => navigateToDetail(g.key)} statusIcon={icon} onMenuOpen={handleMenuOpen} />
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                ))}
              </Stack>
            </>
          );
        }

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
          <TvShowDetailView showTmdbId={showId} posters={posters} tmdbData={tmdbTvShowData} tmdbState={tmdbTvShowState} callbacks={studioCallbacks} setHeaderExtra={setDetailHeaderExtra} />
        );
      }
      if (nav.mediaKey.startsWith("collection:")) {
        const collId = Number(nav.mediaKey.split(":")[1]);
        return (
          <CollectionDetailView collectionTmdbId={collId} posters={posters} allPosters={visiblePosters} tmdbData={tmdbCollectionData} tmdbState={tmdbCollectionState} callbacks={studioCallbacks} setHeaderExtra={setDetailHeaderExtra} />
        );
      }
      if (nav.mediaKey.startsWith("movie:")) {
        const movieId = Number(nav.mediaKey.split(":")[1]);
        return (
          <MovieDetailView movieTmdbId={movieId} title={group?.title ?? ""} posters={posters} allPosters={visiblePosters} tmdbData={tmdbMovieData} tmdbState={tmdbMovieState} callbacks={studioCallbacks} setHeaderExtra={setDetailHeaderExtra} />
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
  const activeSeasonNumber = (() => {
    const season = searchParams.get("season");
    const parsed = season ? parseInt(season, 10) : NaN;
    return Number.isNaN(parsed) ? null : parsed;
  })();
  const activeSeason = activeSeasonNumber != null
    ? (tmdbTvShowData?.seasons ?? []).find((season) => season.season_number === activeSeasonNumber) ?? null
    : null;
  const activeSeasonName = (() => {
    const name = activeSeason?.name?.trim();
    if (!name) return null;
    if (/^season\s+\d+$/i.test(name)) return null;
    return name;
  })();

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
      const group = sidebarCollections.find((g) => g.key === nav.mediaKey)
        ?? sidebarTvShows.find((g) => g.key === nav.mediaKey)
        ?? sidebarMovies.find((g) => g.key === nav.mediaKey)
        ?? mediaGroups.find((g) => g.key === nav.mediaKey);
      if (nav.mediaKey.startsWith("movie:")) {
        const rawTitle = group?.title || (tmdbMovieData
          ? `${tmdbMovieData.title}${tmdbMovieData.release_date?.slice(0, 4) ? ` (${tmdbMovieData.release_date.slice(0, 4)})` : ""}`
          : "");
        return rawTitle || t("title");
      }
      if (nav.mediaKey.startsWith("collection:")) return tmdbCollectionData?.name ?? group?.title ?? t("title");
      if (nav.mediaKey.startsWith("show:")) {
        if (activeSeasonNumber != null) {
          const seasonLabel = `Season ${String(activeSeasonNumber).padStart(2, "0")}`;
          return activeSeasonName ? `${seasonLabel} (${activeSeasonName})` : seasonLabel;
        }
        const showName = tmdbTvShowData?.name ?? group?.title ?? t("title");
        const showYear = tmdbTvShowData?.first_air_date?.slice(0, 4);
        return showYear ? `${showName} (${showYear})` : showName;
      }
      return group?.title ?? t("title");
    }
    return t("title");
  })();

  const toolbarSubtitle = (() => {
    if (nav.view !== "media") return undefined;
    if (nav.mediaKey.startsWith("movie:")) {
      const collectionName = tmdbMovieData?.belongs_to_collection?.name ?? null;
      if (!collectionName && tmdbMovieState === "loading") return undefined;
      return (
        <Typography
          variant="body2"
          color={collectionName ? "text.secondary" : "text.disabled"}
          sx={{ letterSpacing: "0.05em", textTransform: "uppercase" }}
        >
          {collectionName ? `Member of: ${collectionName}` : "Not a member of any collections"}
        </Typography>
      );
    }
    if (nav.mediaKey.startsWith("collection:")) {
      const totalMovieCount = tmdbCollectionData?.parts?.length ?? 0;
      const label = totalMovieCount > 0
        ? `${totalMovieCount} MOVIE${totalMovieCount !== 1 ? "S" : ""}`
        : "NO MOVIES";
      return (
        <Typography variant="body2" color="text.secondary" sx={{ letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {label}
        </Typography>
      );
    }
    if (nav.mediaKey.startsWith("show:")) {
      if (activeSeasonNumber != null) {
        const episodeCount = activeSeason?.episode_count ?? 0;
        return (
          <Typography variant="body2" color="text.secondary" sx={{ letterSpacing: "0.05em", textTransform: "uppercase" }}>
            {`${episodeCount} EPISODE${episodeCount !== 1 ? "S" : ""} IN THIS SEASON`}
          </Typography>
        );
      }
      const seasonCount = (tmdbTvShowData?.seasons ?? []).filter((season) => season.season_number > 0).length;
      const totalEpisodeCount = (tmdbTvShowData?.seasons ?? []).reduce((sum, season) => sum + (season.episode_count ?? 0), 0);
      if (seasonCount === 0 && totalEpisodeCount === 0) return undefined;
      return (
        <Typography variant="body2" color="text.secondary" sx={{ letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {seasonCount > 0
            ? `${seasonCount} ${seasonCount === 1 ? "SEASON" : "SEASONS"} AND ${totalEpisodeCount} EPISODES`
            : `${totalEpisodeCount} EPISODES`}
        </Typography>
      );
    }
    return undefined;
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
        if (activeSeasonNumber != null) {
          const seasonLabel = `Season ${String(activeSeasonNumber).padStart(2, "0")}`;
          return [
            home,
            makeCrumb("tv", true),
            {
              label: name,
              onClick: () => {
                const p = new URLSearchParams(searchParams.toString());
                p.delete("season");
                router.push(`/studio?${p.toString()}`);
              },
            },
            { label: seasonLabel },
          ];
        }
        return [home, makeCrumb("tv", true), { label: name }];
      }
      const group = sidebarMovies.find((g) => g.key === nav.mediaKey) ?? mediaGroups.find((g) => g.key === nav.mediaKey);
      return [home, { label: group?.title ?? nav.mediaKey }];
    }

    return [homeCurrent];
  })();

  const studioHeroBackdropUrl = (() => {
    if (nav.view !== "media") return null;

    if (nav.mediaKey.startsWith("movie:")) {
      const movieId = Number(nav.mediaKey.split(":")[1]);
      const movieBackdrop = postersForMedia(nav.mediaKey).find((p) =>
        p.media.type === "backdrop" && p.media.tmdb_id === movieId && !p.media.show_tmdb_id
      );
      return movieBackdrop?.assets.preview.url
        ?? (tmdbMovieData?.backdrop_path ? tmdbImageUrl(tmdbMovieData.backdrop_path) : null);
    }

    if (nav.mediaKey.startsWith("show:")) {
      const showId = Number(nav.mediaKey.split(":")[1]);
      const showBackdrop = postersForMedia(nav.mediaKey).find((p) =>
        p.media.type === "backdrop" && p.media.show_tmdb_id === showId
      );
      return showBackdrop?.assets.preview.url
        ?? (tmdbTvShowData?.backdrop_path ? tmdbImageUrl(tmdbTvShowData.backdrop_path) : null);
    }

    if (nav.mediaKey.startsWith("collection:")) {
      const collectionId = Number(nav.mediaKey.split(":")[1]);
      const collectionBackdrop = postersForMedia(nav.mediaKey).find((p) =>
        p.media.type === "backdrop" && p.media.collection_tmdb_id === collectionId
      );
      return collectionBackdrop?.assets.preview.url
        ?? (tmdbCollectionData?.backdrop_path ? tmdbImageUrl(tmdbCollectionData.backdrop_path) : null)
        ?? (tmdbCollectionData?.poster_path ? tmdbImageUrl(tmdbCollectionData.poster_path) : null);
    }

    return null;
  })();

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
      {studioHeroBackdropUrl && (
        <Box sx={{ position: "fixed", top: 64, left: 0, right: 0, height: "75vh", zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
          <Box
            component="img"
            src={studioHeroBackdropUrl}
            alt=""
            sx={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", opacity: 0.2, filter: "grayscale(0.75)" }}
          />
          <Box sx={{ position: "absolute", inset: 0, background: (theme) => `linear-gradient(to bottom, transparent 40%, ${theme.palette.background.default} 95%)` }} />
        </Box>
      )}

      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          flexShrink: 0,
          ...STUDIO_GLASS_PANEL_SX,
          backgroundColor: (theme) =>
            theme.palette.mode === "light"
              ? "rgba(255, 255, 255, 0.5)"
              : "rgba(18, 18, 20, 0.5)",
          boxShadow: (theme) =>
            theme.palette.mode === "light"
              ? "inset 0 1px 0 rgba(255,255,255,0.55), 0 1px 0 rgba(15,23,42,0.08), 0 10px 22px rgba(15,23,42,0.08)"
              : "inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 0 rgba(0,0,0,0.3), 0 10px 22px rgba(0,0,0,0.22)",
        }}
      >
        <Box sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 0.75,
          minHeight: 56,
        }}>
            {(conn?.creatorDisplayName || conn?.creatorId) && (
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "text.secondary",
                }}
              >
                {conn.creatorDisplayName || conn.creatorId}
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            <Tooltip title={t("artworkLanguageTooltip")} placement="bottom">
              <Select
                size="small"
                displayEmpty
                value={activeLanguage}
                onChange={(e) => switchLanguage(e.target.value)}
                startAdornment={<LanguageIcon sx={{ fontSize: "1rem", mr: 0.5, color: "text.secondary" }} />}
                sx={{ minWidth: 160, fontSize: "0.8rem" }}
              >
                <MenuItem value="">{t("languageNeutral")}</MenuItem>
                {ARTWORK_LANGUAGE_CODES.map((code) => (
                  <MenuItem key={code} value={code}>{getLanguageLabel(code, locale)}</MenuItem>
                ))}
              </Select>
            </Tooltip>
            {themes.length > 0 && (
              <Select
                size="small"
                value={activeThemeId}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "__new__") {
                    setEditingTheme(null);
                    setThemeModalOpen(true);
                    return;
                  }
                  setActiveThemeId(value);
                }}
                sx={{ minWidth: 140, fontSize: "0.8rem" }}
              >
                <MenuItem value="__new__">{t("newTheme")}</MenuItem>
                {themes.map((th) => (
                  <MenuItem key={th.theme_id} value={th.theme_id}>{th.name}</MenuItem>
                ))}
              </Select>
            )}
            {nav.view === "list" && (
              <>
                <ToggleButtonGroup
                  value={listViewMode}
                  exclusive
                  size="small"
                  onChange={(_, v) => v && handleListViewMode(v as "table" | "grid")}
                >
                  <ToggleButton value="table" aria-label={t("viewTable")}>
                    <TableRowsOutlinedIcon sx={{ fontSize: "1rem" }} />
                  </ToggleButton>
                  <ToggleButton value="grid" aria-label={t("viewGrid")}>
                    <GridViewOutlinedIcon sx={{ fontSize: "1rem" }} />
                  </ToggleButton>
                </ToggleButtonGroup>
                <IconButton
                  size="small"
                  onClick={() => nav.listType === "tv" ? setAddShowOpen(true) : nav.listType === "collections" ? setAddCollectionOpen(true) : setAddMovieOpen(true)}
                  aria-label={nav.listType === "tv" ? t("addShow") : nav.listType === "collections" ? t("addCollection") : t("addMovie")}
                >
                  <AddIcon />
                </IconButton>
              </>
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
              onClick={() => { setUploadPreFill({ themeId: activeThemeId, language: activeLanguage || undefined }); setUploadDrawerOpen(true); }}
            >
              {t("upload")}
            </Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden", overscrollBehaviorY: "none" }}>
        {/* Sidebar */}
        <Box
          sx={{
            position: "relative",
            width: 220,
            flexShrink: 0,
            zIndex: 1,
            pt: 1,
            display: { xs: "none", md: "block" },
            overflowY: "auto",
            overscrollBehaviorY: "none",
            ...STUDIO_GLASS_PANEL_SX,
            boxShadow: (theme) =>
              theme.palette.mode === "light"
                ? "inset -1px 0 0 rgba(15,23,42,0.06), 10px 0 24px rgba(15,23,42,0.06)"
                : "inset -1px 0 0 rgba(255,255,255,0.04), 10px 0 24px rgba(0,0,0,0.2)",
          }}
        >
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
        <Box sx={{ position: "relative", zIndex: 1, flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Scrollable content area */}
        <Box
          ref={scrollContentRef}
          sx={{
            flex: 1,
            overflowY: "auto",
            overscrollBehaviorY: "none",
            "& [data-type-chip]": { display: "none" },
            "--studio-sticky-header-height": `${stickyHeaderHeight}px`,
          }}
        >
          <Box sx={{ pt: 0, pb: 3 }}>
            <Box
              ref={stickyHeaderRef}
              sx={{
                position: "sticky",
                top: 0,
                overflow: "hidden",
                zIndex: 2,
                pt: 2,
                pb: 0,
                ...STUDIO_GLASS_PANEL_SX,
              }}
            >
              <Box sx={{ px: 3 }}>
                <PageHeader
                  crumbs={studioBreadcrumbs}
                  title={toolbarHeading && nav.view !== "root" && !(
                    nav.view === "list" && (
                      (nav.listType === "collections" && sidebarCollections.length === 0) ||
                      (nav.listType === "movies" && sidebarMovies.length === 0) ||
                      (nav.listType === "tv" && sidebarTvShows.length === 0)
                    )
                  ) ? toolbarHeading : undefined}
                  subtitle={toolbarSubtitle}
                />
              </Box>
              {detailHeaderExtra}
            </Box>
            <Box sx={{ px: 3, pt: nav.view === "media" ? 2 : 2 }}>
              {loading ? (
                <Typography color="text.secondary">{tc("loading")}</Typography>
              ) : (
                renderMain()
              )}
            </Box>
          </Box>
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

      {/* Add collection dialog */}
      <Dialog open={addCollectionOpen} onClose={closeAddCollection} maxWidth="xs" fullWidth>
        <DialogTitle>{t("addCollection")}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Stack direction="row" spacing={1}>
              <TextField
                label={t("searchByNameOrId")}
                value={addCollectionInput}
                onChange={(e) => { setAddCollectionInput(e.target.value); setAddCollectionLookup(null); setAddCollectionState("idle"); setAddCollectionResults([]); }}
                onKeyDown={(e) => { if (e.key === "Enter") void handleLookupCollection(); }}
                placeholder="e.g. Alien Collection or 8091"
                size="small"
                fullWidth
                autoFocus
              />
              <Button size="small" variant="outlined" onClick={() => void handleLookupCollection()} disabled={!addCollectionInput.trim() || addCollectionState === "loading"} sx={{ flexShrink: 0 }}>
                {tc("search")}
              </Button>
            </Stack>
            {addCollectionState === "loading" && <Typography variant="body2" color="text.secondary">{tc("loading")}</Typography>}
            {addCollectionState === "found" && addCollectionLookup && <Alert severity="success" sx={{ py: 0 }}>{addCollectionLookup.title}</Alert>}
            {addCollectionState === "error" && <Alert severity="error" sx={{ py: 0 }}>{t("collectionNotFound")}</Alert>}
            {addCollectionState === "results" && (
              <Stack spacing={0.5}>
                {addCollectionResults.map((r) => (
                  <Box
                    key={r.id}
                    onClick={() => { setAddCollectionLookup({ tmdbId: r.id, title: r.name }); setAddCollectionState("found"); }}
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
          <Button onClick={closeAddCollection}>{tc("cancel")}</Button>
          <Button variant="contained" onClick={handleAddCollection} disabled={addCollectionState !== "found"}>{t("addCollection")}</Button>
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
        onUploaded={(opts) => { void loadData(); const uploadedLang = opts?.language ?? ""; if (uploadedLang !== activeLanguage) { switchLanguage(uploadedLang); } }}
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
          onComplete={(opts) => { void loadData(); const lang = opts?.language ?? ""; if (lang !== activeLanguage) { switchLanguage(lang); } }}
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

      <Snackbar
        open={languageToast !== null}
        autoHideDuration={3000}
        onClose={() => setLanguageToast(null)}
        message={languageToast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
