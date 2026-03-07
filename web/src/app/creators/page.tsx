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
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Creators</h1>
      <p style={{ opacity: 0.8, marginTop: 6 }}>
        Indexer: <code>{INDEXER_BASE_URL}</code>
      </p>

      {error && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #633", borderRadius: 10 }}>
          {error}
        </div>
      )}

      {!data ? (
        <p style={{ opacity: 0.8, marginTop: 12 }}>Loading…</p>
      ) : (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {data.results.map((c) => (
            <div key={c.creator_id} style={{ border: "1px solid #333", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{c.display_name || c.creator_id}</div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>
                    <code>{c.creator_id}</code>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>{c.count} poster(s)</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{c.last_changed_at || "-"}</div>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <a href={`/browse?creator_id=${encodeURIComponent(c.creator_id)}`}>Browse this creator →</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
