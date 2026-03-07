"use client";

import { useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { PosterEntry, SearchResponse } from "@/lib/types";

function PosterStrip({ items }: { items: PosterEntry[] }) {
  return (
    <div className="op-grid op-grid--strip op-mt-10">
      {items.map((r) => (
        <div key={r.poster_id} className="op-card">
          <a className="op-link" href={`/p/${encodeURIComponent(r.poster_id)}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="op-img" src={r.assets.preview.url} alt={r.media.title || r.poster_id} />
          </a>
          <div className="op-poster-meta">
            <div className="op-poster-title">{r.media.title || "(untitled)"}</div>
            <div className="op-subtle op-text-sm">
              <a className="op-link" href={`/creator/${encodeURIComponent(r.creator.creator_id)}`}>
                {r.creator.display_name}
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PosterPage({ params }: { params: { posterId: string } }) {
  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);
  const posterId = params.posterId;

  const [poster, setPoster] = useState<PosterEntry | null>(null);
  const [similarByTmdb, setSimilarByTmdb] = useState<PosterEntry[] | null>(null);
  const [moreByCreator, setMoreByCreator] = useState<PosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`${base}/v1/posters/${encodeURIComponent(posterId)}`);
        if (!r.ok) throw new Error(`poster failed: ${r.status}`);
        const json = (await r.json()) as any;
        if (json?.error === "not_found") {
          setPoster(null);
          setError("Not found");
          return;
        }

        const p = json as PosterEntry;
        setPoster(p);

        // Pre-initialize related arrays for nicer loading states
        setSimilarByTmdb([]);
        setMoreByCreator([]);

        // Similar: same TMDB id + media type
        if (p.media.tmdb_id) {
          const u = new URL(`${base}/v1/search`);
          u.searchParams.set("tmdb_id", String(p.media.tmdb_id));
          u.searchParams.set("type", p.media.type);
          u.searchParams.set("limit", "12");
          const sr = await fetch(u.toString());
          if (sr.ok) {
            const sjson = (await sr.json()) as SearchResponse;
            setSimilarByTmdb(sjson.results.filter((x) => x.poster_id !== p.poster_id));
          }
        }

        // More by creator
        if (p.creator.creator_id) {
          const u = new URL(`${base}/v1/search`);
          u.searchParams.set("creator_id", String(p.creator.creator_id));
          u.searchParams.set("limit", "12");
          const cr = await fetch(u.toString());
          if (cr.ok) {
            const cjson = (await cr.json()) as SearchResponse;
            setMoreByCreator(cjson.results.filter((x) => x.poster_id !== p.poster_id));
          }
        }
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
  }, [base, posterId]);

  return (
    <div className="op-container">
      <div className="op-row op-row--between">
        <div>
          <h1 className="op-title-lg">{poster?.media.title || "Poster"}</h1>
          <div className="op-subtle op-text-sm">
            <code className="op-code">{posterId}</code>
          </div>
        </div>
        <div>
          <a className="op-link op-text-sm" href="/browse">
            Back to browse →
          </a>
        </div>
      </div>

      {error && <div className="op-alert op-alert--error">{error}</div>}

      {!poster ? (
        <p className="op-subtle op-mt-12">Loading…</p>
      ) : (
        <div className="op-section">
          <div className="op-grid op-grid--detail">
            <div className="op-card">
              <a href={poster.assets.preview.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="op-img" src={poster.assets.preview.url} alt={poster.media.title || poster.poster_id} />
              </a>
            </div>

            <div className="op-card op-card--padded">
              <div className="op-row op-row--between">
                <div className="op-section-title">Details</div>
                <div className="op-row">
                  <span className="op-badge">{poster.media.type}</span>
                  {poster.media.tmdb_id !== undefined && poster.media.tmdb_id !== null && (
                    <span className="op-badge">TMDB {poster.media.tmdb_id}</span>
                  )}
                </div>
              </div>

              <div className="op-mt-12 op-text-sm op-kv">
                <div><strong>Creator</strong></div>
                <div>
                  <a className="op-link" href={`/creator/${encodeURIComponent(poster.creator.creator_id)}`}>
                    {poster.creator.display_name}
                  </a>
                </div>

                <div><strong>Year</strong></div>
                <div>{poster.media.year || "-"}</div>

                <div><strong>Node</strong></div>
                <div>
                  <a className="op-link" href={poster.creator.home_node} target="_blank" rel="noreferrer">
                    {poster.creator.home_node}
                  </a>
                </div>
              </div>

              <div className="op-mt-12 op-row">
                <a className="op-btn" href={poster.assets.full.url} target="_blank" rel="noreferrer">
                  Download full
                </a>
                <a className="op-btn" href={poster.assets.preview.url} target="_blank" rel="noreferrer">
                  Open preview
                </a>
              </div>

              <div className="op-mt-16 op-text-sm">
                <div className="op-subtle">Attribution</div>
                <div className="op-kv op-mt-10">
                  <div><strong>License</strong></div>
                  <div>{(poster as any).attribution?.license || "-"}</div>

                  <div><strong>Redistribution</strong></div>
                  <div>{(poster as any).attribution?.redistribution || "-"}</div>

                  <div><strong>Source</strong></div>
                  <div>
                    {(poster as any).attribution?.source_url ? (
                      <a className="op-link" href={(poster as any).attribution.source_url} target="_blank" rel="noreferrer">
                        {(poster as any).attribution.source_url}
                      </a>
                    ) : (
                      "-"
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {poster.links && poster.links.length > 0 && (
            <div className="op-section">
              <h2 className="op-section-title">Related artwork</h2>
              <div className="op-grid op-mt-10">
                {poster.links.map((l, idx) => {
                  const derivedBoxsetHref =
                    l.media?.type === "show" && l.media.tmdb_id
                      ? `/tv/${encodeURIComponent(String(l.media.tmdb_id))}/boxset`
                      : l.media?.type === "collection" && l.media.tmdb_id
                        ? `/movie/${encodeURIComponent(String(l.media.tmdb_id))}/boxset`
                        : null;

                  return (
                    <div key={idx} className="op-card op-card--padded">
                      <div className="op-card-title">{l.title || l.rel || "Related"}</div>
                      <div className="op-subtle op-text-sm op-mt-6">
                        <code className="op-code">{l.href}</code>
                      </div>
                      <div className="op-row op-mt-10">
                        <a className="op-link" href={l.href}>
                          Open poster →
                        </a>
                        {derivedBoxsetHref && (
                          <a className="op-link" href={derivedBoxsetHref}>
                            Open box set →
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="op-section">
            <div className="op-row op-row--between">
              <h2 className="op-section-title">Similar (same TMDB)</h2>
              {poster.media.tmdb_id ? (
                <a className="op-link op-text-sm" href={`/search?tmdb_id=${encodeURIComponent(String(poster.media.tmdb_id))}&type=${encodeURIComponent(poster.media.type)}`}>
                  See all →
                </a>
              ) : (
                <span />
              )}
            </div>

            {similarByTmdb === null ? (
              <p className="op-subtle op-mt-12">Loading…</p>
            ) : similarByTmdb.length === 0 ? (
              <p className="op-subtle op-mt-12">No similar posters yet.</p>
            ) : (
              <PosterStrip items={similarByTmdb} />
            )}
          </div>

          <div className="op-section">
            <div className="op-row op-row--between">
              <h2 className="op-section-title">More by creator</h2>
              <a className="op-link op-text-sm" href={`/creator/${encodeURIComponent(poster.creator.creator_id)}`}>
                View creator →
              </a>
            </div>

            {moreByCreator === null ? (
              <p className="op-subtle op-mt-12">Loading…</p>
            ) : moreByCreator.length === 0 ? (
              <p className="op-subtle op-mt-12">No more posters from this creator yet.</p>
            ) : (
              <PosterStrip items={moreByCreator} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
