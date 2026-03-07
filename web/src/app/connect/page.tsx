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
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Connect your node</h1>
      <p style={{ opacity: 0.8 }}>
        This stores your node URL and admin token in your browser (localStorage) for beta testing.
      </p>

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Node URL</div>
          <input
            value={nodeUrl}
            onChange={(e) => setNodeUrl(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #333" }}
            placeholder="https://posters.example.com"
          />
        </label>

        <label>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Admin token</div>
          <input
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #333" }}
            placeholder="OPENPOSTER_ADMIN_TOKEN"
            type="password"
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => {
              saveCreatorConnection({
                nodeUrl: nodeUrl.replace(/\/+$/, ""),
                adminToken,
              });
              setStatus("Saved.");
            }}
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #333" }}
          >
            Save
          </button>

          <button
            onClick={() => void testConnection()}
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #333" }}
          >
            Test
          </button>

          <button
            onClick={() => {
              clearCreatorConnection();
              setStatus("Cleared.");
            }}
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #333" }}
          >
            Clear
          </button>
        </div>

        {status && (
          <div style={{ marginTop: 6, padding: 10, borderRadius: 8, border: "1px solid #333" }}>
            {status}
          </div>
        )}

        <p style={{ marginTop: 12, opacity: 0.8 }}>
          Next: <a href="/upload">upload a poster</a>
        </p>
      </div>
    </div>
  );
}
