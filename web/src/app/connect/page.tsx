"use client";

import { useState } from "react";

import {
  clearCreatorConnection,
  loadCreatorConnection,
  saveCreatorConnection,
} from "@/lib/storage";

export default function ConnectPage() {
  const existing = loadCreatorConnection();

  const [nodeUrl, setNodeUrl] = useState(existing?.nodeUrl || "http://localhost:8081");
  const [adminToken, setAdminToken] = useState(existing?.adminToken || "");
  const [status, setStatus] = useState<string | null>(null);

  async function testConnection() {
    setStatus("Testing...");
    try {
      const base = nodeUrl.replace(/\/+$/, "");
      const r = await fetch(base + "/v1/health");
      if (!r.ok) throw new Error(`Health failed: ${r.status}`);
      setStatus("OK: node reachable");
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  return (
    <div className="op-container op-container--narrow">
      <h1 className="op-title-lg">Connect your node</h1>
      <p className="op-subtle op-mt-6">
        Stores your node URL and admin token in your browser (localStorage) for beta testing.
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
              setStatus("Saved.");
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
              setStatus("Cleared.");
            }}
          >
            Clear
          </button>
        </div>

        {status && (
          <div className="op-card op-card--padded op-mt-6">{status}</div>
        )}

        <p className="op-subtle op-mt-12">
          Next: <a className="op-link" href="/upload">upload a poster</a>
        </p>
      </div>
    </div>
  );
}
