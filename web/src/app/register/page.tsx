"use client";

import { useMemo, useState } from "react";

import { loadCreatorConnection } from "@/lib/storage";

export default function RegisterPage() {
  const conn = loadCreatorConnection();
  const nodeUrl = conn?.nodeUrl?.replace(/\/+$/, "") || "";

  const [directoryUrl, setDirectoryUrl] = useState<string>(
    "http://localhost:8084"
  );
  const [status, setStatus] = useState<string | null>(null);

  const directoryBase = useMemo(
    () => directoryUrl.replace(/\/+$/, ""),
    [directoryUrl]
  );

  async function register() {
    if (!nodeUrl) {
      setStatus("No connected node. Go to /connect first.");
      return;
    }

    setStatus("Registering...");
    try {
      const r = await fetch(directoryBase + "/v1/nodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: nodeUrl }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) {
        setStatus(`Failed: ${r.status} ${JSON.stringify(json)}`);
        return;
      }
      setStatus(`Registered OK: ${JSON.stringify(json)}`);
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Register your node</h1>
      <p style={{ opacity: 0.8 }}>
        This registers your connected node with a directory so indexers can discover it.
      </p>

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #333", borderRadius: 10 }}>
        Connected node: {nodeUrl ? <code>{nodeUrl}</code> : <em>none</em>}
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Directory URL</div>
          <input
            value={directoryUrl}
            onChange={(e) => setDirectoryUrl(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #333" }}
            placeholder="https://openposter.art"
          />
        </label>

        <button
          onClick={() => void register()}
          style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #333", width: 200 }}
        >
          Register node
        </button>

        {status && (
          <pre style={{ marginTop: 8, padding: 12, border: "1px solid #333", borderRadius: 10, whiteSpace: "pre-wrap" }}>
            {status}
          </pre>
        )}
      </div>
    </div>
  );
}
