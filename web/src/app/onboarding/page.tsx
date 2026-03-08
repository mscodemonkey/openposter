"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ISSUER_BASE_URL,
  issuerAttachUrl,
  issuerClaimHandle,
  issuerClaimNode,
  issuerHandleAvailability,
  issuerLogin,
  issuerMe,
  issuerStartUrlClaim,
  issuerVerifyUrlClaim,
} from "@/lib/issuer";
import {
  clearIssuerSession,
  loadIssuerToken,
  loadIssuerUser,
  saveIssuerSession,
} from "@/lib/issuer_storage";

export default function OnboardingPage() {
  const [step, setStep] = useState<"account" | "creator" | "claim" | "public_url" | "done">("account");

  // issuer session
  const [token, setToken] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");

  // account
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
  const [claimInfo, setClaimInfo] = useState<any>(null);
  const [verifyMethod, setVerifyMethod] = useState<"dns" | "http">("dns");

  const issuer = useMemo(() => ISSUER_BASE_URL, []);

  useEffect(() => {
    const t = loadIssuerToken();
    const u = loadIssuerUser();
    if (t && u) {
      setToken(t);
      setUserEmail(u.email);
      // best-effort; if token is stale user will fail later.
    }
  }, []);

  async function doLogin() {
    setStatus("Logging in...");
    const res = await issuerLogin({ email, password });
    saveIssuerSession(res.token, res.user);
    setToken(res.token);
    setUserEmail(res.user.email);
    setStatus("Logged in.");
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
    const json = (await r.json()) as any;
    setNodeAdminToken(json.admin.token);

    // Step 2: register/claim the node in the issuer.
    const out = await issuerClaimNode(token, { local_url: localUrl, node_admin_token: json.admin.token });
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

        {step === "account" && (
          <div className="op-card op-card--padded op-mt-12">
            <h2 className="op-section-title">1) Log in</h2>
            <p className="op-subtle op-mt-6">Create account will be added next. For now: log in.</p>
            <div className="op-stack op-mt-12">
              <label className="op-label">
                <div className="op-label-hint">Email</div>
                <input className="op-input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="op-label">
                <div className="op-label-hint">Password</div>
                <input className="op-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <button className="op-btn" onClick={() => void doLogin().catch((e) => setStatus(e?.message || String(e)))}>
                Log in
              </button>
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
                <select className="op-select" value={verifyMethod} onChange={(e) => setVerifyMethod(e.target.value as any)}>
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
