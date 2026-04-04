"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";

import CollectionsOutlinedIcon from "@mui/icons-material/CollectionsOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import PhotoSizeSelectActualOutlinedIcon from "@mui/icons-material/PhotoSizeSelectActualOutlined";
import TvOutlinedIcon from "@mui/icons-material/TvOutlined";
import ViewDayOutlinedIcon from "@mui/icons-material/ViewDayOutlined";

import ArtworkCardFrame from "@/components/ArtworkCardFrame";
import { INDEXER_BASE_URL } from "@/lib/config";
import { loadCreatorConnection } from "@/lib/storage";
import { adminListThemes } from "@/lib/themes";
import type { CreatorTheme, PosterEntry } from "@/lib/types";

const MEDIA_TYPES = [
  { value: "movie", label: "Movie", icon: <MovieOutlinedIcon /> },
  { value: "collection", label: "Collection", icon: <CollectionsOutlinedIcon /> },
  { value: "show", label: "TV Show", icon: <TvOutlinedIcon /> },
  { value: "season", label: "Season", icon: <ViewDayOutlinedIcon /> },
  { value: "episode", label: "Episode", icon: <PhotoSizeSelectActualOutlinedIcon /> },
  { value: "backdrop", label: "Backdrop", icon: <ImageOutlinedIcon /> },
] as const;

const STEPS = ["Media type", "Which title?", "Theme", "Upload"];

export default function StudioUploadPage() {
  return <Suspense><StudioUploadPageInner /></Suspense>;
}

function StudioUploadPageInner() {
  const t = useTranslations("upload");
  const tc = useTranslations("common");
  const router = useRouter();

  const [conn, setConn] = useState<ReturnType<typeof loadCreatorConnection>>(null);
  const [mounted, setMounted] = useState(false);
  const nodeUrl = conn?.nodeUrl?.replace(/\/+$/, "") ?? "";
  const params = useSearchParams();

  useEffect(() => {
    setConn(loadCreatorConnection());
    setMounted(true);
  }, []);

  const [step, setStep] = useState(0);
  const [mediaType, setMediaType] = useState<string>("");
  const [artworkKind, setArtworkKind] = useState("poster");
  const [tmdbId, setTmdbId] = useState("");
  const [showTmdbId, setShowTmdbId] = useState("");
  const [collectionTmdbId, setCollectionTmdbId] = useState("");
  const [seasonNumber, setSeasonNumber] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState("");
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [themeId, setThemeId] = useState<string>("");
  const [themes, setThemes] = useState<CreatorTheme[]>([]);
  const [redistribution, setRedistribution] = useState("mirrors-approved");
  const [license, setLicense] = useState("all-rights-reserved");
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [fullFile, setFullFile] = useState<File | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PosterEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Pre-fill from query params (e.g. coming from a placeholder card)
  useEffect(() => {
    const mt = params.get("media_type");
    const tid = params.get("tmdb_id");
    const ttl = params.get("title");
    const yr = params.get("year");
    const ctid = params.get("collection_tmdb_id");
    const knd = params.get("kind");
    if (mt) setMediaType(mt);
    if (tid) setTmdbId(tid);
    if (ttl) setTitle(ttl);
    if (yr) setYear(yr);
    if (ctid) setCollectionTmdbId(ctid);
    if (knd) setArtworkKind(knd);
    if (tid) setStep(2); // skip ahead to theme step since type+title are already known
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  // Load themes using creator ID from the saved connection
  useEffect(() => {
    if (!conn?.creatorId) return;
    adminListThemes(nodeUrl, conn.adminToken, conn.creatorId).then(setThemes).catch(() => undefined);
  }, [conn, nodeUrl]);

  // Revoke object URL on unmount
  useEffect(() => {
    return () => { if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl); };
  }, [previewObjectUrl]);

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

  function handlePreviewFile(f: File | null) {
    setPreviewFile(f);
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    setPreviewObjectUrl(f ? URL.createObjectURL(f) : null);
  }

  async function handleUpload() {
    if (!conn) { setStatus(t("notConnected")); return; }
    if (!previewFile || !fullFile) { setStatus(t("selectFiles")); return; }

    setUploading(true);
    setStatus(t("uploading"));

    const fd = new FormData();
    fd.set("tmdb_id", tmdbId);
    fd.set("media_type", mediaType);
    if (artworkKind && artworkKind !== "poster") fd.set("kind", artworkKind);
    if (showTmdbId.trim()) fd.set("show_tmdb_id", showTmdbId.trim());
    if (collectionTmdbId.trim()) fd.set("collection_tmdb_id", collectionTmdbId.trim());
    if (seasonNumber.trim()) fd.set("season_number", seasonNumber.trim());
    if (episodeNumber.trim()) fd.set("episode_number", episodeNumber.trim());
    if (title.trim()) fd.set("title", title.trim());
    if (year.trim()) fd.set("year", year.trim());
    fd.set("creator_id", conn.creatorId);
    fd.set("creator_display_name", conn.creatorId);
    if (themeId) fd.set("theme_id", themeId);
    fd.set("attribution_redistribution", redistribution);
    fd.set("attribution_license", license);
    fd.set("preview", previewFile);
    fd.set("full", fullFile);

    try {
      const r = await fetch(`${nodeUrl}/v1/admin/posters`, {
        method: "POST",
        headers: { authorization: `Bearer ${conn.adminToken}` },
        body: fd,
      });

      const json = await r.json().catch(() => null);
      if (!r.ok) {
        setStatus(t("uploadFailed", { status: String(r.status), details: JSON.stringify(json) }));
        return;
      }

      setStatus(t("uploadedRedirecting"));
      setTimeout(() => { router.push("/studio"); }, 500);
    } finally {
      setUploading(false);
    }
  }

  if (!mounted) return null;

  if (!conn) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Alert severity="warning">
          {t("notConnected")} <Link href="/settings">Settings</Link>.
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>{t("title")}</Typography>

        <Stepper activeStep={step} alternativeLabel>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Paper sx={{ p: 3 }}>
          {/* Step 0 — Media type */}
          {step === 0 && (
            <Stack spacing={2}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>What type of artwork is this?</Typography>
              <Grid container spacing={2}>
                {MEDIA_TYPES.map(({ value, label, icon }) => (
                  <Grid key={value} size={{ xs: 6, sm: 4 }}>
                    <ArtworkCardFrame
                      media={
                        <Box
                          sx={{
                            aspectRatio: "4 / 3",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            bgcolor: "action.hover",
                            color: mediaType === value ? "primary.main" : "text.secondary",
                            fontSize: "2rem",
                          }}
                        >
                          {icon}
                        </Box>
                      }
                      title={label}
                      onClick={() => { setMediaType(value); setStep(1); }}
                      selected={mediaType === value}
                      containerSx={{ height: "100%" }}
                    />
                  </Grid>
                ))}
              </Grid>
            </Stack>
          )}

          {/* Step 1 — Which title */}
          {step === 1 && (
            <Stack spacing={2}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Which title?</Typography>
              <Stack direction="row" spacing={1}>
                <TextField
                  label="TMDB ID or title search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
                  fullWidth
                />
                <Button onClick={() => void handleSearch()} disabled={searching}>
                  {searching ? tc("loading") : tc("search")}
                </Button>
              </Stack>

              {searchResults.length > 0 && (
                <Stack spacing={1}>
                  {searchResults.map((p) => (
                    <Box
                      key={p.poster_id}
                      onClick={() => pickSearchResult(p)}
                      sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
                    >
                      <Typography variant="body2" fontWeight={700}>{p.media.title ?? `TMDB ${p.media.tmdb_id}`}</Typography>
                      <Typography variant="caption" color="text.secondary">{p.media.type}{p.media.year ? ` · ${p.media.year}` : ""} · TMDB {p.media.tmdb_id}</Typography>
                    </Box>
                  ))}
                </Stack>
              )}

              <Divider />
              <Typography variant="caption" color="text.secondary">Or enter details manually:</Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField label={t("tmdbId")} value={tmdbId} onChange={(e) => setTmdbId(e.target.value)} fullWidth />
                <TextField label={t("titleLabel")} value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
                <TextField label={t("year")} value={year} onChange={(e) => setYear(e.target.value)} sx={{ minWidth: 100 }} />
              </Stack>
              {(mediaType === "season" || mediaType === "episode") && (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField label={t("showTmdbId")} value={showTmdbId} onChange={(e) => setShowTmdbId(e.target.value)} fullWidth placeholder={t("showTmdbIdPlaceholder")} />
                  <TextField label={t("seasonNumber")} value={seasonNumber} onChange={(e) => setSeasonNumber(e.target.value)} fullWidth />
                  {mediaType === "episode" && (
                    <TextField label={t("episodeNumber")} value={episodeNumber} onChange={(e) => setEpisodeNumber(e.target.value)} fullWidth />
                  )}
                </Stack>
              )}
              {(mediaType === "movie" || mediaType === "backdrop") && (
                <TextField label={t("collectionTmdbId")} value={collectionTmdbId} onChange={(e) => setCollectionTmdbId(e.target.value)} fullWidth placeholder={t("collectionTmdbIdPlaceholder")} />
              )}
              {["movie", "show", "collection", "season"].includes(mediaType) && (
                <Stack spacing={1}>
                  <Typography variant="body2" fontWeight={700}>{t("artworkKind")}</Typography>
                  <ToggleButtonGroup
                    value={artworkKind}
                    exclusive
                    onChange={(_, v) => { if (v) setArtworkKind(v); }}
                    size="small"
                  >
                    <ToggleButton value="poster">{t("kindPoster")}</ToggleButton>
                    <ToggleButton value="background">{t("kindBackground")}</ToggleButton>
                    {["movie", "show", "collection"].includes(mediaType) && (
                      <ToggleButton value="square">{t("kindSquare")}</ToggleButton>
                    )}
                    {["movie", "show", "collection"].includes(mediaType) && (
                      <ToggleButton value="logo">{t("kindLogo")}</ToggleButton>
                    )}
                  </ToggleButtonGroup>
                </Stack>
              )}
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button variant="outlined" onClick={() => setStep(0)}>Back</Button>
                <Button onClick={() => setStep(2)} disabled={!tmdbId.trim()}>Next</Button>
              </Stack>
            </Stack>
          )}

          {/* Step 2 — Theme */}
          {step === 2 && (
            <Stack spacing={2}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Which theme?</Typography>
              <TextField
                select
                label="Theme (optional)"
                value={themeId}
                onChange={(e) => setThemeId(e.target.value)}
                fullWidth
              >
                <MenuItem value="">(No theme)</MenuItem>
                {themes.map((th) => (
                  <MenuItem key={th.theme_id} value={th.theme_id}>{th.name}</MenuItem>
                ))}
              </TextField>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button variant="outlined" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => setStep(3)}>Next</Button>
              </Stack>
            </Stack>
          )}

          {/* Step 3 — Files */}
          {step === 3 && (
            <Stack spacing={2}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Upload files</Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={700} gutterBottom>{t("previewFile")}</Typography>
                  <input type="file" accept="image/jpeg,image/png" onChange={(e) => handlePreviewFile(e.target.files?.[0] ?? null)} />
                </Box>
                {previewObjectUrl && (
                  <Box
                    component="img"
                    src={previewObjectUrl}
                    alt="Preview"
                    sx={{ width: 120, height: "auto", borderRadius: 1, border: 1, borderColor: "divider" }}
                  />
                )}
              </Stack>

              <Box>
                <Typography variant="body2" fontWeight={700} gutterBottom>{t("fullFile")}</Typography>
                <input type="file" accept="image/jpeg,image/png" onChange={(e) => setFullFile(e.target.files?.[0] ?? null)} />
              </Box>

              <Divider />

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  select
                  label={t("redistribution")}
                  value={redistribution}
                  onChange={(e) => setRedistribution(e.target.value)}
                  fullWidth
                >
                  {["public-cache-ok", "mirrors-approved", "none"].map((v) => (
                    <MenuItem key={v} value={v}>{v}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label={t("license")}
                  value={license}
                  onChange={(e) => setLicense(e.target.value)}
                  fullWidth
                >
                  {["all-rights-reserved", "cc-by-4.0", "cc-by-nc-4.0"].map((v) => (
                    <MenuItem key={v} value={v}>{v}</MenuItem>
                  ))}
                </TextField>
              </Stack>

              {status && (
                <Alert severity={status.includes("failed") || status.includes("Failed") ? "error" : "info"}>{status}</Alert>
              )}

              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button variant="outlined" onClick={() => setStep(2)} disabled={uploading}>Back</Button>
                <Button onClick={() => void handleUpload()} disabled={uploading || !previewFile || !fullFile}>
                  {uploading ? t("uploading") : tc("upload")}
                </Button>
              </Stack>
            </Stack>
          )}
        </Paper>
      </Stack>
    </Container>
  );
}
