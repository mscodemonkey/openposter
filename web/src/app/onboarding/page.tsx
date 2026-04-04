"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  ISSUER_BASE_URL,
  issuerAttachUrl,
  issuerClaimHandle,
  issuerClaimNode,
  issuerHandleAvailability,
  issuerLogin,
  issuerMe,
  issuerSignup,
  issuerStartUrlClaim,
  issuerVerifyUrlClaim,
} from "@/lib/issuer";
import { clearIssuerSession, loadIssuerToken, loadIssuerUser, saveIssuerSession } from "@/lib/issuer_storage";
import { saveCreatorConnection } from "@/lib/storage";
import { adminCreateTheme } from "@/lib/themes";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

type StepKey = "welcome" | "account" | "creator" | "claim" | "public_url" | "done";

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const issuer = useMemo(() => ISSUER_BASE_URL, []);

  // issuer session — initialise with safe SSR defaults, then hydrate from
  // localStorage in a useEffect to avoid server/client mismatch.
  const [token, setToken] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [step, setStep] = useState<StepKey>("welcome");

  useEffect(() => {
    const t = loadIssuerToken() || "";
    const u = loadIssuerUser();
    if (t) setToken(t);
    if (u?.email) setUserEmail(u.email);
    if (u?.handle) setHandle(u.handle);
    if (t && u) {
      setStep(u.handle ? "claim" : "creator");
      return;
    }
    try {
      if (window.localStorage.getItem("openposter.onboarded.v1") === "browsing") {
        setStep("done");
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // account
  const [accountMode, setAccountMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  // creator
  const [handle, setHandle] = useState("");
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null);

  // node claim
  const [localUrl, setLocalUrl] = useState("http://localhost:8081");
  const [pairCode, setPairCode] = useState("");
  // stored via saveCreatorConnection; we don't currently show it in the UI
  const [nodeAdminToken, setNodeAdminToken] = useState<string>("");
  const [claimedNodeId, setClaimedNodeId] = useState<string>("");

  // public url attach
  const [publicUrl, setPublicUrl] = useState<string>("");
  const [claimInfo, setClaimInfo] = useState<
    | null
    | {
        already_owned?: boolean;
        dns?: { name?: string; value?: string };
        http?: { url?: string; body?: string };
      }
  >(null);
  const [verifyMethod, setVerifyMethod] = useState<"dns" | "http">("dns");

  const steps: Array<{ key: StepKey; label: string }> = [
    { key: "welcome", label: t("stepWelcome") },
    { key: "account", label: t("stepAccount") },
    { key: "creator", label: t("stepCreator") },
    { key: "claim", label: t("stepClaim") },
    { key: "public_url", label: t("stepPublicUrl") },
    { key: "done", label: t("stepDone") },
  ];

  const activeStep = Math.max(
    0,
    steps.findIndex((s) => s.key === step)
  );

  async function doLogin() {
    setStatus(t("loggingIn"));
    const res = await issuerLogin({ email, password });
    saveIssuerSession(res.token, res.user);
    setToken(res.token);
    setUserEmail(res.user.email);
    setStatus(null);
    setStep("creator");
  }

  async function doSignup() {
    setStatus(t("creatingAccount"));
    const res = await issuerSignup({ email, password, display_name: displayName || undefined });
    saveIssuerSession(res.token, res.user);
    setToken(res.token);
    setUserEmail(res.user.email);
    setStatus(null);
    setStep("creator");
  }

  async function checkHandle() {
    setHandleAvailable(null);
    const ok = await issuerHandleAvailability(handle.trim().toLowerCase());
    setHandleAvailable(ok);
  }

  async function claimCreatorHandle() {
    if (!token) throw new Error("Not logged in");
    setStatus(t("savingHandle"));
    await issuerClaimHandle(token, handle.trim().toLowerCase());
    // Re-fetch /v1/me so the handle is included in the stored issuer session
    const updatedUser = await issuerMe(token).catch(() => null);
    if (updatedUser) {
      saveIssuerSession(token, updatedUser);
    }
    setStatus(null);
    setStep("claim");
  }

  async function claimNodeAdmin() {
    setStatus(t("connectingToNode"));
    const base = localUrl.replace(/\/+$/, "");
    const r = await fetch(`${base}/v1/admin/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pair_code: pairCode }),
    });
    if (!r.ok) throw new Error(`node pair failed: ${r.status}`);
    const json = (await r.json()) as { admin: { token: string } };
    setNodeAdminToken(json.admin.token);

    // Persist for upload/library/admin tooling.
    const issuerUser = loadIssuerUser();
    const creatorId = issuerUser?.handle ?? "";
    const nodeUrl = localUrl.replace(/\/+$/, "");
    saveCreatorConnection({ nodeUrl, adminToken: json.admin.token, creatorId });

    // Bootstrap Default theme so the creator has somewhere to assign uploads immediately.
    if (creatorId) {
      await adminCreateTheme(nodeUrl, json.admin.token, creatorId, "Default theme").catch(() => undefined);
    }

    const out = (await issuerClaimNode(token, { local_url: localUrl, node_admin_token: json.admin.token })) as {
      node: { node_id: string };
    };
    setClaimedNodeId(out.node.node_id);
    setStatus(null);
    setStep("public_url");
  }

  async function startUrlClaim() {
    setStatus(t("generatingVerification"));
    const info = (await issuerStartUrlClaim(token, publicUrl)) as {
      already_owned?: boolean;
      challenge?: string;
      dns?: { name?: string; value?: string };
      http?: { url?: string; body?: string };
    };
    setClaimInfo(info);
    // Push the challenge token to the node so it can serve /.well-known/openposter-claim.txt
    if (info.challenge && nodeAdminToken && localUrl) {
      await fetch(`${localUrl.replace(/\/+$/, "")}/v1/admin/claim-token`, {
        method: "PUT",
        headers: { "content-type": "application/json", authorization: `Bearer ${nodeAdminToken}` },
        body: JSON.stringify({ token: info.challenge }),
      }).catch(() => undefined);
    }
    setStatus(null);
  }

  async function verifyUrlClaim() {
    setStatus(t("checkingVerification"));
    const res = (await issuerVerifyUrlClaim(token, { public_url: publicUrl, method: verifyMethod })) as {
      verified?: boolean;
    };
    if (!res.verified) {
      setStatus(t("notVerified"));
      return;
    }
    setStatus(t("verified"));
  }

  async function attachUrl() {
    setStatus(t("savingPublicUrl"));
    await issuerAttachUrl(token, { node_id: claimedNodeId, public_url: publicUrl });
    setStatus(null);
    setStep("done");
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {tc("issuerLabel", { url: issuer })}
          </Typography>
        </Box>

        <Stepper activeStep={activeStep} alternativeLabel>
          {steps.map((s) => (
            <Step key={s.key}>
              <StepLabel>{s.label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {status && <Alert severity={status.toLowerCase().includes("failed") ? "error" : "info"}>{status}</Alert>}

        {token ? (
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                {t("loggedInAs", { email: userEmail })}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  clearIssuerSession();
                  setToken("");
                  setUserEmail("");
                  setStep("account");
                }}
              >
                {t("logOut")}
              </Button>
            </Stack>
          </Paper>
        ) : null}

        {step === "welcome" && (
          <Paper sx={{ p: 3 }}>
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
                <Button onClick={() => setStep("account")}>{t("imACreator")}</Button>
              </Stack>
            </Stack>
          </Paper>
        )}

        {step === "account" && (
          <Paper sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Typography variant="h4" sx={{ fontWeight: 900 }}>
                {t("welcomeCreator")}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {t("letsLogin")}
              </Typography>
              <Typography color="text.secondary">
                {t("creatorsThankYou")}
              </Typography>

              <Typography sx={{ fontWeight: 800, mt: 1 }}>
                {t("haveAccountQuestion")}
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button variant={accountMode === "login" ? "contained" : "outlined"} onClick={() => setAccountMode("login")}>
                  {t("haveAccountLogin")}
                </Button>
                <Button variant={accountMode === "signup" ? "contained" : "outlined"} onClick={() => setAccountMode("signup")}>
                  {t("newSignup")}
                </Button>
              </Stack>

              <Stack spacing={1.5} sx={{ mt: 1 }}>
                {accountMode === "signup" && (
                  <TextField
                    label={t("displayName")}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    helperText={t("displayNameHint")}
                  />
                )}

                <TextField label={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                <TextField
                  label={t("password")}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={accountMode === "signup" ? "new-password" : "current-password"}
                />

                {accountMode === "login" ? (
                  <Button onClick={() => void doLogin().catch((e) => setStatus(e?.message || String(e)))}>{t("logMeIn")}</Button>
                ) : (
                  <Button
                    onClick={() =>
                      void doSignup().catch((e) => {
                        const msg = e?.message || String(e);
                        if (String(msg).toLowerCase().includes("already registered")) {
                          setStatus(t("alreadyRegistered"));
                        } else {
                          setStatus(msg);
                        }
                        setAccountMode("login");
                      })
                    }
                  >
                    {t("signMeUp")}
                  </Button>
                )}
              </Stack>
            </Stack>
          </Paper>
        )}

        {step === "creator" && (
          <Paper sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>
                {t("pickCreatorName")}
              </Typography>
              <Typography color="text.secondary">
                {t("creatorHandleDesc")}
              </Typography>
              <Typography color="text.secondary">{t("creatorHandleRules")}</Typography>

              <TextField
                label={t("creatorHandle")}
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value);
                  setHandleAvailable(null);
                }}
                placeholder="e.g. martinjsteven"
              />

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                <Button variant="outlined" onClick={() => void checkHandle().catch((e) => setStatus(e?.message || String(e)))}>
                  {t("checkName")}
                </Button>
                {handleAvailable === true ? (
                  <Typography color="success.main">{t("nameAvailable")}</Typography>
                ) : handleAvailable === false ? (
                  <Typography color="error.main">{t("nameTaken")}</Typography>
                ) : (
                  <Typography color="text.secondary"> </Typography>
                )}
              </Stack>

              <Button
                disabled={!handle || handleAvailable === false}
                onClick={() => void claimCreatorHandle().catch((e) => setStatus(e?.message || String(e)))}
              >
                {t("lockItIn")}
              </Button>
            </Stack>
          </Paper>
        )}

        {step === "claim" && (
          <Paper sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>
                {t("nextUpNode")}
              </Typography>
              <Typography color="text.secondary">
                {t("sameWifiHint")}
              </Typography>
              <Alert severity="info">
                {t("pairingCodeInfo")}
              </Alert>

              <TextField
                label={t("localUrl")}
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                placeholder="http://192.168.1.10:8080"
              />

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button
                  variant="outlined"
                  onClick={() => {
                    const base = localUrl.replace(/\/+$/, "");
                    window.open(`${base}/admin/pair`, "_blank", "noopener,noreferrer");
                  }}
                >
                  {t("openPairingPage")}
                </Button>
              </Stack>

              <TextField
                label={t("pairingCode")}
                value={pairCode}
                onChange={(e) => setPairCode(e.target.value)}
                placeholder="e.g. 123456"
              />

              <Button onClick={() => void claimNodeAdmin().catch((e) => setStatus(e?.message || String(e)))}>
                {t("connectMyNode")}
              </Button>

              {claimedNodeId ? (
                <Alert severity="success">{t("connectedNodeId", { nodeId: claimedNodeId })}</Alert>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {t("pairingTip")}
                </Typography>
              )}
            </Stack>
          </Paper>
        )}

        {step === "public_url" && (
          <Paper sx={{ p: 3 }}>
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
                  setClaimInfo(null);
                }}
                placeholder="https://posters.example.com"
              />

              <Button variant="outlined" onClick={() => void startUrlClaim().catch((e) => setStatus(e?.message || String(e)))}>
                {t("getVerification")}
              </Button>

              {claimInfo && !claimInfo.already_owned && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={1}>
                    <Typography sx={{ fontWeight: 800 }}>{t("dnsTxtOption")}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t("addTxtRecord")}
                    </Typography>
                    <Typography variant="body2">
                      {t("name", { value: claimInfo.dns?.name ?? "" })}
                    </Typography>
                    <Typography variant="body2">
                      {t("value", { value: claimInfo.dns?.value ?? "" })}
                    </Typography>

                    <Divider sx={{ my: 1 }} />

                    <Typography sx={{ fontWeight: 800 }}>{t("fileOption")}</Typography>
                    <Typography variant="body2">
                      {t("fileUrl", { value: claimInfo.http?.url ?? "" })}
                    </Typography>
                    <Typography variant="body2">
                      {t("fileBody", { value: claimInfo.http?.body ?? "" })}
                    </Typography>
                  </Stack>
                </Paper>
              )}

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                <TextField
                  select
                  label={t("verifyUsing")}
                  value={verifyMethod}
                  onChange={(e) => {
                    const v = e.target.value;
                    setVerifyMethod(v === "http" ? "http" : "dns");
                  }}
                  SelectProps={{ native: true }}
                  sx={{ minWidth: 220 }}
                >
                  <option value="dns">{t("dns")}</option>
                  <option value="http">{t("file")}</option>
                </TextField>
                <Button variant="outlined" onClick={() => void verifyUrlClaim().catch((e) => setStatus(e?.message || String(e)))}>
                  {t("checkNow")}
                </Button>
              </Stack>

              <Button disabled={!claimedNodeId || !publicUrl} onClick={() => void attachUrl().catch((e) => setStatus(e?.message || String(e)))}>
                {t("savePublicUrl")}
              </Button>
            </Stack>
          </Paper>
        )}

        {step === "done" && (
          <Paper sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Typography variant="h4" sx={{ fontWeight: 900 }}>
                {t("allSet")}
              </Typography>
              <Typography color="text.secondary">{t("nextUpload")}</Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button component={Link} href="/upload">
                  {t("goToUpload")}
                </Button>
                <Button component={Link} href="/settings" variant="outlined">
                  {tn("settings")}
                </Button>
              </Stack>
            </Stack>
          </Paper>
        )}

        <Box sx={{ display: "flex", justifyContent: "center", pt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {t("debugStep", { step })}
          </Typography>
        </Box>
      </Stack>
    </Container>
  );
}
