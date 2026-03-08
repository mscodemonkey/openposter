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
                <>
                  <button
                    className="op-btn"
                    onClick={() =>
                      void doSignup().catch((e) => {
                        setStatus(e?.message || String(e));
                        // Common case: they accidentally hit signup with an existing email.
                        setAccountMode("login");
                      })
                    }
                  >
                    Sign me up
                  </button>
                  <div className="op-subtle op-text-sm">
                    Already have an account? Click “I’ve got an account, log me in!” above.
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {step === "creator" && (
          <div className="op-card op-card--padded op-mt-12">
            <h1 className="op-title-lg">Nice.</h1>
            <h2 className="op-section-title op-mt-10">Let’s pick your creator name</h2>
            <p className="op-subtle op-mt-6">
              This is your <strong>unique</strong> creator handle across the network. It’s how people will find your
              artwork.
            </p>
            <p className="op-subtle op-mt-6">
              Rules: 3–32 characters. Use lowercase letters, numbers, and underscores.
            </p>

            <div className="op-stack op-mt-12">
              <label className="op-label">
                <div className="op-label-hint">Creator handle</div>
                <input
                  className="op-input"
                  value={handle}
                  onChange={(e) => {
                    setHandle(e.target.value);
                    setHandleAvailable(null);
                  }}
                  placeholder="e.g. martinjsteven"
                />
              </label>

              <div className="op-row">
                <button
                  className="op-btn"
                  onClick={() => void checkHandle().catch((e) => setStatus(e?.message || String(e)))}
                >
                  Check name
                </button>
                {handleAvailable === true && <span className="op-subtle">That one’s available</span>}
                {handleAvailable === false && <span className="op-subtle">That one’s taken</span>}
              </div>

              <button
                className="op-btn"
                disabled={!handle || handleAvailable === false}
                onClick={() => void claimCreatorHandle().catch((e) => setStatus(e?.message || String(e)))}
              >
                Lock it in
              </button>
            </div>
          </div>
        )}

        {step === "claim" && (
          <div className="op-card op-card--padded op-mt-12">
            <h1 className="op-title-lg">Next up: your node</h1>
            <h2 className="op-section-title op-mt-10">Connect to your node (on your local network)</h2>
            <p className="op-subtle op-mt-6">
              This step should be done from the same Wi‑Fi/LAN as your server.
            </p>
            <p className="op-subtle op-mt-6">
              You’ll paste a one-time <strong>bootstrap code</strong> from your node. This is how OpenPoster knows you
              really have admin access to that machine.
            </p>

            <div className="op-card op-card--padded op-mt-12">
              <div className="op-subtle"><strong>Where do I find the bootstrap code?</strong></div>
              <div className="op-text-sm op-mt-8">
                Your node writes it to a file on disk:
                {" "}
                <code className="op-code">/data/bootstrap_code.txt</code>
              </div>
              <div className="op-text-sm op-mt-8">
                If you’re running the local dev stack (docker compose), run one of these from the repo root:
              </div>
              <pre className="op-pre op-mt-8">docker compose -f reference-node/compose.multi.yml exec node_a cat /data/bootstrap_code.txt
# (or node_b)
docker compose -f reference-node/compose.multi.yml exec node_b cat /data/bootstrap_code.txt</pre>
              <div className="op-text-sm op-mt-8">
                If you’re running without Docker, look in your node’s data directory for
                {" "}
                <code className="op-code">bootstrap_code.txt</code>.
              </div>
            </div>

            <div className="op-stack op-mt-12">
              <label className="op-label">
                <div className="op-label-hint">Local URL (your server on the LAN)</div>
                <input
                  className="op-input"
                  value={localUrl}
                  onChange={(e) => setLocalUrl(e.target.value)}
                  placeholder="http://192.168.1.10:8080"
                />
              </label>
              <label className="op-label">
                <div className="op-label-hint">Bootstrap code</div>
                <input
                  className="op-input"
                  value={bootstrapCode}
                  onChange={(e) => setBootstrapCode(e.target.value)}
                  placeholder="(from your node logs)"
                />
              </label>
              <button
                className="op-btn"
                onClick={() => void claimNodeAdmin().catch((e) => setStatus(e?.message || String(e)))}
              >
                Connect my node
              </button>
              {claimedNodeId ? <div className="op-subtle op-text-sm">Connected. Node ID: {claimedNodeId}</div> : null}
            </div>
          </div>
        )}

        {step === "public_url" && (
          <div className="op-card op-card--padded op-mt-12">
            <h1 className="op-title-lg">Almost there</h1>
            <h2 className="op-section-title op-mt-10">Add your public URL</h2>
            <p className="op-subtle op-mt-6">
              This is the URL other people will use to reach your node.
            </p>
            <p className="op-subtle op-mt-6">
              To stop URL hijacking, OpenPoster asks you to prove you control the domain (DNS or a simple text file).
            </p>

            <div className="op-stack op-mt-12">
              <label className="op-label">
                <div className="op-label-hint">Public URL</div>
                <input
                  className="op-input"
                  value={publicUrl}
                  onChange={(e) => {
                    setPublicUrl(e.target.value);
                    setClaimInfo(null);
                  }}
                  placeholder="https://posters.example.com"
                />
              </label>

              <div className="op-row">
                <button
                  className="op-btn"
                  onClick={() => void startUrlClaim().catch((e) => setStatus(e?.message || String(e)))}
                >
                  Get verification instructions
                </button>
              </div>

              {claimInfo && !claimInfo.already_owned && (
                <div className="op-card op-card--padded">
                  <div className="op-subtle">Option 1 (recommended): DNS TXT</div>
                  <div className="op-text-sm op-mt-6">
                    Add a TXT record:
                  </div>
                  <div className="op-text-sm op-mt-6">
                    Name: <code className="op-code">{claimInfo.dns?.name}</code>
                  </div>
                  <div className="op-text-sm op-mt-6">
                    Value: <code className="op-code">{claimInfo.dns?.value}</code>
                  </div>

                  <div className="op-subtle op-mt-16">Option 2: upload a file</div>
                  <div className="op-text-sm op-mt-6">
                    Create a text file at:
                  </div>
                  <div className="op-text-sm op-mt-6">
                    <code className="op-code">{claimInfo.http?.url}</code>
                  </div>
                  <div className="op-text-sm op-mt-6">
                    with this exact content:
                    {" "}
                    <code className="op-code">{claimInfo.http?.body}</code>
                  </div>
                </div>
              )}

              <div className="op-row">
                <select
                  className="op-select"
                  value={verifyMethod}
                  onChange={(e) => {
                    const v = e.target.value;
                    setVerifyMethod(v === "http" ? "http" : "dns");
                  }}
                >
                  <option value="dns">Verify using DNS</option>
                  <option value="http">Verify using file</option>
                </select>

                <button
                  className="op-btn"
                  onClick={() => void verifyUrlClaim().catch((e) => setStatus(e?.message || String(e)))}
                >
                  Check now
                </button>
              </div>

              <button
                className="op-btn"
                disabled={!claimedNodeId || !publicUrl}
                onClick={() => void attachUrl().catch((e) => setStatus(e?.message || String(e)))}
              >
                Save my public URL
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="op-card op-card--padded op-mt-12">
            <h1 className="op-title-lg">You’re all set</h1>
            <p className="op-subtle op-mt-6">Next: upload your first poster.</p>
            <div className="op-row op-mt-12">
              <Link className="op-link" href="/upload">
                Go to Upload →
              </Link>
              <Link className="op-link" href="/settings">
                Settings →
              </Link>
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
