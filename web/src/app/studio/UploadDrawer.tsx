"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";

import CloseIcon from "@mui/icons-material/Close";
import CollectionsOutlinedIcon from "@mui/icons-material/CollectionsOutlined";
import IconButton from "@mui/material/IconButton";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import PhotoSizeSelectActualOutlinedIcon from "@mui/icons-material/PhotoSizeSelectActualOutlined";
import TvOutlinedIcon from "@mui/icons-material/TvOutlined";
import ViewDayOutlinedIcon from "@mui/icons-material/ViewDayOutlined";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { CreatorTheme, PosterEntry } from "@/lib/types";

const ARTWORK_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "zh", label: "Chinese" },
  { code: "ko", label: "Korean" },
  { code: "it", label: "Italian" },
  { code: "ru", label: "Russian" },
  { code: "nl", label: "Dutch" },
  { code: "sv", label: "Swedish" },
  { code: "pl", label: "Polish" },
  { code: "tr", label: "Turkish" },
  { code: "ar", label: "Arabic" },
  { code: "da", label: "Danish" },
  { code: "hi", label: "Hindi" },
];

const MEDIA_TYPES = [
  { value: "movie", label: "Movie", icon: <MovieOutlinedIcon /> },
  { value: "collection", label: "Collection", icon: <CollectionsOutlinedIcon /> },
  { value: "show", label: "TV Show", icon: <TvOutlinedIcon /> },
  { value: "season", label: "Season", icon: <ViewDayOutlinedIcon /> },
  { value: "episode", label: "Episode", icon: <PhotoSizeSelectActualOutlinedIcon /> },
  { value: "backdrop", label: "Backdrop", icon: <ImageOutlinedIcon /> },
] as const;

const STEPS = ["Media type", "Which title?", "File & options"];

export type UploadPreFill = {
  mediaType?: string;
  /** Artwork kind override ("poster" | "background" | "logo"). When set, the kind is sent to the API directly. */
  kind?: string;
  tmdbId?: string;
  title?: string;
  year?: string;
  collectionTmdbId?: string;
  showTmdbId?: string;
  seasonNumber?: string;
  episodeNumber?: string;
  themeId?: string;
  /** BCP-47 language tag to pre-fill (e.g. "en"). Empty string = language-neutral. */
  language?: string;
  /** Label shown in the drawer header, e.g. "Collection poster", "Backdrop". */
  drawerLabel?: string;
};

interface UploadDrawerProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  themes: CreatorTheme[];
  conn: { nodeUrl: string; adminToken: string; creatorId: string; creatorDisplayName: string } | null;
  preFill?: UploadPreFill;
}

// ─── Preview generation ───────────────────────────────────────────────────────

export async function generatePreview(full: File): Promise<File> {
  const url = URL.createObjectURL(full);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = url;
  });
  URL.revokeObjectURL(url);

  const MAX = 600;
  const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(new File([blob!], "preview.jpg", { type: "image/jpeg" })),
      "image/jpeg",
      0.82,
    );
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UploadDrawer({ open, onClose, onUploaded, themes, conn, preFill }: UploadDrawerProps) {
  const t = useTranslations("upload");
  const tc = useTranslations("common");
  const ts = useTranslations("studio");

  const [step, setStep] = useState(0);
  const [mediaType, setMediaType] = useState("");
  const [kind, setKind] = useState("");
  const [tmdbId, setTmdbId] = useState("");
  const [showTmdbId, setShowTmdbId] = useState("");
  const [collectionTmdbId, setCollectionTmdbId] = useState("");
  const [seasonNumber, setSeasonNumber] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState("");
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [themeId, setThemeId] = useState("");
  const [language, setLanguage] = useState("");
  const [redistribution, setRedistribution] = useState("mirrors-approved");
  const [license, setLicense] = useState("all-rights-reserved");
  const [published, setPublished] = useState(false); // default draft
  const [fullFile, setFullFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PosterEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Apply pre-fill when drawer opens
  useEffect(() => {
    if (!open) return;
    setStep((preFill?.tmdbId || preFill?.showTmdbId) ? 2 : 0);
    setMediaType(preFill?.mediaType ?? "");
    setKind(preFill?.kind ?? "");
    setTmdbId(preFill?.tmdbId ?? "");
    setTitle(preFill?.title ?? "");
    setYear(preFill?.year ?? "");
    setCollectionTmdbId(preFill?.collectionTmdbId ?? "");
    setShowTmdbId(preFill?.showTmdbId ?? "");
    setSeasonNumber(preFill?.seasonNumber ?? "");
    setEpisodeNumber(preFill?.episodeNumber ?? "");
    setThemeId(preFill?.themeId || themes[0]?.theme_id || "");
    setLanguage(preFill?.language ?? "");
    setFullFile(null);
    setPreviewUrl(null);
    setSearchQuery("");
    setSearchResults([]);
    setStatus(null);
    setUploading(false);
    setPublished(false);
    setDuplicateWarning(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Revoke preview object URL on cleanup
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const u = new URL(`${INDEXER_BASE_URL}/v1/search`);
      if (/^\d+$/.test(searchQuery.trim())) {
        u.searchParams.set("tmdb_id", searchQuery.trim());
        if (mediaType) u.searchParams.set("type", mediaType);
      } else {
        u.searchParams.set("q", searchQuery.trim());
        if (mediaType) u.searchParams.set("type", mediaType);
      }
      u.searchParams.set("limit", "10");
      const r = await fetch(u.toString());
      if (r.ok) {
        const json = (await r.json()) as { results: PosterEntry[] };
        setSearchResults(json.results);
      }
    } finally {
      setSearching(false);
    }
  }

  function pickSearchResult(p: PosterEntry) {
    setTmdbId(String(p.media.tmdb_id ?? ""));
    setTitle(p.media.title ?? "");
    setYear(p.media.year ? String(p.media.year) : "");
    if (p.media.show_tmdb_id) setShowTmdbId(String(p.media.show_tmdb_id));
    setStep(2);
  }

  function handleFileChange(f: File | null) {
    setFullFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function handleUpload(force = false) {
    if (!conn || !fullFile) return;
    setUploading(true);
    setStatus(t("uploading"));
    setDuplicateWarning(false);

    try {
      let preview: File;
      try {
        preview = await generatePreview(fullFile);
      } catch {
        setStatus("Failed to generate preview — make sure the file is a valid JPG or PNG.");
        return;
      }

      const fd = new FormData();
      fd.set("tmdb_id", tmdbId);
      fd.set("media_type", mediaType);
      if (showTmdbId.trim()) fd.set("show_tmdb_id", showTmdbId.trim());
      if (collectionTmdbId.trim()) fd.set("collection_tmdb_id", collectionTmdbId.trim());
      if (seasonNumber.trim()) fd.set("season_number", seasonNumber.trim());
      if (episodeNumber.trim()) fd.set("episode_number", episodeNumber.trim());
      if (title.trim()) fd.set("title", title.trim());
      if (year.trim()) fd.set("year", year.trim());
      fd.set("creator_id", conn.creatorId);
      fd.set("creator_display_name", conn.creatorDisplayName);
      if (themeId) fd.set("theme_id", themeId);
      if (kind) fd.set("kind", kind);
      if (language) fd.set("language", language);
      fd.set("attribution_redistribution", redistribution);
      fd.set("attribution_license", license);
      fd.set("published", String(published));
      if (force) fd.set("force", "true");
      fd.set("preview", preview);
      fd.set("full", fullFile);

      let r: Response;
      try {
        r = await fetch(`${conn.nodeUrl}/v1/admin/posters`, {
          method: "POST",
          headers: { Authorization: `Bearer ${conn.adminToken}` },
          body: fd,
        });
      } catch {
        setStatus("Could not reach the node — check that it is running and the URL is correct.");
        return;
      }

      const json = await r.json().catch(() => null);
      if (!r.ok) {
        if (r.status === 409) {
          setDuplicateWarning(true);
          setStatus(null);
        } else {
          setStatus(t("uploadFailed", { status: String(r.status), details: JSON.stringify(json) }));
        }
        return;
      }

      onUploaded();
      onClose();
    } finally {
      setUploading(false);
    }
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 480 }, display: "flex", flexDirection: "column" } }}
    >
      {/* Header */}
      <Stack direction="row" alignItems="center" sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{preFill?.drawerLabel ?? t("title")}</Typography>
          {preFill && (() => {
            const { title, year, seasonNumber, episodeNumber } = preFill;
            let subtitle: string | null = null;
            if (episodeNumber && seasonNumber) {
              subtitle = `S${seasonNumber.padStart(2, "0")}.E${episodeNumber.padStart(2, "0")}`;
              if (title) subtitle = `${title} · ${subtitle}`;
            } else if (seasonNumber) {
              subtitle = `Season ${seasonNumber.padStart(2, "0")}`;
              if (title) subtitle = `${title} · ${subtitle}`;
            } else if (title) {
              subtitle = year ? `${title} (${year})` : title;
            }
            return subtitle ? (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{subtitle}</Typography>
            ) : null;
          })()}
        </Box>
        <IconButton size="small" onClick={onClose} aria-label={tc("cancel")}><CloseIcon /></IconButton>
      </Stack>

      {/* Stepper */}
      <Box sx={{ px: 2.5, pt: 2 }}>
        <Stepper activeStep={step} alternativeLabel>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel sx={{ "& .MuiStepLabel-label": { fontSize: "0.65rem" } }}>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2.5 }}>

        {/* Step 0 — Media type */}
        {step === 0 && (
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={700}>What type of artwork is this?</Typography>
            <Grid container spacing={1.5}>
              {MEDIA_TYPES.map(({ value, label, icon }) => (
                <Grid key={value} size={{ xs: 6 }}>
                  <Card
                    variant="outlined"
                    sx={{ borderColor: mediaType === value ? "primary.main" : "divider", borderWidth: mediaType === value ? 2 : 1 }}
                  >
                    <CardActionArea
                      onClick={() => { setMediaType(value); setStep(1); }}
                      sx={{ p: 1.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}
                    >
                      <Box sx={{ fontSize: "1.75rem", color: mediaType === value ? "primary.main" : "text.secondary" }}>{icon}</Box>
                      <Typography variant="body2" fontWeight={700}>{label}</Typography>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Stack>
        )}

        {/* Step 1 — Which title */}
        {step === 1 && (
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={700}>Which title?</Typography>
            <Stack direction="row" spacing={1}>
              <TextField
                label="TMDB ID or title search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
                size="small"
                fullWidth
              />
              <Button onClick={() => void handleSearch()} disabled={searching} size="small">
                {searching ? tc("loading") : tc("search")}
              </Button>
            </Stack>

            {searchResults.length > 0 && (
              <Stack spacing={0.5}>
                {searchResults.map((p) => (
                  <Box
                    key={p.poster_id}
                    onClick={() => pickSearchResult(p)}
                    sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
                  >
                    <Typography variant="body2" fontWeight={700}>{p.media.title ?? `TMDB ${p.media.tmdb_id}`}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.media.type}{p.media.year ? ` · ${p.media.year}` : ""} · TMDB {p.media.tmdb_id}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}

            <Divider />
            <Typography variant="caption" color="text.secondary">Or enter manually:</Typography>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1}>
                <TextField label={t("tmdbId")} value={tmdbId} onChange={(e) => setTmdbId(e.target.value)} size="small" sx={{ width: 140 }} />
                <TextField label={t("year")} value={year} onChange={(e) => setYear(e.target.value)} size="small" sx={{ width: 90 }} />
              </Stack>
              <TextField label={t("titleLabel")} value={title} onChange={(e) => setTitle(e.target.value)} size="small" fullWidth />
              {(mediaType === "season" || mediaType === "episode") && (
                <Stack direction="row" spacing={1}>
                  <TextField label={t("showTmdbId")} value={showTmdbId} onChange={(e) => setShowTmdbId(e.target.value)} size="small" fullWidth placeholder={t("showTmdbIdPlaceholder")} />
                  <TextField label={t("seasonNumber")} value={seasonNumber} onChange={(e) => setSeasonNumber(e.target.value)} size="small" sx={{ width: 90 }} />
                  {mediaType === "episode" && (
                    <TextField label={t("episodeNumber")} value={episodeNumber} onChange={(e) => setEpisodeNumber(e.target.value)} size="small" sx={{ width: 90 }} />
                  )}
                </Stack>
              )}
              {(mediaType === "movie" || mediaType === "backdrop") && (
                <TextField label={t("collectionTmdbId")} value={collectionTmdbId} onChange={(e) => setCollectionTmdbId(e.target.value)} size="small" fullWidth placeholder={t("collectionTmdbIdPlaceholder")} />
              )}
            </Stack>
          </Stack>
        )}

        {/* Step 2 — File & options */}
        {step === 2 && (
          <Stack spacing={2.5}>
            {/* File picker */}
            <Stack spacing={1}>
              <Typography variant="subtitle1" fontWeight={700}>{t("fullFile")}</Typography>
              <Box
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  border: "2px dashed",
                  borderColor: fullFile ? "success.main" : "divider",
                  borderRadius: 2,
                  p: 2,
                  cursor: "pointer",
                  textAlign: "center",
                  "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
                  transition: "border-color 0.15s",
                }}
              >
                {previewUrl ? (
                  <Box component="img" src={previewUrl} alt="Preview" sx={{ maxHeight: 200, maxWidth: "100%", borderRadius: 1, display: "block", mx: "auto" }} />
                ) : (
                  <Typography variant="body2" color="text.secondary">Click to select image (JPG / PNG)</Typography>
                )}
                {fullFile && (
                  <Typography variant="caption" color="success.main" sx={{ display: "block", mt: 0.5 }}>{fullFile.name}</Typography>
                )}
              </Box>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />
              <Typography variant="caption" color="text.secondary">Preview will be auto-generated from this image.</Typography>
            </Stack>

            <Divider />

            {/* Theme */}
            <TextField select label="Theme" value={themeId} onChange={(e) => setThemeId(e.target.value)} size="small" fullWidth>
              {themes.map((th) => <MenuItem key={th.theme_id} value={th.theme_id}>{th.name}</MenuItem>)}
            </TextField>

            {/* Artwork language */}
            <TextField select label={ts("artworkLanguage")} value={language} onChange={(e) => setLanguage(e.target.value)} size="small" fullWidth>
              <MenuItem value="">{ts("languageNeutral")}</MenuItem>
              {ARTWORK_LANGUAGES.map((l) => (
                <MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>
              ))}
            </TextField>

            {/* Published / Draft */}
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>Publish status</Typography>
              <ToggleButtonGroup
                value={published ? "published" : "draft"}
                exclusive
                size="small"
                onChange={(_, v) => { if (v !== null) setPublished(v === "published"); }}
              >
                <ToggleButton value="draft" sx={{ px: 2 }}>
                  <Chip label={ts("draft")} size="small" color="warning" sx={{ pointerEvents: "none", fontWeight: 700, fontSize: "0.6rem", height: 18 }} />
                </ToggleButton>
                <ToggleButton value="published" sx={{ px: 2 }}>
                  <Chip label={ts("published")} size="small" color="success" sx={{ pointerEvents: "none", fontWeight: 700, fontSize: "0.6rem", height: 18 }} />
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>

            <Divider />

            {/* Attribution */}
            <Stack spacing={1.5}>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>Attribution</Typography>
              <Stack direction="row" spacing={1}>
                <TextField select label={t("redistribution")} value={redistribution} onChange={(e) => setRedistribution(e.target.value)} size="small" fullWidth>
                  {["public-cache-ok", "mirrors-approved", "none"].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                </TextField>
                <TextField select label={t("license")} value={license} onChange={(e) => setLicense(e.target.value)} size="small" fullWidth>
                  {["all-rights-reserved", "cc-by-4.0", "cc-by-nc-4.0"].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                </TextField>
              </Stack>
            </Stack>

            {duplicateWarning && (
              <Alert
                severity="warning"
                action={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button size="small" color="inherit" onClick={() => setDuplicateWarning(false)}>Cancel</Button>
                    <Button size="small" color="inherit" variant="outlined" onClick={() => void handleUpload(true)}>Upload anyway</Button>
                  </Stack>
                }
              >
                This looks like artwork you&apos;ve already uploaded. Upload a duplicate anyway?
              </Alert>
            )}
            {status && (
              <Alert severity={status.includes("ailed") ? "error" : "info"}>{status}</Alert>
            )}
          </Stack>
        )}
      </Box>

      {/* Footer */}
      <Stack direction="row" spacing={1} sx={{ px: 2.5, py: 2, borderTop: 1, borderColor: "divider" }}>
        {step > 0 && (
          <Button variant="outlined" size="small" onClick={() => setStep(step - 1)} disabled={uploading}>
            {tc("back")}
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        {step < 2 && (
          <Button size="small" onClick={() => setStep(step + 1)} disabled={step === 1 && !tmdbId.trim()}>
            Next
          </Button>
        )}
        {step === 2 && (
          <Button
            size="small"
            variant="contained"
            onClick={() => void handleUpload()}
            disabled={uploading || !fullFile || !tmdbId.trim() || !mediaType}
          >
            {uploading ? t("uploading") : tc("upload")}
          </Button>
        )}
      </Stack>
    </Drawer>
  );
}
