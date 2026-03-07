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
  const [data, setData] = useState<CreatorsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const url = useMemo(() => {
    const base = INDEXER_BASE_URL.replace(/\/+$/, "");
    return base + "/v1/creators?limit=200";
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`creators failed: ${r.status}`);
        setData((await r.json()) as CreatorsResponse);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
  }, [url]);

  return (
    <div className="op-container op-container--narrow">
      <h1 className="op-title-lg">Creators</h1>
      <p className="op-subtle op-mt-6">
        Indexer: <code className="op-code">{INDEXER_BASE_URL}</code>
      </p>

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

              <div className="op-mt-10">
                <a className="op-link" href={`/browse?creator_id=${encodeURIComponent(c.creator_id)}`}>
                  Browse this creator →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
