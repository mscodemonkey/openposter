"use client";

import { useEffect, useMemo, useState } from "react";

import type { PosterEntry } from "@/lib/types";

export type RelatedArtworkSectionProps = {
  base: string;
  links: PosterEntry["links"];
  /** Default: only show rel === "related" */
  relFilter?: (rel: string) => boolean;
  title?: string;
};

function typeLabel(p: PosterEntry): string {
  if (p.media.type === "show") return "TV Show Box Set";
  if (p.media.type === "collection") return "Movie Box Set";
  return "Poster";
}

function targetHref(p: PosterEntry): string {
  if (p.media.type === "show" && p.media.tmdb_id) return `/tv/${encodeURIComponent(String(p.media.tmdb_id))}/boxset`;
  if (p.media.type === "collection" && p.media.tmdb_id) return `/movie/${encodeURIComponent(String(p.media.tmdb_id))}/boxset`;
  return `/p/${encodeURIComponent(p.poster_id)}`;
}

function PosterGridCaptioned({ items }: { items: PosterEntry[] }) {
  return (
    <div className="op-grid op-grid--posters op-mt-10">
      {items.map((p) => {
        const href = targetHref(p);
        return (
          <div key={p.poster_id} className="op-card">
            <a className="op-link" href={href}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="op-img" src={p.assets.preview.url} alt={p.media.title || p.poster_id} />
            </a>
            <div className="op-poster-meta">
              <a className="op-link" href={href}>
                <div className="op-poster-title">{p.media.title || "(untitled)"}</div>
                <div className="op-subtle op-text-sm">{typeLabel(p)}</div>
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function RelatedArtworkSection({
  base,
  links,
  relFilter,
  title = "Related artwork",
}: RelatedArtworkSectionProps) {
  const [items, setItems] = useState<PosterEntry[] | null>(null);

  const filteredLinks = useMemo(() => {
    if (!links || links.length === 0) return [];
    const filter = relFilter || ((r: string) => r === "related");
    return links.filter((l) => filter(l.rel) && typeof l.href === "string" && l.href.startsWith("/p/"));
  }, [links, relFilter]);

  useEffect(() => {
    void (async () => {
      if (filteredLinks.length === 0) {
        setItems([]);
        return;
      }

      const posterIds = filteredLinks.map((l) => decodeURIComponent(l.href.slice(3))).filter(Boolean);

      const fetched: PosterEntry[] = [];
      for (const pid of posterIds) {
        // eslint-disable-next-line no-await-in-loop
        const r = await fetch(`${base}/v1/posters/${encodeURIComponent(pid)}`);
        if (!r.ok) continue;
        // eslint-disable-next-line no-await-in-loop
        fetched.push((await r.json()) as PosterEntry);
      }
      setItems(fetched);
    })();
  }, [base, filteredLinks]);

  if (filteredLinks.length === 0) return null;
  if (items === null) return <p className="op-subtle op-mt-12">Loading related…</p>;
  if (items.length === 0) return null;

  return (
    <section className="op-section">
      <h2 className="op-section-title">{title}</h2>
      <PosterGridCaptioned items={items} />
    </section>
  );
}
