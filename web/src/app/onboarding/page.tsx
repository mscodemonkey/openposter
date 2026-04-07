"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  ISSUER_BASE_URL,
  issuerAttachUrl,
  issuerCheckPublicUrl,
  issuerInspectNode,
  issuerClaimNode,
  type CheckPublicUrlResponse,
  type LoginResponse,
  type InspectNodeResponse,
  type SignupResponse,
} from "@/lib/issuer";
import { clearIssuerSession, loadIssuerToken, loadIssuerUser, saveIssuerSession } from "@/lib/issuer_storage";
import { loadCreatorConnection, saveCreatorConnection } from "@/lib/storage";
import { adminCreateTheme } from "@/lib/themes";
import IssuerAuthCard from "@/components/IssuerAuthCard";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import LinkIcon from "@mui/icons-material/Link";
import RefreshIcon from "@mui/icons-material/Refresh";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";

type StepKey = "welcome" | "account" | "claim" | "public_url" | "done";

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const theme = useTheme();
  const issuer = useMemo(() => ISSUER_BASE_URL, []);
  const initialUser = typeof window === "undefined" ? null : loadIssuerUser();
  const initialToken = typeof window === "undefined" ? "" : (loadIssuerToken() || "");
  const initialConn = typeof window === "undefined" ? null : loadCreatorConnection();
  const initialStep: StepKey = initialToken && initialUser
    ? "claim"
    : initialConn
      ? "account"
      : (() => {
        try {
          return typeof window !== "undefined" && window.localStorage.getItem("openposter.onboarded.v1") === "browsing"
            ? "done"
            : "welcome";
        } catch {
          return "welcome";
        }
      })();

  // issuer session — initialise with safe SSR defaults, then hydrate from
  // localStorage in a useEffect to avoid server/client mismatch.
  const [token, setToken] = useState<string>(initialToken);
  const [userEmail, setUserEmail] = useState<string>(initialUser?.email ?? "");
  const [userDisplayName, setUserDisplayName] = useState<string>(initialUser?.display_name ?? "");
  const [step, setStep] = useState<StepKey>(initialStep);

  const [status, setStatus] = useState<string | null>(null);

  // node claim
  const [localUrl] = useState(initialConn?.nodeUrl ?? "http://localhost:8081");
  const [nodeAdminToken] = useState<string>(initialConn?.adminToken ?? "");
  const [claimedNodeId, setClaimedNodeId] = useState<string>("");
  const [ownerName, setOwnerName] = useState(initialUser?.display_name ?? "");
  const [nodeInspection, setNodeInspection] = useState<InspectNodeResponse | null>(null);

  // public url attach
  const [publicUrl, setPublicUrl] = useState<string>("");
  const [publicUrlCheck, setPublicUrlCheck] = useState<CheckPublicUrlResponse | null>(null);

  const steps: Array<{ key: StepKey; label: string }> = [
    { key: "welcome", label: t("stepWelcome") },
    { key: "account", label: t("stepAccount") },
    { key: "claim", label: t("stepClaim") },
    { key: "public_url", label: t("stepPublicUrl") },
    { key: "done", label: t("stepDone") },
  ];

  const activeStep = Math.max(
    0,
    steps.findIndex((s) => s.key === step)
  );
  const currentStep = steps[activeStep] ?? steps[0];
  const publicTargetHint = useMemo(() => {
    try {
      const parsed = new URL(localUrl);
      const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
      const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
      if (isLoopback) {
        return t("publicUrlConnectionHintGeneric", { port });
      }
      return t("publicUrlConnectionHintSpecific", { target: localUrl });
    } catch {
      return t("publicUrlConnectionHintGeneric", { port: "8081" });
    }
  }, [localUrl, t]);
  const logoCardBg = alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.72 : 0.68);
  const shellBg = theme.palette.mode === "dark"
    ? `linear-gradient(180deg, ${theme.palette.grey[900]} 0%, ${theme.palette.background.default} 38%, ${alpha(theme.palette.common.black, 0.92)} 100%)`
    : `linear-gradient(180deg, ${theme.palette.grey[100]} 0%, #f8f5ee 30%, ${theme.palette.background.default} 100%)`;
  const shellGlow = theme.palette.mode === "dark"
    ? `radial-gradient(circle at top left, ${alpha(theme.palette.error.main, 0.22)}, transparent 30%), radial-gradient(circle at bottom right, ${alpha(theme.palette.success.main, 0.18)}, transparent 28%)`
    : "radial-gradient(circle at top left, rgba(255,26,26,0.16), transparent 30%), radial-gradient(circle at bottom right, rgba(11,83,69,0.16), transparent 28%)";
  const panelBg = alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.8 : 0.82);
  const panelBorder = alpha(theme.palette.divider, theme.palette.mode === "dark" ? 0.4 : 0.8);
  const panelShadow = theme.palette.mode === "dark"
    ? "0 24px 80px rgba(0,0,0,0.38)"
    : "0 24px 80px rgba(42,31,18,0.10)";
  const infoCardBg = alpha(theme.palette.background.default, theme.palette.mode === "dark" ? 0.9 : 0.68);

  async function handleAuthSuccess(res: LoginResponse | SignupResponse) {
    saveIssuerSession(res.token, res.user);
    setToken(res.token);
    setUserEmail(res.user.email);
    setUserDisplayName(res.user.display_name ?? "");
    setOwnerName((current) => current || res.user.display_name || "");
    setStatus(null);
    setStep("claim");
  }

  const inspectNodeClaim = useCallback(async () => {
    if (!token) throw new Error("Not logged in");
    if (!nodeAdminToken || !localUrl) throw new Error(t("connectNodeFirst"));
    setStatus(t("checkingNodeOwnership"));
    const out = await issuerInspectNode(token, {
      local_url: localUrl,
      node_admin_token: nodeAdminToken,
    });
    setNodeInspection(out);
    setClaimedNodeId(out.node.node_id);
    if (out.node.owner_name) {
      setOwnerName(out.node.owner_name);
    } else if (out.node.status === "unclaimed") {
      setOwnerName((current) => current || userDisplayName || "");
    }
    setStatus(null);
  }, [token, nodeAdminToken, localUrl, t, userDisplayName]);

  async function claimNodeOwnership() {
    if (!token) throw new Error("Not logged in");
    if (!nodeAdminToken || !localUrl) throw new Error(t("connectNodeFirst"));
    if (nodeInspection?.node.status === "unclaimed" && !ownerName.trim()) {
      throw new Error(t("ownerNameRequired"));
    }

    setStatus(t("claimingNode"));
    const out = await issuerClaimNode(token, {
      local_url: localUrl,
      node_admin_token: nodeAdminToken,
      owner_name: nodeInspection?.node.status === "unclaimed" ? ownerName.trim() : undefined,
    });

    const creatorId = loadIssuerUser()?.handle ?? "";
    const nodeUrl = localUrl.replace(/\/+$/, "");
    saveCreatorConnection({ nodeUrl, adminToken: nodeAdminToken, creatorId });
    if (creatorId) {
      await adminCreateTheme(nodeUrl, nodeAdminToken, creatorId, "Default theme").catch(() => undefined);
    }

    setClaimedNodeId(out.node.node_id);
    setStatus(null);
    setStep("public_url");
  }

  async function checkPublicUrl() {
    setStatus(t("checkingConnectivity"));
    const res = await issuerCheckPublicUrl(token, { node_id: claimedNodeId, public_url: publicUrl });
    setPublicUrlCheck(res);
    if (!res.reachable) {
      setStatus(t("publicUrlNotReachable"));
      return;
    }
    if (!res.matches_node) {
      setStatus(t("publicUrlWrongNode"));
      return;
    }
    setStatus(t("publicUrlReachable"));
  }

  async function attachUrl() {
    setStatus(t("savingPublicUrl"));
    await issuerAttachUrl(token, { node_id: claimedNodeId, public_url: publicUrl });
    setStatus(null);
    setStep("done");
  }

  useEffect(() => {
    if (step !== "claim" || !token || !nodeAdminToken) return;
    void (async () => {
      try {
        await inspectNodeClaim();
      } catch (e: unknown) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [step, token, nodeAdminToken, inspectNodeClaim]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: shellBg,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: shellGlow,
          pointerEvents: "none",
        }}
      />
      <Container maxWidth="md" sx={{ position: "relative", py: { xs: 5, md: 8 } }}>
        <Stack spacing={3.5} alignItems="center">
          <Stack spacing={1.5} alignItems="center" textAlign="center" sx={{ maxWidth: 720 }}>
            <Box
              sx={{
                width: 88,
                height: 88,
                borderRadius: "28px",
                background: logoCardBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: panelShadow,
                backdropFilter: "blur(10px)",
                border: `1px solid ${panelBorder}`,
              }}
            >
              <Box
                component="img"
                src="/op-logo-small.svg"
                alt="OpenPoster"
                sx={{ width: 50, height: 50, display: "block" }}
              />
            </Box>
            <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: -1.2 }}>
              {t("title")}
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 500 }}>
              {currentStep.label}
            </Typography>
          </Stack>

          <Paper
            elevation={0}
            sx={{
              width: "100%",
              maxWidth: 920,
              p: { xs: 2.5, md: 4 },
              borderRadius: 6,
              border: `1px solid ${panelBorder}`,
              background: panelBg,
              backdropFilter: "blur(14px)",
              boxShadow: panelShadow,
            }}
          >
            <Stack spacing={3}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1.5}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
              >
                <Box>
                  <Typography variant="overline" sx={{ letterSpacing: "0.18em", color: "text.secondary" }}>
                    {`${activeStep + 1} / ${steps.length}`}
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 850 }}>
                    {currentStep.label}
                  </Typography>
                  <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                    {tc("issuerLabel", { url: issuer })}
                  </Typography>
                </Box>

                {token ? (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 4,
                      backgroundColor: infoCardBg,
                      minWidth: { md: 280 },
                    }}
                  >
                    <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        {t("loggedInAs", { email: userEmail })}
                      </Typography>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => {
                          clearIssuerSession();
                          setToken("");
                          setUserEmail("");
                          setUserDisplayName("");
                          setOwnerName("");
                          setStep("account");
                        }}
                      >
                        {t("logOut")}
                      </Button>
                    </Stack>
                  </Paper>
                ) : null}
              </Stack>

              {status && <Alert severity={status.toLowerCase().includes("failed") ? "error" : "info"} sx={{ borderRadius: 3 }}>{status}</Alert>}

        {step === "welcome" && (
          <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 4, backgroundColor: infoCardBg }}>
            <Stack spacing={2}>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                {t("welcomeTitle")}
              </Typography>
              <Typography color="text.secondary">
                {t("welcomeDescription")}
              </Typography>

              <Divider />

              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {t("letsGetStarted")}
              </Typography>
              <Typography color="text.secondary">{t("browsingOrCreator")}</Typography>

              <Stack spacing={1.25} sx={{ mt: 1 }}>
                <Button
                  variant="outlined"
                  onClick={() => {
                    try {
                      window.localStorage.setItem("openposter.onboarded.v1", "browsing");
                    } catch {
                      // ignore
                    }
                    window.location.href = "/";
                  }}
                >
                  {t("justBrowsing")}
                </Button>
                <Button variant="contained" onClick={() => setStep("account")}>{t("imACreator")}</Button>
              </Stack>
            </Stack>
          </Paper>
        )}

        {step === "account" && (
          <Box sx={{ maxWidth: 720 }}>
            <IssuerAuthCard
              title={t("accountTitle")}
              subtitle={t("accountSubtitle")}
              body={nodeAdminToken ? t("authAfterPairing") : t("creatorsThankYou")}
              onSuccess={(res) => void handleAuthSuccess(res)}
              onError={(message) => setStatus(message)}
            />
          </Box>
        )}

        {step === "claim" && (
          <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 4, backgroundColor: infoCardBg }}>
            <Stack spacing={2}>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>
                {t("nextUpNode")}
              </Typography>
              <Typography color="text.secondary">
                {t("ownershipStepBody")}
              </Typography>

              {nodeAdminToken ? (
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 4 }}>
                  <Stack spacing={1}>
                    <Typography sx={{ fontWeight: 800 }}>{t("pairedNode")}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t("pairedNodeUrl", { url: localUrl })}
                    </Typography>
                    {claimedNodeId && (
                      <Typography variant="body2" color="text.secondary">
                        {t("connectedNodeId", { nodeId: claimedNodeId })}
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              ) : (
                <Alert severity="warning">
                  {t("connectNodeFirst")} <Link href="/">{t("goBackToConnect")}</Link>
                </Alert>
              )}

              {nodeInspection?.node.status === "unclaimed" && (
                <>
                  <Alert severity="success">{t("nodeUnclaimed")}</Alert>
                  <TextField
                    label={t("ownerName")}
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder={t("ownerNamePlaceholder")}
                    helperText={t("ownerNameHint")}
                  />
                </>
              )}

              {nodeInspection?.node.status === "owned_by_you" && (
                <Alert severity="info">
                  {t("nodeOwnedByYou", { ownerName: nodeInspection.node.owner_name || userEmail })}
                </Alert>
              )}

              {nodeInspection?.node.status === "owned_by_other" && (
                <Alert severity="warning">
                  {t("nodeOwnedByOther", { ownerName: nodeInspection.node.owner_name || t("anotherOwner") })}
                </Alert>
              )}

              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                justifyContent="space-between"
                alignItems={{ sm: "center" }}
              >
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={() => void inspectNodeClaim().catch((e) => setStatus(e?.message || String(e)))}
                  disabled={!nodeAdminToken}
                >
                  {t("refreshOwnership")}
                </Button>
                <Button
                  variant="contained"
                  disabled={!nodeAdminToken || !nodeInspection || nodeInspection.node.status === "owned_by_other"}
                  onClick={() => void claimNodeOwnership().catch((e) => setStatus(e?.message || String(e)))}
                >
                  {nodeInspection?.node.status === "owned_by_you" ? t("continueAsOwner") : t("claimThisNode")}
                </Button>
              </Stack>
            </Stack>
          </Paper>
        )}

        {step === "public_url" && (
          <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 4, backgroundColor: infoCardBg }}>
            <Stack spacing={2}>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>
                {t("addPublicUrl")}
              </Typography>
              <Typography color="text.secondary">{t("publicUrlDesc")}</Typography>
              <Typography color="text.secondary">
                {t("publicUrlVerifyDesc")}
              </Typography>

              <TextField
                label={t("publicUrl")}
                value={publicUrl}
                onChange={(e) => {
                  setPublicUrl(e.target.value);
                  setPublicUrlCheck(null);
                }}
                placeholder="https://posters.example.com"
              />

              <Alert severity="info" icon={<LinkIcon />}>
                {publicTargetHint}
              </Alert>

              {publicUrlCheck && (
                publicUrlCheck.reachable && publicUrlCheck.matches_node ? (
                  <Alert severity="success">
                    {t("publicUrlCheckSuccess")}
                  </Alert>
                ) : publicUrlCheck.reachable ? (
                  <Alert severity="warning">
                    {t("publicUrlCheckWrongNode", { nodeId: publicUrlCheck.details?.fetched_node_id || t("unknownNodeId") })}
                  </Alert>
                ) : (
                  <Alert severity="warning">
                    {t("publicUrlCheckFailed")}
                  </Alert>
                )
              )}

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between" alignItems={{ sm: "center" }}>
                <Button variant="outlined" onClick={() => void checkPublicUrl().catch((e) => setStatus(e?.message || String(e)))}>
                  {t("checkConnectivity")}
                </Button>
                <Button
                  variant="contained"
                  disabled={!claimedNodeId || !publicUrl || !publicUrlCheck?.reachable || !publicUrlCheck?.matches_node}
                  onClick={() => void attachUrl().catch((e) => setStatus(e?.message || String(e)))}
                >
                  {t("savePublicUrl")}
                </Button>
              </Stack>
              <Button variant="text" onClick={() => setStep("done")}>
                {t("skipForNow")}
              </Button>
            </Stack>
          </Paper>
        )}

        {step === "done" && (
          <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 4, backgroundColor: infoCardBg }}>
            <Stack spacing={2}>
              <Typography variant="h4" sx={{ fontWeight: 900 }}>
                {t("allSet")}
              </Typography>
              <Typography color="text.secondary">{t("nextBrowse")}</Typography>
              <Typography color="text.secondary">{t("creatorOptional")}</Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button component={Link} href="/">
                  {t("goToLibrary")}
                </Button>
                <Button component={Link} href="/settings" variant="outlined">
                  {tn("settings")}
                </Button>
                <Button component={Link} href="/studio" variant="outlined">
                  {t("setupCreatorLater")}
                </Button>
              </Stack>
            </Stack>
          </Paper>
        )}

            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}
