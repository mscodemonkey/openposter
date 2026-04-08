"use client";

import { useRef, useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";

import { ARTWORK_LANGUAGE_CODES, getLanguageLabel } from "@/lib/artwork-languages";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import { generatePreview } from "@/app/studio/UploadDrawer";
import type { PosterEntry, CreatorTheme } from "@/lib/types";

// ─── Native ZIP parser (no external dependency) ───────────────────────────────

async function readZip(buffer: ArrayBuffer): Promise<Record<string, Uint8Array>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();

  // Locate End of Central Directory record (signature 0x06054b50)
  let eocdOffset = -1;
  for (let i = buffer.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error("Not a valid ZIP file");

  const cdCount  = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  const result: Record<string, Uint8Array> = {};
  let pos = cdOffset;

  for (let i = 0; i < cdCount; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) break;
    const method         = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const fileNameLen    = view.getUint16(pos + 28, true);
    const extraLen       = view.getUint16(pos + 30, true);
    const commentLen     = view.getUint16(pos + 32, true);
    const lfhOffset      = view.getUint32(pos + 42, true);
    const fileName       = decoder.decode(bytes.slice(pos + 46, pos + 46 + fileNameLen));
    pos += 46 + fileNameLen + extraLen + commentLen;

    if (fileName.endsWith("/")) continue; // skip directories

    const lfhFileNameLen = view.getUint16(lfhOffset + 26, true);
    const lfhExtraLen    = view.getUint16(lfhOffset + 28, true);
    const dataStart      = lfhOffset + 30 + lfhFileNameLen + lfhExtraLen;
    const compressed     = bytes.slice(dataStart, dataStart + compressedSize);

    if (method === 0) {
      result[fileName] = compressed; // STORE — no decompression needed
    } else if (method === 8) {
      // DEFLATE via browser-native DecompressionStream
      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();
      void writer.write(compressed).then(() => writer.close());
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let off = 0;
      for (const c of chunks) { out.set(c, off); off += c.length; }
      result[fileName] = out;
    }
  }
  return result;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type ZipImportConfig = {
  contextType: "collection" | "show";
  contextTmdbId: number;
  /** TMDB name of the show or collection, used for filename matching. */
  contextTitle: string;
  /** First-air year for shows (used in filename matching). */
  contextYear?: number;
  /** For collection context: parts list from TMDB for movie TMDB-ID lookup. */
  collectionParts?: Array<{ id: number; title: string; release_date?: string | null }>;
  /** For show context: season list from TMDB for season TMDB-ID lookup. */
  showSeasons?: Array<{ id: number; season_number: number }>;
  /** Theme to attach all imported posters to. */
  themeId?: string;
  /** BCP-47 language tag for all imported posters (e.g. "en"). Omit for language-neutral. */
  language?: string;
};

// ─── Internal types ───────────────────────────────────────────────────────────

type ItemKind =
  | { tag: "showPoster"; tmdbId: number; title: string; year: number }
  | { tag: "showBackdrop"; tmdbId: number; showTmdbId: number }
  | { tag: "season"; tmdbId: number | null; showTmdbId: number; seasonNumber: number }
  | { tag: "episode"; showTmdbId: number; seasonNumber: number; episodeNumber: number }
  | { tag: "collectionPoster"; tmdbId: number; collectionTmdbId: number; title: string }
  | { tag: "collectionBackdrop"; tmdbId: number; collectionTmdbId: number }
  | { tag: "movie"; tmdbId: number; title: string; year: number; collectionTmdbId: number };

type ImportItem = {
  filename: string;
  blob: Blob;
  label: string;
  kind: ItemKind;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

type SkippedItem = { filename: string; reason: string };

type Phase = "select" | "parsing" | "preview" | "importing" | "done";

// Matches the colour scheme used by PosterCard
const KIND_CHIP: Record<string, { label: string; color: "error" | "success" | "warning" | "info" | "primary" | "default" }> = {
  collectionPoster:  { label: "COLLECTION",  color: "error" },
  collectionBackdrop:{ label: "BACKDROP",    color: "warning" },
  movie:             { label: "MOVIE",        color: "success" },
  showPoster:        { label: "TV SHOW",      color: "error" },
  showBackdrop:      { label: "BACKDROP",     color: "warning" },
  season:            { label: "SEASON",       color: "info" },
  episode:           { label: "EPISODE",      color: "success" },
};

type ConflictInfo = { existingThemeId: string; isCrossTheme: boolean };

// ─── Filename parsing ─────────────────────────────────────────────────────────

function isImage(name: string): boolean {
  return /\.(jpg|jpeg|png)$/i.test(name);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function titlesMatch(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

type Parsed =
  | { type: "collectionBackdrop"; title: string }
  | { type: "showBackdrop"; baseName: string; year: number }
  | { type: "season"; baseName: string; year: number; seasonNumber: number }
  | { type: "episode"; baseName: string; year: number; seasonNumber: number; episodeNumber: number }
  | { type: "movie"; title: string; year: number }
  | { type: "collectionPoster"; title: string }
  | { type: "showPoster"; baseName: string; year: number };

function parseFilename(filename: string): Parsed | null {
  const name = (filename.split("/").pop() ?? filename).trim();
  if (!isImage(name)) return null;

  // 1. Collection backdrop — 2+ spaces before "- Backdrop"
  //    e.g. "James Bond Collection  - Backdrop.jpg"
  const collBgM = name.match(/^(.+?)\s{2,}-\s*Backdrop\.(jpg|jpeg|png)$/i);
  if (collBgM) return { type: "collectionBackdrop", title: collBgM[1].trim() };

  // 2. Show/season backdrop — "(year) - Backdrop"
  //    e.g. "ted (2024) - Backdrop.jpg"
  const showBgM = name.match(/^(.+?)\s+\((\d{4})\)\s+-\s*Backdrop\.(jpg|jpeg|png)$/i);
  if (showBgM) return { type: "showBackdrop", baseName: showBgM[1].trim(), year: parseInt(showBgM[2]) };

  // 3. Season poster — "(year) - Season N"
  //    e.g. "ted (2024) - Season 1.jpg"
  const seasonM = name.match(/^(.+?)\s+\((\d{4})\)\s+-\s*Season\s+(\d+)\.(jpg|jpeg|png)$/i);
  if (seasonM) return { type: "season", baseName: seasonM[1].trim(), year: parseInt(seasonM[2]), seasonNumber: parseInt(seasonM[3]) };

  // 4. Episode card — "(year) - SN EN"
  //    e.g. "ted (2024) - S1 E3.jpg"
  const epM = name.match(/^(.+?)\s+\((\d{4})\)\s+-\s*S(\d+)\s+E(\d+)\.(jpg|jpeg|png)$/i);
  if (epM) return { type: "episode", baseName: epM[1].trim(), year: parseInt(epM[2]), seasonNumber: parseInt(epM[3]), episodeNumber: parseInt(epM[4]) };

  // 5. Movie poster — "(year) .ext"  (trailing space before dot)
  //    e.g. "Dr. No (1962) .jpg"
  const movieM = name.match(/^(.+?)\s+\((\d{4})\)\s+\.(jpg|jpeg|png)$/i);
  if (movieM) return { type: "movie", title: movieM[1].trim(), year: parseInt(movieM[2]) };

  // 6. Collection poster — no year, trailing space before .ext
  //    e.g. "James Bond Collection .jpg"
  if (!/\(\d{4}\)/.test(name)) {
    const collPM = name.match(/^(.+?)\s+\.(jpg|jpeg|png)$/i);
    if (collPM) return { type: "collectionPoster", title: collPM[1].trim() };
  }

  // 7. Show poster — "(year).ext"  (no trailing space)
  //    e.g. "ted (2024).jpg"
  const showPM = name.match(/^(.+?)\s+\((\d{4})\)\.(jpg|jpeg|png)$/i);
  if (showPM) return { type: "showPoster", baseName: showPM[1].trim(), year: parseInt(showPM[2]) };

  return null;
}

// ─── Context-aware mapping ────────────────────────────────────────────────────

function mapForCollection(
  path: string,
  blob: Blob,
  cfg: ZipImportConfig,
): { item: ImportItem | null; skip: SkippedItem | null } {
  const filename = (path.split("/").pop() ?? path).trim();
  const parsed = parseFilename(filename);
  const { contextTmdbId, contextTitle, collectionParts = [] } = cfg;

  if (!parsed) return { item: null, skip: { filename, reason: "unrecognized filename format" } };

  if (parsed.type === "collectionPoster") {
    if (!titlesMatch(parsed.title, contextTitle)) {
      return { item: null, skip: { filename, reason: `collection name "${parsed.title}" doesn't match "${contextTitle}"` } };
    }
    return {
      item: { filename, blob, label: "Collection poster", status: "pending", kind: { tag: "collectionPoster", tmdbId: contextTmdbId, collectionTmdbId: contextTmdbId, title: contextTitle } },
      skip: null,
    };
  }

  if (parsed.type === "collectionBackdrop") {
    return {
      item: { filename, blob, label: "Collection backdrop", status: "pending", kind: { tag: "collectionBackdrop", tmdbId: contextTmdbId, collectionTmdbId: contextTmdbId } },
      skip: null,
    };
  }

  if (parsed.type === "movie") {
    const part = collectionParts.find((p) => {
      const py = p.release_date ? parseInt(p.release_date.slice(0, 4)) : null;
      return titlesMatch(p.title, parsed.title) && (py === null || py === parsed.year);
    });
    if (!part) {
      return { item: null, skip: { filename, reason: `no TMDB match for "${parsed.title} (${parsed.year})" in collection` } };
    }
    return {
      item: {
        filename, blob,
        label: `${parsed.title} (${parsed.year})`,
        status: "pending",
        kind: { tag: "movie", tmdbId: part.id, title: parsed.title, year: parsed.year, collectionTmdbId: contextTmdbId },
      },
      skip: null,
    };
  }

  // Show/season/episode items not relevant in collection context
  return { item: null, skip: { filename, reason: "show/season/episode content skipped in collection context" } };
}

function mapForShow(
  path: string,
  blob: Blob,
  cfg: ZipImportConfig,
): { item: ImportItem | null; skip: SkippedItem | null } {
  const filename = (path.split("/").pop() ?? path).trim();
  const parsed = parseFilename(filename);
  const { contextTmdbId, contextTitle, showSeasons = [] } = cfg;

  if (!parsed) return { item: null, skip: { filename, reason: "unrecognized filename format" } };

  if (parsed.type === "showPoster") {
    if (!titlesMatch(parsed.baseName, contextTitle)) {
      return { item: null, skip: { filename, reason: `title "${parsed.baseName}" doesn't match "${contextTitle}"` } };
    }
    return {
      item: {
        filename, blob,
        label: "Show poster",
        status: "pending",
        kind: { tag: "showPoster", tmdbId: contextTmdbId, title: contextTitle, year: parsed.year },
      },
      skip: null,
    };
  }

  if (parsed.type === "showBackdrop") {
    if (!titlesMatch(parsed.baseName, contextTitle)) {
      return { item: null, skip: { filename, reason: `title "${parsed.baseName}" doesn't match "${contextTitle}"` } };
    }
    return {
      item: {
        filename, blob, label: "Show backdrop", status: "pending",
        kind: { tag: "showBackdrop", tmdbId: contextTmdbId, showTmdbId: contextTmdbId },
      },
      skip: null,
    };
  }

  if (parsed.type === "season") {
    if (!titlesMatch(parsed.baseName, contextTitle)) {
      return { item: null, skip: { filename, reason: `title "${parsed.baseName}" doesn't match "${contextTitle}"` } };
    }
    const season = showSeasons.find((s) => s.season_number === parsed.seasonNumber);
    return {
      item: {
        filename, blob,
        label: `Season ${parsed.seasonNumber} poster`,
        status: "pending",
        kind: { tag: "season", tmdbId: season?.id ?? null, showTmdbId: contextTmdbId, seasonNumber: parsed.seasonNumber },
      },
      skip: null,
    };
  }

  if (parsed.type === "episode") {
    if (!titlesMatch(parsed.baseName, contextTitle)) {
      return { item: null, skip: { filename, reason: `title "${parsed.baseName}" doesn't match "${contextTitle}"` } };
    }
    return {
      item: {
        filename, blob,
        label: `S${String(parsed.seasonNumber).padStart(2, "0")}E${String(parsed.episodeNumber).padStart(2, "0")}`,
        status: "pending",
        kind: { tag: "episode", showTmdbId: contextTmdbId, seasonNumber: parsed.seasonNumber, episodeNumber: parsed.episodeNumber },
      },
      skip: null,
    };
  }

  // Collection/movie items not relevant in show context
  return { item: null, skip: { filename, reason: "collection/movie content skipped in show context" } };
}

// ─── Conflict detection ───────────────────────────────────────────────────────

function detectConflict(
  item: ImportItem,
  allPosters: PosterEntry[],
  targetThemeId: string,
  importLanguage: string | undefined,
): ConflictInfo | null {
  const k = item.kind;
  // Normalise to null so undefined and null both represent "textless/language-neutral"
  const importLang = importLanguage ?? null;
  const match = allPosters.find((p) => {
    // Only conflict with posters of the same language — uploading "en" shouldn't
    // conflict with existing textless posters and vice versa.
    if ((p.language ?? null) !== importLang) return false;
    if (k.tag === "collectionPoster") return p.media.type === "collection" && p.media.tmdb_id === k.tmdbId;
    if (k.tag === "collectionBackdrop") return p.media.type === "backdrop" && p.media.tmdb_id === k.tmdbId;
    if (k.tag === "movie") return p.media.type === "movie" && p.media.tmdb_id === k.tmdbId;
    if (k.tag === "showPoster") return p.media.type === "show" && p.media.tmdb_id === k.tmdbId;
    if (k.tag === "showBackdrop") return p.media.type === "backdrop" && (p.media as { show_tmdb_id?: number }).show_tmdb_id === k.showTmdbId;
    if (k.tag === "season") return p.media.type === "season" && (p.media as { show_tmdb_id?: number }).show_tmdb_id === k.showTmdbId && p.media.season_number === k.seasonNumber;
    if (k.tag === "episode") return p.media.type === "episode" && (p.media as { show_tmdb_id?: number }).show_tmdb_id === k.showTmdbId && p.media.season_number === k.seasonNumber && p.media.episode_number === k.episodeNumber;
    return false;
  });
  if (!match) return null;
  const existingThemeId = match.media.theme_id ?? "";
  return { existingThemeId, isCrossTheme: existingThemeId !== targetThemeId };
}

// ─── Upload ───────────────────────────────────────────────────────────────────

const KIND_ORDER = ["collectionPoster", "collectionBackdrop", "showPoster", "showBackdrop", "season", "episode", "movie"];

async function uploadItem(
  item: ImportItem,
  conn: { nodeUrl: string; adminToken: string; creatorId: string; creatorDisplayName: string },
  themeId?: string,
  language?: string,
  contextTitle?: string,
  contextYear?: number,
): Promise<void> {
  const fullFile = new File([item.blob], item.filename, { type: "image/jpeg" });
  const preview = await generatePreview(fullFile);
  const form = new FormData();

  // All text fields first, then files (python-multipart drops text fields after file parts)
  const k = item.kind;
  if (k.tag === "collectionPoster") {
    form.append("media_type", "collection");
    form.append("tmdb_id", String(k.tmdbId));
    form.append("collection_tmdb_id", String(k.collectionTmdbId));
    form.append("title", k.title);
  } else if (k.tag === "collectionBackdrop") {
    form.append("media_type", "backdrop");
    form.append("kind", "background");
    form.append("tmdb_id", String(k.tmdbId));
    form.append("collection_tmdb_id", String(k.collectionTmdbId));
    if (contextTitle) form.append("title", contextTitle);
  } else if (k.tag === "movie") {
    form.append("media_type", "movie");
    form.append("tmdb_id", String(k.tmdbId));
    form.append("collection_tmdb_id", String(k.collectionTmdbId));
    form.append("title", k.title);
    form.append("year", String(k.year));
  } else if (k.tag === "showPoster") {
    form.append("media_type", "show");
    form.append("tmdb_id", String(k.tmdbId));
    form.append("title", k.title);
    form.append("year", String(k.year));
  } else if (k.tag === "showBackdrop") {
    form.append("media_type", "backdrop");
    form.append("kind", "background");
    form.append("tmdb_id", String(k.tmdbId));
    form.append("show_tmdb_id", String(k.showTmdbId));
    if (contextTitle) form.append("title", contextTitle);
    if (contextYear) form.append("year", String(contextYear));
  } else if (k.tag === "season") {
    form.append("media_type", "season");
    // Use season TMDB ID if available, else fall back to show ID (backend needs a non-null tmdb_id)
    form.append("tmdb_id", String(k.tmdbId ?? k.showTmdbId));
    form.append("show_tmdb_id", String(k.showTmdbId));
    form.append("season_number", String(k.seasonNumber));
    if (contextTitle) form.append("title", contextTitle);
    if (contextYear) form.append("year", String(contextYear));
  } else if (k.tag === "episode") {
    form.append("media_type", "episode");
    // Episodes don't have their own TMDB ID in this context; use show ID as required placeholder
    form.append("tmdb_id", String(k.showTmdbId));
    form.append("show_tmdb_id", String(k.showTmdbId));
    form.append("season_number", String(k.seasonNumber));
    form.append("episode_number", String(k.episodeNumber));
    if (contextTitle) form.append("title", contextTitle);
    if (contextYear) form.append("year", String(contextYear));
  }

  form.append("creator_id", conn.creatorId);
  form.append("creator_display_name", conn.creatorDisplayName);
  form.append("published", "false");
  if (themeId) form.append("theme_id", themeId);
  if (language) form.append("language", language);

  // Files last (python-multipart drops text fields that come after file parts)
  form.append("full", fullFile);
  form.append("preview", preview);

  const res = await fetch(`${conn.nodeUrl}/v1/admin/posters`, {
    method: "POST",
    headers: { Authorization: `Bearer ${conn.adminToken}` },
    body: form,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? `HTTP ${res.status}`);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ZipImportDialogProps {
  open: boolean;
  onClose: () => void;
  config: ZipImportConfig;
  conn: { nodeUrl: string; adminToken: string; creatorId: string; creatorDisplayName: string } | null;
  onComplete: (opts?: { language?: string }) => void;
  allPosters?: PosterEntry[];
  themes?: CreatorTheme[];
}

export default function ZipImportDialog({ open, onClose, config, conn, onComplete, allPosters = [], themes = [] }: ZipImportDialogProps) {
  const t = useTranslations("studio");
  const locale = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("select");
  const [items, setItems] = useState<ImportItem[]>([]);
  const [skipped, setSkipped] = useState<SkippedItem[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [activeThemeId, setActiveThemeId] = useState<string>(config.themeId ?? "");
  const [activeLanguage, setActiveLanguage] = useState<string>(config.language ?? "");

  // Keep activeThemeId/activeLanguage in sync if config changes (e.g. dialog reused for a different context)
  const prevConfigTheme = useRef(config.themeId);
  if (config.themeId !== prevConfigTheme.current) {
    prevConfigTheme.current = config.themeId;
    setActiveThemeId(config.themeId ?? "");
  }
  const prevConfigLang = useRef(config.language);
  if (config.language !== prevConfigLang.current) {
    prevConfigLang.current = config.language;
    setActiveLanguage(config.language ?? "");
  }

  const targetThemeId = activeThemeId;
  const themeName = (id: string) => themes.find((th) => th.theme_id === id)?.name ?? id;

  // Compute per-item conflicts from allPosters
  const conflictMap = useMemo(() => {
    const map = new Map<number, ConflictInfo>();
    items.forEach((item, idx) => {
      const c = detectConflict(item, allPosters, targetThemeId, activeLanguage || undefined);
      if (c) map.set(idx, c);
    });
    return map;
  }, [items, allPosters, targetThemeId, activeLanguage]);

  const crossThemeItems = useMemo(() =>
    items.filter((_, idx) => conflictMap.get(idx)?.isCrossTheme === true),
  [items, conflictMap]);

  // All unique existing-theme names for cross-theme conflicts
  const crossThemeNames = useMemo(() => {
    const ids = new Set<string>();
    items.forEach((_, idx) => {
      const c = conflictMap.get(idx);
      if (c?.isCrossTheme) ids.add(c.existingThemeId);
    });
    return Array.from(ids).map(themeName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflictMap]);

  function reset() {
    setPhase("select");
    setItems([]);
    setSkipped([]);
    setDoneCount(0);
    setErrorCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    if (phase === "importing") return;
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setPhase("parsing");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const entries = await readZip(arrayBuffer);

      const recognized: ImportItem[] = [];
      const unrecognized: SkippedItem[] = [];

      for (const [path, data] of Object.entries(entries)) {
        const basename = (path.split("/").pop() ?? path).trim();
        if (!isImage(basename)) continue;
        const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: "image/jpeg" });
        const result = config.contextType === "collection"
          ? mapForCollection(path, blob, config)
          : mapForShow(path, blob, config);
        if (result.item) recognized.push(result.item);
        if (result.skip) unrecognized.push(result.skip);
      }

      recognized.sort((a, b) => {
        const ai = KIND_ORDER.indexOf(a.kind.tag);
        const bi = KIND_ORDER.indexOf(b.kind.tag);
        if (ai !== bi) return ai - bi;
        if (a.kind.tag === "episode" && b.kind.tag === "episode") {
          const sa = a.kind.seasonNumber * 1000 + a.kind.episodeNumber;
          const sb = b.kind.seasonNumber * 1000 + b.kind.episodeNumber;
          return sa - sb;
        }
        if (a.kind.tag === "season" && b.kind.tag === "season") return a.kind.seasonNumber - b.kind.seasonNumber;
        return a.filename.localeCompare(b.filename);
      });

      setItems(recognized);
      setSkipped(unrecognized);
      setPhase("preview");
    } catch {
      setPhase("select");
    }
  }

  async function executeImport() {
    if (!conn) return;
    setPhase("importing");
    let done = 0;
    let errors = 0;

    for (let i = 0; i < items.length; i++) {
      setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: "uploading" } : it));
      try {
        await uploadItem(items[i], conn, activeThemeId || undefined, activeLanguage || undefined, config.contextTitle, config.contextYear);
        setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: "done" } : it));
        done++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "upload failed";
        setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: "error", error: msg } : it));
        errors++;
      }
      setDoneCount(done);
      setErrorCount(errors);
    }

    void onComplete({ language: activeLanguage || undefined });
    if (errors === 0) {
      reset();
      onClose();
      return;
    }
    setPhase("done");
  }

  const progressPct = items.length > 0
    ? (items.filter((it) => ["done", "error"].includes(it.status)).length / items.length) * 100
    : 0;

  const contextLabel = config.contextType === "collection" ? t("zipImportCollection") : t("zipImportShow");

  const importing = phase === "importing";
  const contextTypeLabel = config.contextType === "collection" ? t("zipImportCollection") : t("zipImportShow");

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle component="div" sx={{ display: "flex", alignItems: "center", gap: 1, pr: 2 }}>
        <UnarchiveOutlinedIcon fontSize="small" sx={{ flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
            {t("zipImportTitle")}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
            {contextTypeLabel}: <strong>{config.contextTitle}</strong>
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
          <Typography variant="caption" color="text.secondary">{t("zipImportLanguageLabel")}</Typography>
          <Select
            size="small"
            value={activeLanguage}
            onChange={(e) => setActiveLanguage(e.target.value)}
            disabled={importing}
            displayEmpty
            sx={{ fontSize: "0.8rem", minWidth: 110 }}
            renderValue={(v) => v ? getLanguageLabel(v as string, locale) : t("languageNeutral")}
          >
            <MenuItem value="">{t("languageNeutral")}</MenuItem>
            {ARTWORK_LANGUAGE_CODES.map((code) => (
              <MenuItem key={code} value={code}>{getLanguageLabel(code, locale)}</MenuItem>
            ))}
          </Select>
        </Box>
        {themes.length > 0 && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
            <Typography variant="caption" color="text.secondary">{t("zipImportThemeLabel")}</Typography>
            <Select
              size="small"
              value={activeThemeId}
              onChange={(e) => setActiveThemeId(e.target.value)}
              disabled={importing}
              displayEmpty
              sx={{ fontSize: "0.8rem", minWidth: 130 }}
              renderValue={(v) => themeName(v as string)}
            >
              {themes.map((th) => (
                <MenuItem key={th.theme_id} value={th.theme_id}>{th.name}</MenuItem>
              ))}
            </Select>
          </Box>
        )}
      </DialogTitle>

      <DialogContent dividers>
        {phase === "select" && (
          <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
            <UnarchiveOutlinedIcon sx={{ fontSize: "3rem", color: "text.disabled" }} />
            <Typography color="text.secondary" variant="body2" textAlign="center">
              {t("zipImportSelectPrompt", { contextType: contextLabel })}
            </Typography>
            <Button variant="contained" onClick={() => fileInputRef.current?.click()}>
              {t("zipImportSelectButton")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />
          </Stack>
        )}

        {phase === "parsing" && (
          <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
            <CircularProgress />
            <Typography color="text.secondary">{t("zipImportParsing")}</Typography>
          </Stack>
        )}

        {(phase === "preview" || phase === "importing" || phase === "done") && (
          <Stack spacing={2}>
            {phase === "importing" && <LinearProgress variant="determinate" value={progressPct} />}

            {phase === "done" && (
              <Alert severity={errorCount > 0 ? "warning" : "success"}>
                {t("zipImportDone", {
                  done: doneCount,
                  total: items.length,
                  errors: errorCount,
                })}
              </Alert>
            )}

            {/* Cross-theme warning banner in preview */}
            {phase === "preview" && crossThemeItems.length > 0 && (
              <Alert severity="warning" icon={<WarningAmberIcon />}>
                {t("zipImportCrossThemeWarning", {
                  count: crossThemeItems.length,
                  theme: crossThemeNames.join(", "),
                })}
              </Alert>
            )}

            {items.length === 0 && (
              <Alert severity="warning">{t("zipImportNoItems")}</Alert>
            )}

            {items.length > 0 && (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>{t("zipImportColFile")}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t("zipImportColType")}</TableCell>
                    {phase === "preview" && conflictMap.size > 0 && (
                      <TableCell sx={{ fontWeight: 700, width: 130 }}>{t("zipImportColConflict")}</TableCell>
                    )}
                    {(phase === "importing" || phase === "done") && (
                      <TableCell sx={{ fontWeight: 700, width: 120 }}>{t("zipImportColStatus")}</TableCell>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item, idx) => {
                    const conflict = conflictMap.get(idx);
                    return (
                      <TableRow key={idx}>
                        <TableCell>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>{item.label}</Typography>
                          <Typography variant="caption" color="text.disabled" sx={{ display: "block" }} noWrap>{item.filename}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={KIND_CHIP[item.kind.tag]?.label ?? item.kind.tag} color={KIND_CHIP[item.kind.tag]?.color ?? "default"} size="small" sx={{ fontSize: "0.7rem" }} />
                        </TableCell>
                        {phase === "preview" && conflictMap.size > 0 && (
                          <TableCell>
                            {conflict && (
                              <Chip
                                label={t("zipImportConflictChip", { theme: themeName(conflict.existingThemeId) })}
                                size="small"
                                color={conflict.isCrossTheme ? "warning" : "default"}
                                sx={{ fontSize: "0.7rem" }}
                              />
                            )}
                          </TableCell>
                        )}
                        {(phase === "importing" || phase === "done") && (
                          <TableCell>
                            {item.status === "pending" && (
                              <Typography variant="caption" color="text.disabled">{t("zipImportWaiting")}</Typography>
                            )}
                            {item.status === "uploading" && <CircularProgress size={14} />}
                            {item.status === "done" && (
                              <CheckCircleOutlineIcon sx={{ fontSize: "1.1rem", color: "success.main" }} />
                            )}
                            {item.status === "error" && (
                              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                <ErrorOutlineIcon sx={{ fontSize: "1rem", color: "error.main" }} />
                                <Typography variant="caption" color="error" noWrap sx={{ maxWidth: 80 }}>{item.error}</Typography>
                              </Box>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {skipped.length > 0 && phase === "preview" && (
              <Typography variant="caption" color="text.disabled">
                {t("zipImportSkippedNote", { count: skipped.length })}
              </Typography>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        {phase !== "importing" && (
          <Button onClick={handleClose}>
            {phase === "done" ? t("zipImportClose") : t("zipImportCancel")}
          </Button>
        )}
        {phase === "preview" && items.length > 0 && conn && (
          <Button variant="contained" onClick={() => void executeImport()}>
            {t("zipImportImportButton", { count: items.length })}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
