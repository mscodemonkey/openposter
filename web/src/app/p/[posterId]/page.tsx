"use client";

import { useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { PosterEntry } from "@/lib/types";

export default function PosterPage({ params }: { params: { posterId: string } }) {
  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);
  const posterId = params.posterId;

  const [poster, setPoster] = useState<PosterEntry | null>(null);
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
        setPoster(json as PosterEntry);
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
              <div className="op-section-title">Details</div>

              <div className="op-mt-10 op-text-sm">
                <div>
                  <strong>Media:</strong> {poster.media.type}
                </div>
                <div>
                  <strong>TMDB id:</strong> {poster.media.tmdb_id}
                </div>
                {poster.media.year && (
                  <div>
                    <strong>Year:</strong> {poster.media.year}
                  </div>
                )}
              </div>

              <div className="op-mt-12 op-text-sm">
                <strong>Creator:</strong>{" "}
                <a className="op-link" href={`/creator/${encodeURIComponent(poster.creator.creator_id)}`}>
                  {poster.creator.display_name}
                </a>
              </div>

              <div className="op-mt-12 op-row">
                <a className="op-btn" href={poster.assets.full.url} target="_blank" rel="noreferrer">
                  Download full
                </a>
                <a className="op-btn" href={poster.creator.home_node} target="_blank" rel="noreferrer">
                  Visit node
                </a>
              </div>

              <div className="op-mt-12 op-text-sm">
                <div className="op-subtle">Attribution</div>
                <div>
                  <strong>License:</strong> {(poster as any).attribution?.license || "-"}
                </div>
                <div>
                  <strong>Redistribution:</strong> {(poster as any).attribution?.redistribution || "-"}
                </div>
                <div>
                  <strong>Source:</strong>{" "}
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
      )}
    </div>
  );
}
