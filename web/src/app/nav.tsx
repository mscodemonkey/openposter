"use client";

import { useEffect, useState } from "react";

import {
  clearCreatorConnection,
  loadCreatorConnection,
} from "@/lib/storage";

export default function Nav() {
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
    <nav className="op-nav">
      <a href="/">Home</a>
      <a href="/browse">Browse</a>
      <a href="/search">Search</a>
      <a href="/creators">Creators</a>
      <a href="/connect">Connect node</a>
      <a href="/upload">Upload</a>
      <a href="/library">My library</a>
      <a href="/register">Register</a>
      <a href="/tv/201834/boxset">Ted TV box set (demo)</a>
      <a href="/movie/1703/boxset">Ted Movie box set (demo)</a>

      <div className="op-spacer" />

      {connected ? (
        <div className="op-row">
          <span className="op-subtle op-text-sm">
            Connected: <code className="op-code">{nodeUrl}</code>
          </span>
          <button
            className="op-btn op-btn--sm"
            onClick={() => {
              clearCreatorConnection();
              refresh();
            }}
            title="Disconnect (clears stored node + token)"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <span className="op-subtle op-text-sm">Not connected</span>
      )}
    </nav>
  );
}
