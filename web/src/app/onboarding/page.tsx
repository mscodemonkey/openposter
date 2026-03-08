"use client";

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
import {
  clearIssuerSession,
  loadIssuerToken,
  loadIssuerUser,
  saveIssuerSession,
} from "@/lib/issuer_storage";

import { saveCreatorConnection } from "@/lib/storage";

export default function OnboardingPage() {
  // issuer session (load from localStorage once)
  const [token, setToken] = useState<string>(() => loadIssuerToken() || "");
  const [userEmail, setUserEmail] = useState<string>(() => loadIssuerUser()?.email || "");

  const [step, setStep] = useState<"welcome" | "account" | "creator" | "claim" | "public_url" | "done">(() => {
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
  const [displayName, setDisplayName] = useState("Martin");
  const [status, setStatus] = useState<string | null>(null);

  // creator
  const [handle, setHandle] = useState("");
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null);

  // node claim
  const [localUrl, setLocalUrl] = useState("http://localhost:8081");
  const [bootstrapCode, setBootstrapCode] = useState("");
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

  const issuer = useMemo(() => ISSUER_BASE_URL, []);


  async function doLogin() {
    setStatus("Logging in...");
    const res = await issuerLogin({ email, password });
    saveIssuerSession(res.token, res.user);
    setToken(res.token);
    setUserEmail(res.user.email);
    setStatus("Logged in.");
    setStep("creator");
  }

  async function doSignup() {
    setStatus("Creating account...");
    const res = await issuerSignup({ email, password, display_name: displayName });
    saveIssuerSession(res.token, res.user);
    setToken(res.token);
    setUserEmail(res.user.email);
    setStatus("Account created.");
    setStep("creator");
  }

  async function checkHandle() {
    setHandleAvailable(null);
    const ok = await issuerHandleAvailability(handle.trim().toLowerCase());
    setHandleAvailable(ok);
  }

  async function claimCreatorHandle() {
    if (!token) throw new Error("Not logged in");
    setStatus("Claiming handle...");
    await issuerClaimHandle(token, handle.trim().toLowerCase());
    setStatus("Handle claimed.");
    setStep("claim");
  }

  async function claimNodeAdmin() {
    // Step 1: claim an admin session token from the node itself.
    setStatus("Claiming node admin...");
    const base = localUrl.replace(/\/+$/, "");
    const r = await fetch(`${base}/v1/admin/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bootstrap_code: bootstrapCode }),
    });
    if (!r.ok) throw new Error(`node claim failed: ${r.status}`);
    const json = (await r.json()) as { admin: { token: string } };
    setNodeAdminToken(json.admin.token);

    // Persist for upload/library/admin tooling.
    saveCreatorConnection({ nodeUrl: localUrl.replace(/\/+$/, ""), adminToken: json.admin.token });

    // Step 2: register/claim the node in the issuer.
    const out = (await issuerClaimNode(token, { local_url: localUrl, node_admin_token: json.admin.token })) as {
      node: { node_id: string };
    };
    setClaimedNodeId(out.node.node_id);
    setStatus("Node claimed.");
    setStep("public_url");
  }

  async function startUrlClaim() {
    setStatus("Starting URL verification...");
    const info = await issuerStartUrlClaim(token, publicUrl);
    setClaimInfo(info);
    setStatus(info.already_owned ? "Already owned." : "Add the DNS or HTTP proof, then verify.");
  }

  async function verifyUrlClaim() {
    setStatus("Verifying...");
    const res = await issuerVerifyUrlClaim(token, { public_url: publicUrl, method: verifyMethod });
    if (!res.verified) {
      setStatus("Not verified yet. Try again in a minute.");
      return;
    }
    setStatus("Verified.");
  }

  async function attachUrl() {
    setStatus("Attaching URL...");
    await issuerAttachUrl(token, { node_id: claimedNodeId, public_url: publicUrl });
    setStatus("Public URL attached.");
    setStep("done");
  }

  return (
    <div className="op-container op-container--narrow">
      <h1 className="op-title-lg">Onboarding</h1>
      <p className="op-subtle op-mt-6">
        Issuer: <code className="op-code">{issuer}</code>
      </p>

      {status && <div className="op-card op-card--padded op-mt-12">{status}</div>}

      <div className="op-section">
        <div className="op-row op-row--between">
          <div className="op-subtle">Step: {step}</div>
          {token ? (
            <button
              type="button"
              className="op-btn op-btn--sm"
              onClick={() => {
                clearIssuerSession();
                setToken("");
                setUserEmail("");
                setStep("account");
              }}
            >
              Log out
            </button>
          ) : null}
        </div>

        {step === "welcome" && (
          <div className="op-card op-card--padded op-mt-12">
            <h2 className="op-section-title">Welcome to the OpenPoster network!</h2>
            <p className="op-subtle op-mt-6">
              OpenPoster is a community-run poster network where creators can publish artwork from their own nodes, and
              everyone can browse, search, and share — without relying on one central site forever.
            </p>

            <h2 className="op-section-title op-mt-16">Let’s get started</h2>
            <p className="op-subtle op-mt-6">Firstly are you just browsing posters or are you a creator?</p>

            <div className="op-stack op-mt-12">
              <button
                className="op-btn"
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
              </button>

              <button className="op-btn" onClick={() => setStep("account")}>
                I’m a creator
              </button>
            </div>
          </div>
        )}

        {step === "account" && (
          <div className="op-card op-card--padded op-mt-12">
            <h1 className="op-title-lg">Welcome, creator!</h1>
            <h2 className="op-section-title op-mt-10">Let’s get you logged in…</h2>
            <p className="op-subtle op-mt-6">
              Creators are the reason OpenPoster exists. Thanks for being here — your work is what makes libraries feel
              personal.
            </p>

            <h3 className="op-section-title op-mt-16" style={{ fontSize: 16 }}>
              Do you have an OpenPoster account already, or would you like to create one now?
            </h3>

            <div className="op-row op-mt-10">
              <button type="button" className="op-btn" onClick={() => setAccountMode("login")}>
                I’ve got an account, log me in!
              </button>
              <button type="button" className="op-btn" onClick={() => setAccountMode("signup")}>
                I’m new here, sign me up!
              </button>
            </div>

            <div className="op-stack op-mt-12">
              {accountMode === "signup" && (
                <label className="op-label">
                  <div className="op-label-hint">Display name</div>
                  <input className="op-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </label>
              )}

              <label className="op-label">
                <div className="op-label-hint">Email</div>
                <input className="op-input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="op-label">
                <div className="op-label-hint">Password</div>
                <input
                  className="op-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>

              {accountMode === "login" ? (
                <button
                  className="op-btn"
                  onClick={() => void doLogin().catch((e) => setStatus(e?.message || String(e)))}
                >
                  Log me in
                </button>
              ) : (
                <button
                  className="op-btn"
                  onClick={() => void doSignup().catch((e) => setStatus(e?.message || String(e)))}
                >
                  Sign me up
                </button>
              )}
            </div>
          </div>
        )}

        {step === "creator" && (
          <div className="op-card op-card--padded op-mt-12">
            <h2 className="op-section-title">2) Pick your creator handle</h2>
            <p className="op-subtle op-mt-6">
              Handle rules: 3–32 chars, lowercase letters, numbers, underscore.
            </p>
            <div className="op-stack op-mt-12">
              <label className="op-label">
                <div className="op-label-hint">Creator handle</div>
                <input className="op-input" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="e.g. martinjsteven" />
              </label>
              <div className="op-row">
                <button className="op-btn" onClick={() => void checkHandle().catch((e) => setStatus(e?.message || String(e)))}>
                  Check availability
                </button>
                {handleAvailable === true && <span className="op-subtle">Available</span>}
                {handleAvailable === false && <span className="op-subtle">Taken</span>}
              </div>
              <button
                className="op-btn"
                disabled={!handle || handleAvailable === false}
                onClick={() => void claimCreatorHandle().catch((e) => setStatus(e?.message || String(e)))}
              >
                Claim handle
              </button>
            </div>
          </div>
        )}

        {step === "claim" && (
          <div className="op-card op-card--padded op-mt-12">
            <h2 className="op-section-title">3) Claim your node (local URL)</h2>
            <p className="op-subtle op-mt-6">
              This step must be done on the same LAN as your node.
            </p>
            <div className="op-stack op-mt-12">
              <label className="op-label">
                <div className="op-label-hint">Local URL</div>
                <input className="op-input" value={localUrl} onChange={(e) => setLocalUrl(e.target.value)} />
              </label>
              <label className="op-label">
                <div className="op-label-hint">Bootstrap code (from node logs/CLI)</div>
                <input className="op-input" value={bootstrapCode} onChange={(e) => setBootstrapCode(e.target.value)} />
              </label>
              <button className="op-btn" onClick={() => void claimNodeAdmin().catch((e) => setStatus(e?.message || String(e)))}>
                Claim node
              </button>
              {nodeAdminToken ? <div className="op-subtle op-text-sm">Node admin token saved for this session.</div> : null}
              {claimedNodeId ? <div className="op-subtle op-text-sm">Node ID: {claimedNodeId}</div> : null}
            </div>
          </div>
        )}

        {step === "public_url" && (
          <div className="op-card op-card--padded op-mt-12">
            <h2 className="op-section-title">4) Attach your public URL</h2>
            <p className="op-subtle op-mt-6">
              You must verify control of the domain before the issuer will attach it.
            </p>
            <div className="op-stack op-mt-12">
              <label className="op-label">
                <div className="op-label-hint">Public URL</div>
                <input className="op-input" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://posters.example.com" />
              </label>

              <div className="op-row">
                <button className="op-btn" onClick={() => void startUrlClaim().catch((e) => setStatus(e?.message || String(e)))}>
                  Start verification
                </button>
                <select
                  className="op-select"
                  value={verifyMethod}
                  onChange={(e) => {
                    const v = e.target.value;
                    setVerifyMethod(v === "http" ? "http" : "dns");
                  }}
                >
                  <option value="dns">DNS TXT</option>
                  <option value="http">HTTP file</option>
                </select>
                <button className="op-btn" onClick={() => void verifyUrlClaim().catch((e) => setStatus(e?.message || String(e)))}>
                  Verify
                </button>
              </div>

              {claimInfo && !claimInfo.already_owned && (
                <div className="op-card op-card--padded">
                  <div className="op-subtle">DNS TXT</div>
                  <div className="op-text-sm op-mt-6">
                    Name: <code className="op-code">{claimInfo.dns?.name}</code>
                  </div>
                  <div className="op-text-sm op-mt-6">
                    Value: <code className="op-code">{claimInfo.dns?.value}</code>
                  </div>
                  <div className="op-subtle op-mt-12">HTTP file</div>
                  <div className="op-text-sm op-mt-6">
                    URL: <code className="op-code">{claimInfo.http?.url}</code>
                  </div>
                  <div className="op-text-sm op-mt-6">
                    Body: <code className="op-code">{claimInfo.http?.body}</code>
                  </div>
                </div>
              )}

              <button className="op-btn" disabled={!claimedNodeId || !publicUrl} onClick={() => void attachUrl().catch((e) => setStatus(e?.message || String(e)))}>
                Attach public URL to node
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="op-card op-card--padded op-mt-12">
            <h2 className="op-section-title">Done</h2>
            <p className="op-subtle op-mt-6">You’re onboarded. Next: Upload posters.</p>
            <div className="op-row op-mt-12">
              <a className="op-link" href="/upload">
                Go to Upload →
              </a>
              <a className="op-link" href="/settings">
                Settings →
              </a>
            </div>
          </div>
        )}
      </div>

      {token && (
        <p className="op-subtle op-text-sm op-mt-16">
          Logged in as {userEmail}. (Issuer token is stored locally.)
        </p>
      )}
    </div>
  );
}
