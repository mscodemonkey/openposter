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
    <div className="op-container op-container--narrow">
      <h1 className="op-title-lg">Register your node</h1>
      <p className="op-subtle op-mt-6">
        Registers your connected node with a directory so indexers can discover it.
      </p>

      <div className="op-card op-card--padded op-mt-16">
        Connected node: {nodeUrl ? <code className="op-code">{nodeUrl}</code> : <em>none</em>}
      </div>

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

        {status && (
          <pre className="op-card op-card--padded op-mt-8 op-pre">
            {status}
          </pre>
        )}
      </div>
    </div>
  );
}
