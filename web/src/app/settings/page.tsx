"use client";

import { useMemo, useState } from "react";

import {
  clearCreatorConnection,
  loadCreatorConnection,
  saveCreatorConnection,
} from "@/lib/storage";

export default function SettingsPage() {
  const existing = loadCreatorConnection();

  // Connection
  const [nodeUrl, setNodeUrl] = useState(existing?.nodeUrl || "http://localhost:8081");
  const [adminToken, setAdminToken] = useState(existing?.adminToken || "");
  const [connStatus, setConnStatus] = useState<string | null>(null);

  // Registration
  const [directoryUrl, setDirectoryUrl] = useState<string>("http://localhost:8084");
  const [registerStatus, setRegisterStatus] = useState<string | null>(null);

  const directoryBase = useMemo(() => directoryUrl.replace(/\/+$/, ""), [directoryUrl]);

  async function testConnection() {
    setConnStatus("Testing...");
    try {
      const base = nodeUrl.replace(/\/+$/, "");
      const r = await fetch(base + "/v1/health");
      if (!r.ok) throw new Error(`Health failed: ${r.status}`);
      setConnStatus("OK: node reachable");
    } catch (e: any) {
      setConnStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  async function register() {
    const connected = loadCreatorConnection();
    const connectedNodeUrl = connected?.nodeUrl?.replace(/\/+$/, "") || "";

    if (!connectedNodeUrl) {
      setRegisterStatus("No connected node yet. Add node URL + admin token above, then Save.");
      return;
    }

    setRegisterStatus("Registering...");
    try {
      const r = await fetch(directoryBase + "/v1/nodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: connectedNodeUrl }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) {
        setRegisterStatus(`Failed: ${r.status} ${JSON.stringify(json)}`);
        return;
      }
      setRegisterStatus(`Registered OK: ${JSON.stringify(json)}`);
    } catch (e: any) {
      setRegisterStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  return (
    <div className="op-container op-container--narrow">
      <h1 className="op-title-lg">Settings</h1>

      <section className="op-section">
        <h2 className="op-section-title">Connect your node</h2>
        <p className="op-subtle op-mt-6">
          This is used for uploading/admin actions. Your node URL is stored in{" "}
          <code className="op-code">localStorage</code> and your admin token is stored in{" "}
          <code className="op-code">sessionStorage</code> (token clears when you close the tab/browser).
        </p>

        <div className="op-section op-stack">
          <label className="op-label">
            <div className="op-label-hint">Node URL</div>
            <input
              className="op-input"
              value={nodeUrl}
              onChange={(e) => setNodeUrl(e.target.value)}
              placeholder="https://posters.example.com"
            />
          </label>

          <label className="op-label">
            <div className="op-label-hint">Admin token</div>
            <input
              className="op-input"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              placeholder="OPENPOSTER_ADMIN_TOKEN"
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

      <section className="op-section">
        <h2 className="op-section-title">Register your node</h2>
        <p className="op-subtle op-mt-6">
          Registers your connected node with a directory so indexers can discover it.
        </p>

        <div className="op-section op-stack">
          <label className="op-label">
            <div className="op-label-hint">Directory URL</div>
            <input
              className="op-input"
              value={directoryUrl}
              onChange={(e) => setDirectoryUrl(e.target.value)}
              placeholder="https://openposter.art"
            />
          </label>

          <button className="op-btn" onClick={() => void register()}>
            Register node
          </button>

          {registerStatus && (
            <pre className="op-card op-card--padded op-mt-8 op-pre">{registerStatus}</pre>
          )}
        </div>
      </section>
    </div>
  );
}
