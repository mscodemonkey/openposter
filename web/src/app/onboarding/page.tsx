"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ISSUER_BASE_URL,
  issuerAttachUrl,
  issuerClaimHandle,
  issuerClaimNode,
  issuerHandleAvailability,
  issuerLogin,
  issuerSignup,
  issuerStartUrlClaim,
  issuerVerifyUrlClaim,
} from "@/lib/issuer";
import { clearIssuerSession, loadIssuerToken, loadIssuerUser, saveIssuerSession } from "@/lib/issuer_storage";
import { saveCreatorConnection } from "@/lib/storage";

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
  const issuer = useMemo(() => ISSUER_BASE_URL, []);

  // issuer session (load from localStorage once)
  const [token, setToken] = useState<string>(() => loadIssuerToken() || "");
  const [userEmail, setUserEmail] = useState<string>(() => loadIssuerUser()?.email || "");

  const [step, setStep] = useState<StepKey>(() => {
    if (loadIssuerToken() && loadIssuerUser()) return "creator";
    try {
      const done = window.localStorage.getItem("openposter.onboarded.v1");
      if (done === "browsing") return "done";
    } catch {
      // ignore
    }
    return "welcome";
  });

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
  const [, setNodeAdminToken] = useState<string>("");
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
    { key: "welcome", label: "Welcome" },
    { key: "account", label: "Account" },
    { key: "creator", label: "Creator name" },
    { key: "claim", label: "Connect node" },
    { key: "public_url", label: "Public URL" },
    { key: "done", label: "Done" },
  ];

  const activeStep = Math.max(
    0,
    steps.findIndex((s) => s.key === step)
  );

  async function doLogin() {
    setStatus("Logging in...");
    const res = await issuerLogin({ email, password });
    saveIssuerSession(res.token, res.user);
    setToken(res.token);
    setUserEmail(res.user.email);
    setStatus(null);
    setStep("creator");
  }

  async function doSignup() {
    setStatus("Creating account...");
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
    setStatus("Saving creator handle...");
    await issuerClaimHandle(token, handle.trim().toLowerCase());
    setStatus(null);
    setStep("claim");
  }

  async function claimNodeAdmin() {
    setStatus("Connecting to node...");
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
    saveCreatorConnection({ nodeUrl: localUrl.replace(/\/+$/, ""), adminToken: json.admin.token });

    const out = (await issuerClaimNode(token, { local_url: localUrl, node_admin_token: json.admin.token })) as {
      node: { node_id: string };
    };
    setClaimedNodeId(out.node.node_id);
    setStatus(null);
    setStep("public_url");
  }

  async function startUrlClaim() {
    setStatus("Generating verification instructions...");
    const info = (await issuerStartUrlClaim(token, publicUrl)) as {
      already_owned?: boolean;
      dns?: { name?: string; value?: string };
      http?: { url?: string; body?: string };
    };
    setClaimInfo(info);
    setStatus(null);
  }

  async function verifyUrlClaim() {
    setStatus("Checking verification...");
    const res = (await issuerVerifyUrlClaim(token, { public_url: publicUrl, method: verifyMethod })) as {
      verified?: boolean;
    };
    if (!res.verified) {
      setStatus("Not verified yet. Try again in a minute.");
      return;
    }
    setStatus("Verified!");
  }

  async function attachUrl() {
    setStatus("Saving public URL...");
    await issuerAttachUrl(token, { node_id: claimedNodeId, public_url: publicUrl });
    setStatus(null);
    setStep("done");
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Onboarding
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Issuer: <code>{issuer}</code>
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
                Logged in as <strong>{userEmail}</strong>
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
                Log out
              </Button>
            </Stack>
          </Paper>
        ) : null}

        {step === "welcome" && (
          <Paper sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                Welcome to the OpenPoster network!
              </Typography>
              <Typography color="text.secondary">
                OpenPoster is a community-run poster network where creators can publish artwork from their own nodes, and
                everyone can browse, search, and share — without relying on one central site forever.
              </Typography>

              <Divider />

              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Let’s get started
              </Typography>
              <Typography color="text.secondary">Firstly are you just browsing posters or are you a creator?</Typography>

              <Stack spacing={1.25} sx={{ mt: 1 }}>
                <Button
                  variant="outlined"
                  onClick={() => {
                    try {
                      window.localStorage.setItem("openposter.onboarded.v1", "browsing");
                    } catch {
                      // ignore
                    }
                    window.location.href = "/browse";
                  }}
                >
                  I’m just browsing
                </Button>
                <Button onClick={() => setStep("account")}>I’m a creator</Button>
              </Stack>
            </Stack>
          </Paper>
        )}

        {step === "account" && (
          <Paper sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Typography variant="h4" sx={{ fontWeight: 900 }}>
                Welcome, creator!
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Let’s get you logged in…
              </Typography>
              <Typography color="text.secondary">
                Creators are the reason OpenPoster exists. Thanks for being here — your work is what makes libraries feel
                personal.
              </Typography>

              <Typography sx={{ fontWeight: 800, mt: 1 }}>
                Do you have an OpenPoster account already, or would you like to create one now?
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button variant={accountMode === "login" ? "contained" : "outlined"} onClick={() => setAccountMode("login")}>
                  I’ve got an account, log me in!
                </Button>
                <Button variant={accountMode === "signup" ? "contained" : "outlined"} onClick={() => setAccountMode("signup")}>
                  I’m new here, sign me up!
                </Button>
              </Stack>

              <Stack spacing={1.5} sx={{ mt: 1 }}>
                {accountMode === "signup" && (
                  <TextField
                    label="Display name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    helperText="Doesn’t need to be unique"
                  />
                )}

                <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={accountMode === "signup" ? "new-password" : "current-password"}
                />

                {accountMode === "login" ? (
                  <Button onClick={() => void doLogin().catch((e) => setStatus(e?.message || String(e)))}>Log me in</Button>
                ) : (
                  <Button
                    onClick={() =>
                      void doSignup().catch((e) => {
                        const msg = e?.message || String(e);
                        if (String(msg).toLowerCase().includes("already registered")) {
                          setStatus(
                            "That email is already registered. Click “I’ve got an account, log me in!” and sign in instead."
                          );
                        } else {
                          setStatus(msg);
                        }
                        setAccountMode("login");
                      })
                    }
                  >
                    Sign me up
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
                Let’s pick your creator name
              </Typography>
              <Typography color="text.secondary">
                This is your <strong>unique</strong> creator handle across the network. It’s how people will find your
                artwork.
              </Typography>
              <Typography color="text.secondary">Rules: 3–32 chars. Lowercase letters, numbers, underscores.</Typography>

              <TextField
                label="Creator handle"
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value);
                  setHandleAvailable(null);
                }}
                placeholder="e.g. martinjsteven"
              />

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                <Button variant="outlined" onClick={() => void checkHandle().catch((e) => setStatus(e?.message || String(e)))}>
                  Check name
                </Button>
                {handleAvailable === true ? (
                  <Typography color="success.main">That one’s available</Typography>
                ) : handleAvailable === false ? (
                  <Typography color="error.main">That one’s taken</Typography>
                ) : (
                  <Typography color="text.secondary"> </Typography>
                )}
              </Stack>

              <Button
                disabled={!handle || handleAvailable === false}
                onClick={() => void claimCreatorHandle().catch((e) => setStatus(e?.message || String(e)))}
              >
                Lock it in
              </Button>
            </Stack>
          </Paper>
        )}

        {step === "claim" && (
          <Paper sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>
                Next up: your node
              </Typography>
              <Typography color="text.secondary">
                This step should be done from the same Wi‑Fi/LAN as your server.
              </Typography>
              <Alert severity="info">
                We’ll connect you using a short <strong>pairing code</strong> shown by your node.
              </Alert>

              <TextField
                label="Local URL (your server on the LAN)"
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
                  Open pairing code page
                </Button>
              </Stack>

              <TextField
                label="Pairing code"
                value={pairCode}
                onChange={(e) => setPairCode(e.target.value)}
                placeholder="e.g. 123456"
              />

              <Button onClick={() => void claimNodeAdmin().catch((e) => setStatus(e?.message || String(e)))}>
                Connect my node
              </Button>

              {claimedNodeId ? (
                <Alert severity="success">Connected. Node ID: {claimedNodeId}</Alert>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Tip: if the pairing page doesn’t load, double-check the Local URL and make sure you’re on the same
                  network.
                </Typography>
              )}
            </Stack>
          </Paper>
        )}

        {step === "public_url" && (
          <Paper sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>
                Add your public URL
              </Typography>
              <Typography color="text.secondary">This is the URL other people will use to reach your node.</Typography>
              <Typography color="text.secondary">
                To stop URL hijacking, OpenPoster asks you to prove you control the domain (DNS or a simple text file).
              </Typography>

              <TextField
                label="Public URL"
                value={publicUrl}
                onChange={(e) => {
                  setPublicUrl(e.target.value);
                  setClaimInfo(null);
                }}
                placeholder="https://posters.example.com"
              />

              <Button variant="outlined" onClick={() => void startUrlClaim().catch((e) => setStatus(e?.message || String(e)))}>
                Get verification instructions
              </Button>

              {claimInfo && !claimInfo.already_owned && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={1}>
                    <Typography sx={{ fontWeight: 800 }}>Option 1 (recommended): DNS TXT</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Add a TXT record:
                    </Typography>
                    <Typography variant="body2">
                      Name: <code>{claimInfo.dns?.name}</code>
                    </Typography>
                    <Typography variant="body2">
                      Value: <code>{claimInfo.dns?.value}</code>
                    </Typography>

                    <Divider sx={{ my: 1 }} />

                    <Typography sx={{ fontWeight: 800 }}>Option 2: upload a file</Typography>
                    <Typography variant="body2">
                      URL: <code>{claimInfo.http?.url}</code>
                    </Typography>
                    <Typography variant="body2">
                      Body: <code>{claimInfo.http?.body}</code>
                    </Typography>
                  </Stack>
                </Paper>
              )}

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                <TextField
                  select
                  label="Verify using"
                  value={verifyMethod}
                  onChange={(e) => {
                    const v = e.target.value;
                    setVerifyMethod(v === "http" ? "http" : "dns");
                  }}
                  SelectProps={{ native: true }}
                  sx={{ minWidth: 220 }}
                >
                  <option value="dns">DNS</option>
                  <option value="http">File</option>
                </TextField>
                <Button variant="outlined" onClick={() => void verifyUrlClaim().catch((e) => setStatus(e?.message || String(e)))}>
                  Check now
                </Button>
              </Stack>

              <Button disabled={!claimedNodeId || !publicUrl} onClick={() => void attachUrl().catch((e) => setStatus(e?.message || String(e)))}>
                Save my public URL
              </Button>
            </Stack>
          </Paper>
        )}

        {step === "done" && (
          <Paper sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Typography variant="h4" sx={{ fontWeight: 900 }}>
                You’re all set
              </Typography>
              <Typography color="text.secondary">Next: upload your first poster.</Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button component={Link} href="/upload">
                  Go to Upload
                </Button>
                <Button component={Link} href="/settings" variant="outlined">
                  Settings
                </Button>
              </Stack>
            </Stack>
          </Paper>
        )}

        <Box sx={{ display: "flex", justifyContent: "center", pt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            (Debug) step: <code>{step}</code>
          </Typography>
        </Box>
      </Stack>
    </Container>
  );
}
