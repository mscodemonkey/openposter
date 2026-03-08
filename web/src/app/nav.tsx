"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  clearCreatorConnection,
  loadCreatorConnection,
} from "@/lib/storage";

export default function Nav() {
  // IMPORTANT: keep initial render deterministic to avoid hydration mismatch.
  // We'll refresh from storage in an effect.
  const [connected, setConnected] = useState(false);
  const [nodeUrl, setNodeUrl] = useState<string | null>(null);
  const [hasNodeUrlOnly, setHasNodeUrlOnly] = useState(false);

  function refresh() {
    const conn = loadCreatorConnection();
    setConnected(Boolean(conn));
    setNodeUrl(conn?.nodeUrl || null);

    // If we have a saved node URL but no token (sessionStorage cleared),
    // show a more helpful hint than just "Not connected".
    try {
      const savedNode = window.localStorage.getItem("openposter.creatorConnection.nodeUrl.v1");
      setHasNodeUrlOnly(Boolean(savedNode) && !conn);
    } catch {
      setHasNodeUrlOnly(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // simple polling: storage events don't always fire in same tab
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <nav className="op-nav">
      <Link href="/">Home</Link>
      <Link href="/browse">Posters</Link>
      <Link href="/creators">Creators</Link>
      <Link href="/upload">Upload</Link>
      <Link href="/library">My library</Link>
      <Link href="/onboarding">Onboarding</Link>
      <Link href="/settings">Settings</Link>

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
      ) : hasNodeUrlOnly ? (
        <span className="op-subtle op-text-sm">Token missing (open Settings)</span>
      ) : (
        <span className="op-subtle op-text-sm">Not connected</span>
      )}
    </nav>
  );
}
