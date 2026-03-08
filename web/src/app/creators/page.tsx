"use client";

import { useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";

type CreatorsResponse = {
  results: Array<{
    creator_id: string;
    display_name: string | null;
    count: number;
    last_changed_at: string | null;
  }>;
};

export default function CreatorsPage() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<CreatorsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const url = useMemo(() => {
    const base = INDEXER_BASE_URL.replace(/\/+$/, "");
    const u = new URL(base + "/v1/creators");
    u.searchParams.set("limit", "200");
    if (q.trim() !== "") u.searchParams.set("q", q.trim());
    return u.toString();
  }, [q]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`creators failed: ${r.status}`);
        setData((await r.json()) as CreatorsResponse);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [url]);

  return (
    <div className="op-container op-container--narrow">
      <h1 className="op-title-lg">Creators</h1>
      <p className="op-subtle op-mt-6">
        Indexer: <code className="op-code">{INDEXER_BASE_URL}</code>
      </p>

      <section className="op-section">
        <h2 className="op-section-title">Find a creator</h2>
        <input className="op-input op-mt-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search creator names…" />
      </section>

      {error && <div className="op-alert op-alert--error">{error}</div>}

      {!data ? (
        <p className="op-subtle op-mt-12">Loading…</p>
      ) : (
        <div className="op-section op-stack">
          {data.results.map((c) => (
            <div key={c.creator_id} className="op-card op-card--padded">
              <div className="op-row op-row--between">
                <div>
                  <div className="op-card-title">{c.display_name || c.creator_id}</div>
                  <div className="op-subtle op-text-sm">
                    <code className="op-code">{c.creator_id}</code>
                  </div>
                </div>
                <div className="op-text-right">
                  <div className="op-text-sm op-subtle-strong">{c.count} poster(s)</div>
                  <div className="op-text-sm op-faint">{c.last_changed_at || "-"}</div>
                </div>
              </div>

              <div className="op-row op-row--between op-mt-10">
                <a className="op-link" href={`/creator/${encodeURIComponent(c.creator_id)}`}>
                  View creator →
                </a>
                <a className="op-link" href={`/browse?creator_id=${encodeURIComponent(c.creator_id)}`}>
                  Browse posters →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
