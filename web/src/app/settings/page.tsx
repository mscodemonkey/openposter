"use client";

import { useState } from "react";

import { clearCreatorConnection, loadCreatorConnection, saveCreatorConnection } from "@/lib/storage";
import { ISSUER_BASE_URL } from "@/lib/issuer";
import { clearIssuerSession, loadIssuerUser } from "@/lib/issuer_storage";

export default function SettingsPage() {
  const existing = loadCreatorConnection();
  const issuerUser = loadIssuerUser();

  // Node admin session (local URL + admin session token)
  const [nodeUrl, setNodeUrl] = useState(existing?.nodeUrl || "http://localhost:8081");
  const [adminToken, setAdminToken] = useState(existing?.adminToken || "");
  const [connStatus, setConnStatus] = useState<string | null>(null);

  async function testConnection() {
    setConnStatus("Testing...");
    try {
      const base = nodeUrl.replace(/\/+$/, "");
      const r = await fetch(base + "/v1/health");
      if (!r.ok) throw new Error(`Health failed: ${r.status}`);
      setConnStatus("OK: node reachable");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setConnStatus(`Error: ${msg}`);
    }
  }


  return (
    <div className="op-container op-container--narrow">
      <h1 className="op-title-lg">Settings</h1>

      <section className="op-section">
        <h2 className="op-section-title">Account</h2>
        <div className="op-card op-card--padded op-mt-12">
          <div className="op-subtle">
            Issuer: <code className="op-code">{ISSUER_BASE_URL}</code>
          </div>
          <div className="op-mt-10">
            {issuerUser ? (
              <>
                <div className="op-subtle">
                  Logged in as <code className="op-code">{issuerUser.email}</code>
                </div>
                <div className="op-mt-12">
                  <button
                    className="op-btn"
                    onClick={() => {
                      clearIssuerSession();
                      window.location.href = "/onboarding";
                    }}
                  >
                    Log out
                  </button>
                </div>
              </>
            ) : (
              <div className="op-subtle">
                Not logged in. Go to <a className="op-link" href="/onboarding">Onboarding</a>.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="op-section">
        <h2 className="op-section-title">Node admin session</h2>
        <p className="op-subtle op-mt-6">
          Used for uploading and managing posters on your node. The recommended way to set this up is via{" "}
          <a className="op-link" href="/onboarding">Onboarding</a>.
        </p>

        <div className="op-section op-stack">
          <label className="op-label">
            <div className="op-label-hint">Local URL</div>
            <input
              className="op-input"
              value={nodeUrl}
              onChange={(e) => setNodeUrl(e.target.value)}
              placeholder="http://192.168.1.10:8080"
            />
          </label>

          <label className="op-label">
            <div className="op-label-hint">Node admin token</div>
            <input
              className="op-input"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              placeholder="(created by onboarding / bootstrap claim)"
              type="password"
            />
          </label>

          <div className="op-row">
            <button
              className="op-btn"
              onClick={() => {
                saveCreatorConnection({
                  nodeUrl: nodeUrl.replace(/\/+$/, ""),
                  adminToken,
                });
                setConnStatus("Saved.");
              }}
            >
              Save
            </button>

            <button className="op-btn" onClick={() => void testConnection()}>
              Test
            </button>

            <button
              className="op-btn"
              onClick={() => {
                clearCreatorConnection();
                setAdminToken("");
                setConnStatus("Cleared.");
              }}
            >
              Disconnect
            </button>
          </div>

          {connStatus && <div className="op-card op-card--padded op-mt-6">{connStatus}</div>}
        </div>
      </section>

    </div>
  );
}
