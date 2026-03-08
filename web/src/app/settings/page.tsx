"use client";

import { useEffect, useState } from "react";

import {
  clearCreatorConnection,
  loadCreatorConnection,
} from "@/lib/storage";

export default function SettingsPage() {
  const [connected, setConnected] = useState(false);
  const [nodeUrl, setNodeUrl] = useState<string | null>(null);

  function refresh() {
    const conn = loadCreatorConnection();
    setConnected(Boolean(conn));
    setNodeUrl(conn?.nodeUrl || null);
  }

  useEffect(() => {
    refresh();
    // simple polling: storage events don't always fire in same tab
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="op-container">
      <h1 className="op-title-lg">Settings</h1>

      <section className="op-section">
        <h2 className="op-section-title">Node connection</h2>

        {connected ? (
          <div className="op-card op-card--padded op-mt-12">
            <div className="op-subtle">
              Connected to:
              {" "}
              <code className="op-code">{nodeUrl}</code>
            </div>
            <div className="op-mt-12">
              <a className="op-link" href="/connect">
                Change connection →
              </a>
            </div>
            <div className="op-mt-12">
              <button
                className="op-btn"
                onClick={() => {
                  clearCreatorConnection();
                  refresh();
                }}
                title="Disconnect (clears stored node + token)"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="op-card op-card--padded op-mt-12">
            <div className="op-subtle">Not connected.</div>
            <div className="op-mt-12">
              <a className="op-link" href="/connect">
                Connect a node →
              </a>
            </div>
          </div>
        )}
      </section>

      <section className="op-section">
        <h2 className="op-section-title">Register</h2>
        <div className="op-card op-card--padded op-mt-12">
          <div className="op-subtle">
            Register your node with a directory so others can discover it.
          </div>
          <div className="op-mt-12">
            <a className="op-link" href="/register">
              Register node →
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
