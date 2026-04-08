"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import DnsRoundedIcon from "@mui/icons-material/DnsRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import LoginRoundedIcon from "@mui/icons-material/LoginRounded";
import RouterRoundedIcon from "@mui/icons-material/RouterRounded";
import VideoLibraryRoundedIcon from "@mui/icons-material/VideoLibraryRounded";

import { useTranslations } from "next-intl";

import PlexMark from "@/components/PlexMark";
import { addMediaServer, detectMediaServer, type DetectResult, type MediaServerConfig } from "@/lib/media-servers";
import { fetchSyncStatus, triggerSync, type SyncStatus } from "@/lib/media-server";
import { loadCreatorConnection } from "@/lib/storage";

type PlexOAuthServer = { name: string; url: string; connections: { uri: string; local: boolean }[] };
type PlexLibrary = { id: string; title: string; type: string };

type WizardConnection = {
  nodeUrl: string;
  adminToken: string;
};

type WizardStep = "choose" | "plex" | "manual" | "done";

export default function MediaServerWizard({
  open,
  connection,
  onClose,
  onAdded,
}: {
  open: boolean;
  connection: WizardConnection | null;
  onClose: () => void;
  onAdded?: (server: MediaServerConfig) => void;
}) {
  const t = useTranslations("mediaServers");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();

  const [step, setStep] = useState<WizardStep>("choose");
  const [detectUrl, setDetectUrl] = useState("");
  const [detectToken, setDetectToken] = useState("");
  const [detected, setDetected] = useState<DetectResult | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [addTvLibraries, setAddTvLibraries] = useState("");
  const [addMovieLibraries, setAddMovieLibraries] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [plexOAuthPolling, setPlexOAuthPolling] = useState(false);
  const [plexOAuthServers, setPlexOAuthServers] = useState<PlexOAuthServer[] | null>(null);
  const [plexOAuthToken, setPlexOAuthToken] = useState<string | null>(null);
  const [plexServerName, setPlexServerName] = useState<string | null>(null);
  const [plexLibraries, setPlexLibraries] = useState<PlexLibrary[] | null>(null);
  const [plexLibraryClass, setPlexLibraryClass] = useState<Record<string, "tv" | "movies" | "ignore">>({});
  const [fetchingLibraries, setFetchingLibraries] = useState(false);
  const [completedServer, setCompletedServer] = useState<MediaServerConfig | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncTrackingActive, setSyncTrackingActive] = useState(false);
  const [syncStartedAt, setSyncStartedAt] = useState<number | null>(null);
  const [hasSeenSyncing, setHasSeenSyncing] = useState(false);
  const plexPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  function getConnection(): WizardConnection | null {
    if (connection) return connection;
    const stored = loadCreatorConnection();
    if (!stored) return null;
    return { nodeUrl: stored.nodeUrl, adminToken: stored.adminToken };
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function resetWizard() {
    setStep("choose");
    setDetectUrl("");
    setDetectToken("");
    setDetected(null);
    setDetectError(null);
    setDetecting(false);
    setAddTvLibraries("");
    setAddMovieLibraries("");
    setAdding(false);
    setAddError(null);
    setPlexOAuthPolling(false);
    setPlexOAuthServers(null);
    setPlexOAuthToken(null);
    setPlexServerName(null);
    setPlexLibraries(null);
    setPlexLibraryClass({});
    setCompletedServer(null);
    setSyncStatus(null);
    setSyncTrackingActive(false);
    setSyncStartedAt(null);
    setHasSeenSyncing(false);
  }

  function parseCsvLibraries(v: string): string[] {
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }

  async function fetchPlexLibraries(url: string, token: string) {
    setFetchingLibraries(true);
    setPlexLibraries(null);
    try {
      const r = await fetch(`/api/plex-libraries?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`);
      const data = (await r.json()) as { libraries?: PlexLibrary[] };
      if (data.libraries) {
        setPlexLibraries(data.libraries);
        const cls: Record<string, "tv" | "movies" | "ignore"> = {};
        data.libraries.forEach((lib) => {
          cls[lib.id] = lib.type === "show" ? "tv" : lib.type === "movie" ? "movies" : "ignore";
        });
        setPlexLibraryClass(cls);
      }
    } catch {
      // UI shows fallback state.
    }
    setFetchingLibraries(false);
  }

  async function finalizeAdd(config: Omit<MediaServerConfig, "id"> & { id?: string; token: string }) {
    const activeConnection = getConnection();
    console.debug("[MediaServerWizard] finalizeAdd:start", {
      connection: activeConnection,
      config: {
        id: config.id ?? null,
        type: config.type,
        name: config.name,
        base_url: config.base_url,
        tv_libraries: config.tv_libraries,
        movie_libraries: config.movie_libraries,
      },
    });
    if (!activeConnection) {
      throw new Error("Node session missing. Please reconnect your node and try again.");
    }
    const added = await addMediaServer(activeConnection.nodeUrl, activeConnection.adminToken, config);
    onAdded?.(added);
    console.debug("[MediaServerWizard] finalizeAdd:added", { added });
    if (mountedRef.current) {
      setCompletedServer(added);
      setStep("done");
      const startedAt = Date.now();
      setSyncStartedAt(startedAt);
      setSyncTrackingActive(true);
      setAdding(false);
    }
    void triggerSync(activeConnection.nodeUrl, activeConnection.adminToken, added.id)
      .then((result) => {
        console.debug("[MediaServerWizard] finalizeAdd:triggerSync", {
          nodeUrl: activeConnection.nodeUrl,
          result,
        });
      })
      .catch((error: unknown) => {
        console.error("[MediaServerWizard] finalizeAdd:triggerSync:error", {
          nodeUrl: activeConnection.nodeUrl,
          error: error instanceof Error ? { name: error.name, message: error.message } : error,
        });
      });
  }

  function handleFinishSetup() {
    if (pathname !== "/my-media") {
      router.push("/my-media");
    }
    resetWizard();
    onClose();
  }

  function syncPhaseLabel(phase: string | null): string {
    switch (phase) {
      case "movies": return t("syncPhaseMovies");
      case "shows": return t("syncPhaseShows");
      case "collections": return t("syncPhaseCollections");
      case "collection_children": return t("syncPhaseCollectionChildren");
      case "seasons": return t("syncPhaseSeasons");
      case "done": return t("syncPhaseDone");
      default: return "";
    }
  }

  function beginPlexPolling(pinId: number) {
    if (plexPollRef.current) {
      clearInterval(plexPollRef.current);
      plexPollRef.current = null;
    }

    setStep("plex");
    setPlexOAuthPolling(true);

    async function runPoll() {
      try {
        const poll = await fetch(`/api/plex-oauth/poll/${pinId}`);
        if (!poll.ok) return;
        const data = (await poll.json()) as { done: boolean; token?: string; servers?: PlexOAuthServer[] };
        if (!data.done || !data.token) return;

        if (plexPollRef.current) clearInterval(plexPollRef.current);
        plexPollRef.current = null;
        setPlexOAuthPolling(false);
        setPlexOAuthToken(data.token);

        const srvs = data.servers ?? [];
        if (srvs.length === 0) {
          setDetectError(t("plexNoServersFound"));
          return;
        }
        if (srvs.length > 1) {
          setPlexOAuthServers(srvs);
          return;
        }
        setPlexServerName(srvs[0].name);
        setDetectUrl(srvs[0].url);
        if (srvs[0].connections.length > 1) {
          setPlexOAuthServers(srvs);
        }
        void fetchPlexLibraries(srvs[0].url, data.token);
      } catch {
        // keep polling
      }
    }

    plexPollRef.current = setInterval(() => void runPoll(), 2000);
    void runPoll();
  }

  async function handlePlexOAuth() {
    setStep("plex");
    setDetectError(null);
    setAddError(null);
    setPlexOAuthServers(null);
    setPlexOAuthToken(null);
    setPlexServerName(null);
    setPlexLibraries(null);
    setPlexLibraryClass({});
    try {
      const res = await fetch("/api/plex-oauth/start", { method: "POST" });
      if (!res.ok) throw new Error("Could not start Plex sign-in");
      const { id, code, clientIdentifier } = (await res.json()) as { id: number; code: string; clientIdentifier: string };
      const authUrl = `https://app.plex.tv/auth#?clientID=${clientIdentifier}&code=${code}&context[device][product]=OpenPoster`;
      window.open(authUrl, "openposter-plex-auth", "popup=yes,width=520,height=720");
      beginPlexPolling(id);
    } catch (e: unknown) {
      setDetectError(e instanceof Error ? e.message : t("plexSignInFailed"));
    }
  }

  async function handleDetect() {
    const activeConnection = getConnection();
    if (!activeConnection) {
      setDetectError("Node session missing. Please reconnect your node and try again.");
      return;
    }
    setDetecting(true);
    setDetected(null);
    setDetectError(null);
    try {
      const result = await detectMediaServer(activeConnection.nodeUrl, activeConnection.adminToken, detectUrl.trim(), detectToken);
      setDetected(result);
    } catch (e: unknown) {
      setDetectError(e instanceof Error ? e.message : t("detectFailed"));
    } finally {
      setDetecting(false);
    }
  }

  async function handleAddManualServer() {
    if (!detected) return;
    const activeConnection = getConnection();
    console.debug("[MediaServerWizard] handleAddManualServer:click", {
      connection: activeConnection,
      detectUrl,
      detected,
      addTvLibraries,
      addMovieLibraries,
    });
    setAdding(true);
    setAddError(null);
    try {
      await finalizeAdd({
        type: detected.type,
        name: detected.name,
        base_url: detectUrl.trim(),
        token: detectToken,
        tv_libraries: parseCsvLibraries(addTvLibraries),
        movie_libraries: parseCsvLibraries(addMovieLibraries),
      });
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setAddError(e instanceof Error ? e.message : t("addFailed"));
      setAdding(false);
    }
  }

  async function handleAddPlexOAuth() {
    if (!plexOAuthToken || !plexServerName) return;
    const activeConnection = getConnection();
    console.debug("[MediaServerWizard] handleAddPlexOAuth:click", {
      connection: activeConnection,
      detectUrl,
      plexServerName,
      plexLibraries,
      plexLibraryClass,
    });
    setAdding(true);
    setAddError(null);
    const tvLibs = (plexLibraries ?? [])
      .filter((lib) => plexLibraryClass[lib.id] === "tv")
      .map((lib) => lib.title);
    const movieLibs = (plexLibraries ?? [])
      .filter((lib) => plexLibraryClass[lib.id] === "movies")
      .map((lib) => lib.title);
    try {
      await finalizeAdd({
        type: "plex",
        name: plexServerName,
        base_url: detectUrl,
        token: plexOAuthToken,
        tv_libraries: tvLibs,
        movie_libraries: movieLibs,
      });
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setAddError(e instanceof Error ? e.message : t("addFailed"));
      setAdding(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setAddError(null);
    setDetectError(null);
  }, [open]);

  useEffect(() => {
    const activeConnection = getConnection();
    if (!open || step !== "done" || !completedServer || !activeConnection || !syncTrackingActive) return;

    const capturedConnection = activeConnection;
    const capturedServer = completedServer;
    let cancelled = false;

    async function pollSync() {
      try {
        const status = await fetchSyncStatus(capturedConnection.nodeUrl, capturedConnection.adminToken, capturedServer.id);
        if (cancelled || !mountedRef.current) return;
        setSyncStatus(status);
        if (status.is_syncing) {
          setHasSeenSyncing(true);
          return;
        }

        const finishedAfterStart = !!syncStartedAt && !!status.last_synced_at
          && new Date(status.last_synced_at).getTime() >= syncStartedAt - 1000;

        if (hasSeenSyncing || finishedAfterStart) {
          handleFinishSetup();
        }
      } catch {
        // Keep the completion screen usable even if polling fails.
      }
    }

    void pollSync();
    const intervalId = setInterval(() => void pollSync(), 2000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [open, step, completedServer, connection, syncTrackingActive, syncStartedAt, hasSeenSyncing]);

  function handleClose() {
    if (plexPollRef.current) {
      clearInterval(plexPollRef.current);
      plexPollRef.current = null;
    }
    resetWizard();
    onClose();
  }

  const isPlexLibraryStep = step === "plex" && (!!plexServerName || !!plexOAuthServers || !!plexLibraries || fetchingLibraries);
  const activeStep = step === "choose" ? 0 : step === "done" ? 2 : isPlexLibraryStep ? 2 : step === "plex" ? 1 : 2;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>{t("wizardTitle")}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          <Stepper activeStep={activeStep} alternativeLabel>
            <Step><StepLabel>{t("wizardStepChoose")}</StepLabel></Step>
            <Step><StepLabel>{t("wizardStepConnect")}</StepLabel></Step>
            <Step><StepLabel>{t("wizardStepLibraries")}</StepLabel></Step>
          </Stepper>

          {step === "choose" && (
            <Stack spacing={2.5}>
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="h5" fontWeight={900} gutterBottom>{t("wizardChooseTitle")}</Typography>
                <Typography color="text.secondary">{t("wizardChooseDescription")}</Typography>
              </Box>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <Paper variant="outlined" sx={{ flex: 1, p: 3, borderRadius: 3 }}>
                  <Stack spacing={2}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <PlexMark height={24} />
                      <Typography variant="h6" fontWeight={800}>{t("wizardPlexTitle")}</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">{t("wizardPlexDescription")}</Typography>
                    <Button variant="contained" startIcon={<LoginRoundedIcon />} onClick={() => void handlePlexOAuth()}>
                      {t("signInWithPlex")}
                    </Button>
                  </Stack>
                </Paper>
                <Paper variant="outlined" sx={{ flex: 1, p: 3, borderRadius: 3 }}>
                  <Stack spacing={2}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <RouterRoundedIcon color="primary" />
                      <Typography variant="h6" fontWeight={800}>{t("wizardManualTitle")}</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">{t("wizardManualDescription")}</Typography>
                    <Button variant="outlined" startIcon={<DnsRoundedIcon />} onClick={() => setStep("manual")}>
                      {t("wizardManualCta")}
                    </Button>
                  </Stack>
                </Paper>
              </Stack>
            </Stack>
          )}

          {step === "plex" && (
            <Stack spacing={2}>
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="h5" fontWeight={900} gutterBottom>
                  {isPlexLibraryStep ? t("wizardLibrariesTitle") : t("wizardPlexFlowTitle")}
                </Typography>
                <Typography color="text.secondary">
                  {isPlexLibraryStep ? t("wizardLibrariesDescription") : t("wizardPlexFlowDescription")}
                </Typography>
              </Box>

              {plexOAuthPolling && (
                <Alert severity="info">{t("plexAuthOpened")}</Alert>
              )}
              {detectError && <Alert severity="error">{detectError}</Alert>}

              {plexOAuthServers && plexOAuthServers.length > 1 && (
                <FormControl size="small">
                  <InputLabel>{t("plexSelectServer")}</InputLabel>
                  <Select
                    label={t("plexSelectServer")}
                    value={detectUrl}
                    onChange={(e) => {
                      const picked = plexOAuthServers.find((s) => s.url === e.target.value);
                      if (!picked) return;
                      setDetectUrl(picked.url);
                      setPlexServerName(picked.name);
                      setPlexOAuthServers(picked.connections.length > 1 ? [picked] : null);
                      void fetchPlexLibraries(picked.url, plexOAuthToken ?? "");
                    }}
                  >
                    {plexOAuthServers.map((srv) => (
                      <MenuItem key={srv.url} value={srv.url}>{srv.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {plexServerName && (
                <>
                  {fetchingLibraries && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CircularProgress size={16} />
                      <Typography variant="caption" color="text.secondary">{t("fetchingLibraries")}</Typography>
                    </Stack>
                  )}
                  {!fetchingLibraries && plexLibraries && (
                    <TableContainer>
                      <Table size="small">
                        <TableBody>
                          {plexLibraries.map((lib) => (
                            <TableRow key={lib.id} sx={{ "& td": { borderBottom: 0 } }}>
                              <TableCell sx={{ pl: 0, py: 0.5 }}>{lib.title}</TableCell>
                              <TableCell sx={{ pr: 0, py: 0.5 }} align="right">
                                <Select
                                  size="small"
                                  value={plexLibraryClass[lib.id] ?? "ignore"}
                                  onChange={(e) => setPlexLibraryClass((p) => ({ ...p, [lib.id]: e.target.value as "tv" | "movies" | "ignore" }))}
                                  sx={{ minWidth: 120 }}
                                >
                                  <MenuItem value="tv">{t("libTv")}</MenuItem>
                                  <MenuItem value="movies">{t("libMovies")}</MenuItem>
                                  <MenuItem value="ignore">{t("libIgnore")}</MenuItem>
                                </Select>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                  {!fetchingLibraries && !plexLibraries && (
                    <Alert severity="warning">{t("plexLibrariesFailed")}</Alert>
                  )}
                </>
              )}

              {addError && <Alert severity="error">{addError}</Alert>}
            </Stack>
          )}

          {step === "manual" && (
            <Stack spacing={2}>
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="h5" fontWeight={900} gutterBottom>{t("wizardManualFlowTitle")}</Typography>
                <Typography color="text.secondary">{t("wizardManualFlowDescription")}</Typography>
              </Box>
              <TextField
                label={t("serverUrl")}
                value={detectUrl}
                onChange={(e) => {
                  setDetectUrl(e.target.value);
                  setDetected(null);
                  setDetectError(null);
                }}
                placeholder="http://192.168.1.10:32400"
                size="small"
              />
              <TextField
                label={t("serverToken")}
                value={detectToken}
                onChange={(e) => {
                  setDetectToken(e.target.value);
                  setDetected(null);
                  setDetectError(null);
                }}
                type="password"
                size="small"
              />
              {detectError && <Alert severity="error">{detectError}</Alert>}
              {detected && (
                <>
                  <Alert severity="success">
                    {t("detected", { name: `${detected.type === "plex" ? t("plexType") : t("jellyfinType")} — ${detected.name}` })}
                  </Alert>
                  <TextField
                    label={t("tvLibraries")}
                    value={addTvLibraries}
                    onChange={(e) => setAddTvLibraries(e.target.value)}
                    placeholder="TV Shows"
                    size="small"
                    helperText={t("libraryHint")}
                  />
                  <TextField
                    label={t("movieLibraries")}
                    value={addMovieLibraries}
                    onChange={(e) => setAddMovieLibraries(e.target.value)}
                    placeholder="Movies"
                    size="small"
                  />
                </>
              )}
              {addError && <Alert severity="error">{addError}</Alert>}
            </Stack>
          )}

          {step === "done" && completedServer && (
            <Stack spacing={3} alignItems="center" sx={{ py: 2, textAlign: "center" }}>
              <Box
                sx={{
                  width: 88,
                  height: 88,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  bgcolor: (theme) => `${theme.palette.success.main}22`,
                  color: "success.main",
                }}
              >
                <CheckCircleRoundedIcon sx={{ fontSize: "3.5rem" }} />
              </Box>
              <Box>
                <Typography variant="h4" fontWeight={900} gutterBottom>
                  {t("wizardDoneTitle", { name: completedServer.name })}
                </Typography>
                <Typography color="text.secondary" sx={{ maxWidth: 640, mx: "auto" }}>
                  {t("wizardDoneDescription", {
                    type: completedServer.type === "plex" ? t("plexType") : t("jellyfinType"),
                  })}
                </Typography>
              </Box>
              {syncTrackingActive && (
                <Stack spacing={1.25} sx={{ width: "100%", maxWidth: 640 }}>
                  <LinearProgress />
                  <Typography variant="body2" color="text.secondary">
                    {syncStatus?.is_syncing && syncPhaseLabel(syncStatus.current_phase)
                      ? t("wizardSyncingPhase", { phase: syncPhaseLabel(syncStatus.current_phase) })
                      : t("wizardSyncing")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t("wizardCloseAnytime")}
                  </Typography>
                </Stack>
              )}
              {addError && <Alert severity="error" sx={{ maxWidth: 640 }}>{addError}</Alert>}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {step !== "choose" && step !== "done" ? (
          <Button color="inherit" onClick={() => {
            setAddError(null);
            setDetectError(null);
            if (step === "plex") {
              setStep("choose");
              setPlexOAuthPolling(false);
              setPlexOAuthServers(null);
              setPlexOAuthToken(null);
              setPlexServerName(null);
              setPlexLibraries(null);
              setPlexLibraryClass({});
            } else {
              setStep("choose");
              setDetected(null);
            }
          }}>
            {tc("back")}
          </Button>
        ) : <Box sx={{ flex: 1 }} />}
        {step !== "done" && <Button color="inherit" onClick={handleClose}>{tc("cancel")}</Button>}
        {step === "manual" && !detected && (
          <Button
            variant="outlined"
            disabled={detecting || !detectUrl || !detectToken || !getConnection()}
            startIcon={detecting ? <CircularProgress size={14} color="inherit" /> : <DnsRoundedIcon />}
            onClick={() => void handleDetect()}
          >
            {detecting ? t("detecting") : t("detect")}
          </Button>
        )}
        {step === "plex" && !plexOAuthToken && !plexOAuthPolling && (
          <Button variant="contained" startIcon={<LoginRoundedIcon />} onClick={() => void handlePlexOAuth()}>
            {t("signInWithPlex")}
          </Button>
        )}
        {step === "plex" && plexOAuthToken && (
          <Button
            variant="contained"
            disabled={adding || !plexServerName || fetchingLibraries}
            startIcon={adding ? <CircularProgress size={14} color="inherit" /> : <VideoLibraryRoundedIcon />}
            onClick={() => void handleAddPlexOAuth()}
          >
            {adding ? t("adding") : t("wizardContinue")}
          </Button>
        )}
        {step === "manual" && detected && (
          <Button
            variant="contained"
            disabled={adding}
            startIcon={adding ? <CircularProgress size={14} color="inherit" /> : <VideoLibraryRoundedIcon />}
            onClick={() => void handleAddManualServer()}
          >
            {adding ? t("adding") : t("wizardContinue")}
          </Button>
        )}
        {step === "done" && completedServer && (
          <Button
            variant="contained"
            startIcon={<CheckCircleRoundedIcon />}
            onClick={handleFinishSetup}
          >
            {t("wizardFinish")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
