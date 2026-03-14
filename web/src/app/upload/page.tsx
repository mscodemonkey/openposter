"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { loadCreatorConnection } from "@/lib/storage";

export default function UploadPage() {
  const t = useTranslations("upload");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const conn = loadCreatorConnection();
  const baseUrl = useMemo(() => conn?.nodeUrl?.replace(/\/+$/, "") || "", [conn]);

  const [tmdbId, setTmdbId] = useState("2316");
  const [mediaType, setMediaType] = useState("show");
  const [showTmdbId, setShowTmdbId] = useState("");
  const [seasonNumber, setSeasonNumber] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState("");
  const [title, setTitle] = useState("The Office");
  const [year, setYear] = useState("2005");
  const [creatorId, setCreatorId] = useState("cr_creator_a");
  const [creatorName, setCreatorName] = useState("Creator A");
  const [redistribution, setRedistribution] = useState("mirrors-approved");
  const [license, setLicense] = useState("all-rights-reserved");
  const [linksJson, setLinksJson] = useState("");

  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [fullFile, setFullFile] = useState<File | null>(null);

  const [status, setStatus] = useState<string | null>(null);

  async function upload() {
    if (!conn) {
      setStatus(t("notConnected"));
      return;
    }
    if (!previewFile || !fullFile) {
      setStatus(t("selectFiles"));
      return;
    }

    setStatus(t("uploading"));

    const fd = new FormData();
    fd.set("tmdb_id", tmdbId);
    fd.set("media_type", mediaType);
    if (showTmdbId.trim() !== "") fd.set("show_tmdb_id", showTmdbId.trim());
    if (seasonNumber.trim() !== "") fd.set("season_number", seasonNumber.trim());
    if (episodeNumber.trim() !== "") fd.set("episode_number", episodeNumber.trim());
    fd.set("title", title);
    fd.set("year", year);
    fd.set("creator_id", creatorId);
    fd.set("creator_display_name", creatorName);
    if (linksJson.trim() !== "") fd.set("links_json", linksJson.trim());
    fd.set("attribution_redistribution", redistribution);
    fd.set("attribution_license", license);
    fd.set("preview", previewFile);
    fd.set("full", fullFile);

    const r = await fetch(baseUrl + "/v1/admin/posters", {
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
    setTimeout(() => {
      window.location.href = "/library?check=1";
    }, 500);
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("description")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("afterUploadRedirect")} <Link href="/library">{tn("myLibrary")}</Link>.
          </Typography>
        </Box>

        {!conn ? (
          <Alert severity="warning">
            {t("notConnected")} <Link href="/settings">{tn("settings")}</Link>.
          </Alert>
        ) : (
          <Alert severity="success">
            {t("connectedNode", { url: baseUrl })}
          </Alert>
        )}

        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label={t("tmdbId")} value={tmdbId} onChange={(e) => setTmdbId(e.target.value)} fullWidth />
              <TextField
                select
                label={t("mediaType")}
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value)}
                SelectProps={{ native: true }}
                sx={{ minWidth: 200 }}
              >
                {(["movie", "show", "season", "episode", "collection"] as const).map((mt) => (
                  <option key={mt} value={mt}>
                    {mt}
                  </option>
                ))}
              </TextField>
            </Stack>

            <TextField
              label={t("showTmdbId")}
              value={showTmdbId}
              onChange={(e) => setShowTmdbId(e.target.value)}
              placeholder={t("showTmdbIdPlaceholder")}
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label={t("seasonNumber")} value={seasonNumber} onChange={(e) => setSeasonNumber(e.target.value)} fullWidth />
              <TextField label={t("episodeNumber")} value={episodeNumber} onChange={(e) => setEpisodeNumber(e.target.value)} fullWidth />
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label={t("titleLabel")} value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
              <TextField label={t("year")} value={year} onChange={(e) => setYear(e.target.value)} sx={{ minWidth: 140 }} />
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label={t("creatorId")} value={creatorId} onChange={(e) => setCreatorId(e.target.value)} fullWidth />
              <TextField label={t("creatorName")} value={creatorName} onChange={(e) => setCreatorName(e.target.value)} fullWidth />
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                select
                label={t("redistribution")}
                value={redistribution}
                onChange={(e) => setRedistribution(e.target.value)}
                SelectProps={{ native: true }}
                sx={{ minWidth: 220 }}
              >
                {(["public-cache-ok", "mirrors-approved", "none"] as const).map((mt) => (
                  <option key={mt} value={mt}>
                    {mt}
                  </option>
                ))}
              </TextField>
              <TextField label={t("license")} value={license} onChange={(e) => setLicense(e.target.value)} fullWidth />
            </Stack>

            <TextField
              label={t("relatedLinks")}
              value={linksJson}
              onChange={(e) => setLinksJson(e.target.value)}
              placeholder={t("relatedLinksPlaceholder")}
              multiline
              minRows={3}
            />

            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
                {t("previewFile")}
              </Typography>
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) => setPreviewFile(e.target.files?.[0] || null)}
              />
            </Stack>

            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
                {t("fullFile")}
              </Typography>
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) => setFullFile(e.target.files?.[0] || null)}
              />
            </Stack>

            <Button disabled={!conn} onClick={() => void upload()}>
              {tc("upload")}
            </Button>

            {status && <Alert severity={status.includes("failed") ? "error" : "info"}>{status}</Alert>}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
