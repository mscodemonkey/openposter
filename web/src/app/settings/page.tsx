"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";

import { ISSUER_BASE_URL } from "@/lib/issuer";
import { applyPosterSize, getPosterSize, type PosterSize } from "@/lib/grid-sizes";
import { clearIssuerSession, loadIssuerUser } from "@/lib/issuer_storage";
import { clearCreatorConnection, loadCreatorConnection, saveCreatorConnection } from "@/lib/storage";
import { adminUploadCreatorBackdrop } from "@/lib/themes";
import { disconnectPlex, getPlexStatus, savePlexConnection, testPlexConnection, type PlexStatus } from "@/lib/plex";
import { getArtworkSettings, removeAllPlexLabels, saveArtworkSettings } from "@/lib/artwork-tracking";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const tp = useTranslations("plex");
  const [nodeUrl, setNodeUrl] = useState("http://localhost:8081");
  const [adminToken, setAdminToken] = useState("");
  const [connStatus, setConnStatus] = useState<string | null>(null);
const [issuerUser, setIssuerUser] = useState<ReturnType<typeof loadIssuerUser>>(null);

  // Plex connection state
  const [plexStatus, setPlexStatus] = useState<PlexStatus | null>(null);
  const [plexBaseUrl, setPlexBaseUrl] = useState("");
  const [plexToken, setPlexToken] = useState("");
  const [plexTvLibraries, setPlexTvLibraries] = useState("");
  const [plexMovieLibraries, setPlexMovieLibraries] = useState("");
  const [plexTestOk, setPlexTestOk] = useState(false);
  const [plexStatus2, setPlexStatus2] = useState<string | null>(null);
  const [backdropPreview, setBackdropPreview] = useState<string | null>(null);
  const [backdropStatus, setBackdropStatus] = useState<string | null>(null);
  const backdropInputRef = useRef<HTMLInputElement>(null);

  // Poster size
  const [posterSize, setPosterSize] = useState<PosterSize>("medium");

  // Artwork update settings
  const [autoUpdateArtwork, setAutoUpdateArtwork] = useState(false);
  const [addPlexLabels, setAddPlexLabels] = useState(true);
  const [removingLabels, setRemovingLabels] = useState(false);

  useEffect(() => {
    setPosterSize(getPosterSize());
    const conn = loadCreatorConnection();
    if (conn) {
      setNodeUrl(conn.nodeUrl);
      setAdminToken(conn.adminToken);
    }
    setIssuerUser(loadIssuerUser());

    if (!conn) return;
    getArtworkSettings(conn.nodeUrl, conn.adminToken).then((s) => {
      setAutoUpdateArtwork(s.auto_update_artwork);
      setAddPlexLabels(s.add_plex_labels);
    });
    getPlexStatus(conn.nodeUrl, conn.adminToken).then((s) => {
      setPlexStatus(s);
      if (s.connected) {
        setPlexBaseUrl(s.baseUrl ?? "");
        setPlexTvLibraries((s.tvLibraries ?? []).join(", "));
        setPlexMovieLibraries((s.movieLibraries ?? []).join(", "));
      }
    });
  }, []);

  function parseCsvLibraries(v: string): string[] {
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }

  async function testPlexConn() {
    const conn = loadCreatorConnection();
    if (!conn) { setPlexStatus2(tp("noNodeConnected")); return; }
    setPlexTestOk(false);
    setPlexStatus2(tp("testing"));
    const result = await testPlexConnection(conn.nodeUrl, conn.adminToken, {
      baseUrl: plexBaseUrl.trim().replace(/\/+$/, ""),
      token: plexToken,
      tvLibraries: parseCsvLibraries(plexTvLibraries),
      movieLibraries: parseCsvLibraries(plexMovieLibraries),
    });
    if (result.ok) {
      setPlexTestOk(true);
      setPlexStatus2(tp("testOk"));
    } else {
      setPlexTestOk(false);
      setPlexStatus2(result.error ?? tp("testFailed"));
    }
  }

  async function savePlexConn() {
    const conn = loadCreatorConnection();
    if (!conn) return;
    setPlexStatus2(tp("saving"));
    try {
      await savePlexConnection(conn.nodeUrl, conn.adminToken, {
        baseUrl: plexBaseUrl.trim().replace(/\/+$/, ""),
        token: plexToken,
        tvLibraries: parseCsvLibraries(plexTvLibraries),
        movieLibraries: parseCsvLibraries(plexMovieLibraries),
      });
      setPlexStatus({ connected: true, baseUrl: plexBaseUrl, tvLibraries: parseCsvLibraries(plexTvLibraries), movieLibraries: parseCsvLibraries(plexMovieLibraries) });
      setPlexStatus2(tc("save") + "d.");
    } catch (e: unknown) {
      setPlexStatus2(e instanceof Error ? e.message : String(e));
    }
  }

  async function disconnectPlexConn() {
    const conn = loadCreatorConnection();
    if (!conn) return;
    await disconnectPlex(conn.nodeUrl, conn.adminToken).catch(() => undefined);
    setPlexStatus({ connected: false });
    setPlexBaseUrl(""); setPlexToken(""); setPlexTvLibraries(""); setPlexMovieLibraries("");
    setPlexTestOk(false); setPlexStatus2(null);
  }

  async function handleBackdropUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const conn = loadCreatorConnection();
    if (!conn) { setBackdropStatus(t("noNodeConnected")); return; }
    setBackdropPreview(URL.createObjectURL(file));
    setBackdropStatus(t("uploading"));
    try {
      // derive creator_id from node (best effort — use first poster's creator_id)
      const r = await fetch(`${conn.nodeUrl}/v1/posters?limit=1`, { headers: { Authorization: `Bearer ${conn.adminToken}` } });
      const json = r.ok ? (await r.json() as { results: Array<{ creator: { creator_id: string } }> }) : { results: [] };
      const creatorId = json.results[0]?.creator.creator_id ?? "unknown";
      await adminUploadCreatorBackdrop(conn.nodeUrl, conn.adminToken, creatorId, file);
      setBackdropStatus(t("uploadOk"));
    } catch (err: unknown) {
      setBackdropStatus(err instanceof Error ? err.message : t("uploadFailed"));
    }
  }

  async function handleAutoUpdateToggle(checked: boolean) {
    const conn = loadCreatorConnection();
    if (!conn) return;
    setAutoUpdateArtwork(checked);
    await saveArtworkSettings(conn.nodeUrl, conn.adminToken, { auto_update_artwork: checked });
  }

  async function handlePlexLabelsToggle(checked: boolean) {
    const conn = loadCreatorConnection();
    if (!conn) return;
    if (!checked) {
      setRemovingLabels(true);
      await removeAllPlexLabels(conn.nodeUrl, conn.adminToken);
      setRemovingLabels(false);
      setAddPlexLabels(false);
    } else {
      setAddPlexLabels(true);
      await saveArtworkSettings(conn.nodeUrl, conn.adminToken, { add_plex_labels: true });
    }
  }

  async function testConnection() {
    setConnStatus(t("testing"));
    try {
      const base = nodeUrl.replace(/\/+$/, "");
      const r = await fetch(base + "/v1/health");
      if (!r.ok) throw new Error(`Health failed: ${r.status}`);
      setConnStatus(t("testOk"));
    } catch (e: unknown) {
      setConnStatus(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("title")}
          </Typography>
        </Box>

        <Paper sx={{ p: 3 }}>
          <Stack spacing={1.5}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{t("display")}</Typography>
            <Typography variant="body2" color="text.secondary">{t("posterSizeHint")}</Typography>
            <ToggleButtonGroup
              value={posterSize}
              exclusive
              onChange={(_e, v: PosterSize | null) => {
                if (!v) return;
                setPosterSize(v);
                applyPosterSize(v);
              }}
              size="small"
            >
              <ToggleButton value="small">{t("posterSizeSmall")}</ToggleButton>
              <ToggleButton value="medium">{t("posterSizeMedium")}</ToggleButton>
              <ToggleButton value="large">{t("posterSizeLarge")}</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Stack spacing={1.25}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {t("account")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {tc("issuerLabel", { url: ISSUER_BASE_URL })}
            </Typography>

            {issuerUser ? (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                  {t("loggedInAs", { email: issuerUser.email })}
                </Typography>
                <Button
                  variant="outlined"
                  onClick={() => {
                    clearIssuerSession();
                    window.location.href = "/onboarding";
                  }}
                >
                  {t("logOut")}
                </Button>
              </Stack>
            ) : (
              <Alert severity="info">
                {t("notLoggedIn")} <Link href="/onboarding">{tn("onboarding")}</Link>.
              </Alert>
            )}
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Stack spacing={1.5}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {t("nodeAdminSession")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("nodeAdminDesc")} <Link href="/onboarding">{tn("onboarding")}</Link>.
            </Typography>

            <TextField
              label={t("localUrl")}
              value={nodeUrl}
              onChange={(e) => setNodeUrl(e.target.value)}
              placeholder="http://192.168.1.10:8080"
            />

            <TextField
              label={t("nodeAdminToken")}
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              placeholder={t("nodeAdminTokenPlaceholder")}
              type="password"
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                onClick={() => {
                  saveCreatorConnection({ nodeUrl: nodeUrl.replace(/\/+$/, ""), adminToken });
                  setConnStatus(t("saved"));
                }}
              >
                {tc("save")}
              </Button>
              <Button variant="outlined" onClick={() => void testConnection()}>
                {t("test")}
              </Button>
              <Button
                color="error"
                variant="outlined"
                onClick={() => {
                  clearCreatorConnection();
                  setAdminToken("");
                  setConnStatus(t("disconnected"));
                }}
              >
                {tn("disconnect")}
              </Button>
            </Stack>

            {connStatus && <Alert severity={connStatus.startsWith("OK") ? "success" : "info"}>{connStatus}</Alert>}
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Stack spacing={1.5}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{t("creatorProfile")}</Typography>
            <Typography variant="body2" color="text.secondary">{t("creatorBackdrop")}</Typography>
            <Typography variant="caption" color="text.disabled">{t("creatorBackdropHint")}</Typography>
            {backdropPreview && (
              <Box component="img" src={backdropPreview} alt="backdrop preview" sx={{ width: "100%", maxHeight: 120, objectFit: "cover", borderRadius: 1 }} />
            )}
            <Box>
              <Button
                variant="outlined"
                size="small"
                startIcon={<FileUploadOutlinedIcon />}
                onClick={() => backdropInputRef.current?.click()}
              >
                {t("uploadBackdrop")}
              </Button>
              <input ref={backdropInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => void handleBackdropUpload(e)} />
            </Box>
            {backdropStatus && <Typography variant="caption" color="text.secondary">{backdropStatus}</Typography>}
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                sx={{
                  bgcolor: "#e5a00d",
                  color: "#000",
                  fontWeight: 900,
                  fontSize: "0.7rem",
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  letterSpacing: "0.05em",
                  flexShrink: 0,
                }}
              >
                PLEX
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {tp("sectionTitle")}
              </Typography>
            </Stack>

            {plexStatus?.connected ? (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                  {tp("connected", { url: plexStatus.baseUrl ?? "" })}
                </Typography>
                <Button
                  color="error"
                  variant="outlined"
                  onClick={() => void disconnectPlexConn()}
                >
                  {tn("disconnect")}
                </Button>
              </Stack>
            ) : (
              <>
                <TextField
                  label={tp("baseUrl")}
                  value={plexBaseUrl}
                  onChange={(e) => { setPlexBaseUrl(e.target.value); setPlexTestOk(false); }}
                  placeholder="http://192.168.1.10:32400"
                />
                <TextField
                  label={tp("token")}
                  value={plexToken}
                  onChange={(e) => { setPlexToken(e.target.value); setPlexTestOk(false); }}
                  placeholder={tp("tokenPlaceholder")}
                  type="password"
                />
                <TextField
                  label={tp("tvLibrary")}
                  value={plexTvLibraries}
                  onChange={(e) => { setPlexTvLibraries(e.target.value); setPlexTestOk(false); }}
                  placeholder="TV Shows"
                  helperText={tp("libraryHint")}
                />
                <TextField
                  label={tp("movieLibrary")}
                  value={plexMovieLibraries}
                  onChange={(e) => { setPlexMovieLibraries(e.target.value); setPlexTestOk(false); }}
                  placeholder="Movies"
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button variant="outlined" onClick={() => void testPlexConn()}>
                    {tp("test")}
                  </Button>
                  <Button disabled={!plexTestOk} onClick={() => void savePlexConn()}>
                    {tc("save")}
                  </Button>
                </Stack>
                {plexStatus2 && (
                  <Alert severity={plexTestOk ? "success" : "info"}>{plexStatus2}</Alert>
                )}
              </>
            )}
          </Stack>
        </Paper>
        {adminToken && (
          <Paper sx={{ p: 3 }}>
            <Stack spacing={1.5}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>{t("artworkUpdates")}</Typography>

              <FormControlLabel
                control={
                  <Switch
                    checked={autoUpdateArtwork}
                    onChange={(e) => void handleAutoUpdateToggle(e.target.checked)}
                  />
                }
                label={t("autoUpdateArtwork")}
              />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
                {t("autoUpdateArtworkHint")}
              </Typography>

              {autoUpdateArtwork && (
                <Box sx={{ ml: 4 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={addPlexLabels}
                        onChange={(e) => void handlePlexLabelsToggle(e.target.checked)}
                        disabled={removingLabels}
                      />
                    }
                    label={t("addPlexLabels")}
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
                    {t("addPlexLabelsHint")}
                  </Typography>
                  {removingLabels && (
                    <Alert severity="info" sx={{ mt: 1 }}>{t("removingLabels")}</Alert>
                  )}
                </Box>
              )}
            </Stack>
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
