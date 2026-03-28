"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
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
import { fetchSyncStatus, triggerSync, type SyncStatus } from "@/lib/media-server";
import { detectMediaServer, listMediaServers, addMediaServer, removeMediaServer, type MediaServerConfig, type DetectResult } from "@/lib/media-servers";
import { getArtworkSettings, removeAllPlexLabels, saveArtworkSettings } from "@/lib/artwork-tracking";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const tms = useTranslations("mediaServers");
  const [nodeUrl, setNodeUrl] = useState("http://localhost:8081");
  const [adminToken, setAdminToken] = useState("");
  const [connStatus, setConnStatus] = useState<string | null>(null);
  const [issuerUser, setIssuerUser] = useState<ReturnType<typeof loadIssuerUser>>(null);

  // Media servers state
  const [servers, setServers] = useState<MediaServerConfig[]>([]);
  const [syncStatuses, setSyncStatuses] = useState<Record<string, SyncStatus>>({});

  // Add-server form state
  const [addingServer, setAddingServer] = useState(false);
  const [detectUrl, setDetectUrl] = useState("");
  const [detectToken, setDetectToken] = useState("");
  const [detected, setDetected] = useState<DetectResult | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [addTvLibraries, setAddTvLibraries] = useState("");
  const [addMovieLibraries, setAddMovieLibraries] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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
    listMediaServers(conn.nodeUrl, conn.adminToken).then((list) => {
      setServers(list);
      list.forEach((srv) => {
        fetchSyncStatus(conn.nodeUrl, conn.adminToken)
          .then((status) => setSyncStatuses((prev) => ({ ...prev, [srv.id]: status })))
          .catch(() => undefined);
      });
    });
  }, []);

  // Poll sync status for each server — faster while syncing
  useEffect(() => {
    if (!adminToken || servers.length === 0) return;
    const conn = loadCreatorConnection();
    if (!conn) return;
    const isSyncing = Object.values(syncStatuses).some((s) => s.is_syncing);
    const interval = isSyncing ? 2000 : 10000;
    const id = setInterval(() => {
      servers.forEach((srv) => {
        fetchSyncStatus(conn.nodeUrl, conn.adminToken)
          .then((status) => setSyncStatuses((prev) => ({ ...prev, [srv.id]: status })))
          .catch(() => undefined);
      });
    }, interval);
    return () => clearInterval(id);
  }, [adminToken, servers, syncStatuses]);

  function parseCsvLibraries(v: string): string[] {
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }

  async function handleDetect() {
    const conn = loadCreatorConnection();
    if (!conn) return;
    setDetecting(true);
    setDetected(null);
    setDetectError(null);
    try {
      const result = await detectMediaServer(conn.nodeUrl, conn.adminToken, detectUrl.trim(), detectToken);
      setDetected(result);
    } catch (e: unknown) {
      setDetectError(e instanceof Error ? e.message : tms("detectFailed"));
    } finally {
      setDetecting(false);
    }
  }

  async function handleAddServer() {
    const conn = loadCreatorConnection();
    if (!conn || !detected) return;
    setAdding(true);
    setAddError(null);
    try {
      const added = await addMediaServer(conn.nodeUrl, conn.adminToken, {
        type: detected.type,
        name: detected.name,
        base_url: detectUrl.trim(),
        token: detectToken,
        tv_libraries: parseCsvLibraries(addTvLibraries),
        movie_libraries: parseCsvLibraries(addMovieLibraries),
      });
      setServers((prev) => {
        const idx = prev.findIndex((s) => s.id === added.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = added; return next; }
        return [...prev, added];
      });
      setAddingServer(false);
      setDetectUrl(""); setDetectToken(""); setDetected(null);
      setAddTvLibraries(""); setAddMovieLibraries("");
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : tms("addFailed"));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveServer(serverId: string) {
    const conn = loadCreatorConnection();
    if (!conn) return;
    await removeMediaServer(conn.nodeUrl, conn.adminToken, serverId).catch(() => undefined);
    setServers((prev) => prev.filter((s) => s.id !== serverId));
    setSyncStatuses((prev) => { const next = { ...prev }; delete next[serverId]; return next; });
  }

  async function handleSyncNow(serverId: string) {
    const conn = loadCreatorConnection();
    if (!conn) return;
    await triggerSync(conn.nodeUrl, conn.adminToken).catch(() => undefined);
    fetchSyncStatus(conn.nodeUrl, conn.adminToken)
      .then((status) => setSyncStatuses((prev) => ({ ...prev, [serverId]: status })))
      .catch(() => undefined);
  }

  function syncPhaseLabel(phase: string | null): string {
    switch (phase) {
      case "movies": return tms("syncPhaseMovies");
      case "shows": return tms("syncPhaseShows");
      case "collections": return tms("syncPhaseCollections");
      case "collection_children": return tms("syncPhaseCollectionChildren");
      case "seasons": return tms("syncPhaseSeasons");
      case "done": return tms("syncPhaseDone");
      default: return phase ?? "";
    }
  }

  function syncTimeAgo(isoString: string): string {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  async function handleBackdropUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const conn = loadCreatorConnection();
    if (!conn) { setBackdropStatus(t("noNodeConnected")); return; }
    setBackdropPreview(URL.createObjectURL(file));
    setBackdropStatus(t("uploading"));
    try {
      await adminUploadCreatorBackdrop(conn.nodeUrl, conn.adminToken, conn.creatorId, file);
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
                  saveCreatorConnection({ nodeUrl: nodeUrl.replace(/\/+$/, ""), adminToken, creatorId: issuerUser?.handle ?? "" });
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
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
              <Typography variant="h6" sx={{ fontWeight: 800 }}>{tms("title")}</Typography>
              {!addingServer && (
                <Button size="small" onClick={() => setAddingServer(true)}>
                  {tms("addServer")}
                </Button>
              )}
            </Stack>

            {/* Connected server rows */}
            {servers.map((srv) => {
              const sync = syncStatuses[srv.id];
              return (
                <Box key={srv.id} sx={{ borderRadius: 1, border: "1px solid", borderColor: "divider", p: 1.5 }}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    {/* Type badge */}
                    <Box
                      sx={{
                        bgcolor: srv.type === "plex" ? "#e5a00d" : "#00a4dc",
                        color: srv.type === "plex" ? "#000" : "#fff",
                        fontWeight: 900,
                        fontSize: "0.65rem",
                        px: 0.75,
                        py: 0.2,
                        borderRadius: 0.75,
                        letterSpacing: "0.05em",
                        flexShrink: 0,
                        mt: 0.3,
                      }}
                    >
                      {srv.type === "plex" ? tms("plexType") : tms("jellyfinType")}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={700} noWrap>{srv.name}</Typography>
                      <Typography variant="caption" color="text.disabled" noWrap>{srv.base_url}</Typography>
                    </Box>
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      sx={{ flexShrink: 0 }}
                      onClick={() => void handleRemoveServer(srv.id)}
                    >
                      {tms("disconnect")}
                    </Button>
                  </Stack>

                  {/* Sync status */}
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} sx={{ mt: 1 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {sync?.error
                          ? tms("syncError", { error: sync.error })
                          : sync?.last_synced_at
                            ? tms("syncStatus", { time: syncTimeAgo(sync.last_synced_at) })
                            : tms("syncNever")}
                      </Typography>
                      {sync?.is_syncing && sync.current_phase && (
                        <Typography variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>
                          · {syncPhaseLabel(sync.current_phase)}
                        </Typography>
                      )}
                      {sync?.item_count != null && sync.item_count > 0 && !sync.is_syncing && (
                        <Typography variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>
                          · {tms("itemCount", { n: sync.item_count })}
                        </Typography>
                      )}
                    </Box>
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={sync?.is_syncing ?? false}
                      startIcon={sync?.is_syncing ? <CircularProgress size={14} color="inherit" /> : undefined}
                      onClick={() => void handleSyncNow(srv.id)}
                    >
                      {sync?.is_syncing ? tms("syncing") : tms("syncNow")}
                    </Button>
                  </Stack>
                </Box>
              );
            })}

            {servers.length === 0 && !addingServer && (
              <Typography variant="body2" color="text.secondary">{tms("noServers")}</Typography>
            )}

            {/* Add server form */}
            {addingServer && (
              <Box sx={{ borderRadius: 1, border: "1px dashed", borderColor: "divider", p: 1.5 }}>
                <Stack spacing={1.5}>
                  <TextField
                    label={tms("serverUrl")}
                    value={detectUrl}
                    onChange={(e) => { setDetectUrl(e.target.value); setDetected(null); setDetectError(null); }}
                    placeholder="http://192.168.1.10:32400"
                    size="small"
                  />
                  <TextField
                    label={tms("serverToken")}
                    value={detectToken}
                    onChange={(e) => { setDetectToken(e.target.value); setDetected(null); setDetectError(null); }}
                    type="password"
                    size="small"
                  />
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={detecting || !detectUrl || !detectToken}
                      startIcon={detecting ? <CircularProgress size={14} color="inherit" /> : undefined}
                      onClick={() => void handleDetect()}
                    >
                      {detecting ? tms("detecting") : tms("detect")}
                    </Button>
                    <Button size="small" color="inherit" onClick={() => { setAddingServer(false); setDetected(null); setDetectError(null); }}>
                      {tc("cancel")}
                    </Button>
                  </Stack>
                  {detectError && <Alert severity="error">{detectError}</Alert>}
                  {detected && (
                    <>
                      <Alert severity="success">
                        {tms("detected", { name: `${detected.type === "plex" ? tms("plexType") : tms("jellyfinType")} — ${detected.name}` })}
                      </Alert>
                      {detected.type === "plex" && (
                        <>
                          <TextField
                            label={tms("tvLibraries")}
                            value={addTvLibraries}
                            onChange={(e) => setAddTvLibraries(e.target.value)}
                            placeholder="TV Shows"
                            size="small"
                            helperText={tms("libraryHint")}
                          />
                          <TextField
                            label={tms("movieLibraries")}
                            value={addMovieLibraries}
                            onChange={(e) => setAddMovieLibraries(e.target.value)}
                            placeholder="Movies"
                            size="small"
                          />
                        </>
                      )}
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          disabled={adding}
                          startIcon={adding ? <CircularProgress size={14} color="inherit" /> : undefined}
                          onClick={() => void handleAddServer()}
                        >
                          {adding ? tms("adding") : tms("add")}
                        </Button>
                      </Stack>
                      {addError && <Alert severity="error">{addError}</Alert>}
                    </>
                  )}
                </Stack>
              </Box>
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
