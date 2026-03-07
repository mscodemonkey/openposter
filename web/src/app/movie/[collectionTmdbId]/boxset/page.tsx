"use client";

import { use, useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { PosterEntry, SearchResponse } from "@/lib/types";

type PosterImg = { src: string; title: string };

function PosterGridIndexed({ items }: { items: PosterEntry[] }) {
  return (
    <div className="op-grid op-grid--posters op-mt-10">
      {items.map((p) => (
        <div key={p.poster_id} className="op-card">
          <a className="op-link" href={`/p/${encodeURIComponent(p.poster_id)}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="op-img" src={p.assets.preview.url} alt={p.media.title || p.poster_id} />
          </a>
        </div>
      ))}
    </div>
  );
}

function relatedTypeLabel(p: PosterEntry): string {
  if (p.media.type === "show") return "TV Show Box Set";
  if (p.media.type === "collection") return "Movie Box Set";
  return "Poster";
}

function relatedTargetHref(p: PosterEntry): string {
  if (p.media.type === "show" && p.media.tmdb_id) return `/tv/${encodeURIComponent(String(p.media.tmdb_id))}/boxset`;
  if (p.media.type === "collection" && p.media.tmdb_id) return `/movie/${encodeURIComponent(String(p.media.tmdb_id))}/boxset`;
  return `/p/${encodeURIComponent(p.poster_id)}`;
}

function RelatedArtworkGrid({ items }: { items: PosterEntry[] }) {
  return (
    <div className="op-grid op-grid--posters op-mt-10">
      {items.map((p) => {
        const href = relatedTargetHref(p);
        return (
          <div key={p.poster_id} className="op-card">
            <a className="op-link" href={href}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="op-img" src={p.assets.preview.url} alt={p.media.title || p.poster_id} />
            </a>
            <div className="op-poster-meta">
              <a className="op-link" href={href}>
                <div className="op-poster-title">{p.media.title || "(untitled)"}</div>
                <div className="op-subtle op-text-sm">{relatedTypeLabel(p)}</div>
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RelatedArtworkFromLinks({ base, links }: { base: string; links: PosterEntry["links"] }) {
  const [items, setItems] = useState<PosterEntry[] | null>(null);

  useEffect(() => {
    void (async () => {
      if (!links || links.length === 0) {
        setItems([]);
        return;
      }

      const posterLinks = links.filter(
        (l) =>
          l.rel === "related" &&
          typeof l.href === "string" &&
          l.href.startsWith("/p/") &&
          (l.media?.type === "show" || l.media?.type === "collection"),
      );
      const posterIds = posterLinks.map((l) => decodeURIComponent(l.href.slice(3))).filter(Boolean);

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
  }, [base, links]);

  if (!links || links.length === 0) return null;
  if (items === null) return <p className="op-subtle op-mt-12">Loading related…</p>;
  if (items.length === 0) return null;

  return (
    <section className="op-section">
      <h2 className="op-section-title">Related artwork</h2>
      <RelatedArtworkGrid items={items} />
    </section>
  );
}

function TedMovieBoxSetDemo() {
  // Demo assets downloaded from mediux.pro/sets/41948 (Boxset Posters section)
  // Creator: willtong93
  const boxsetPosters: PosterImg[] = [
    {
      src: "/demo/ted-movie-boxset/d7ee7c6c-89cc-46b7-95ba-0c276fd78a7d.jpg",
      title: "Box set poster",
    },
    {
      src: "/demo/ted-movie-boxset/80cc5135-0583-413b-9e5c-204a47cca3d2.jpg",
      title: "Ted (2012)",
    },
    {
      src: "/demo/ted-movie-boxset/60d105b9-740d-4d1e-9d3f-5759e9d9aa7c.jpg",
      title: "Ted 2 (2015)",
    },
  ];

  return (
    <div>
      <div className="op-row op-row--between">
        <div>
          <h1 className="op-title-lg">ted collection Movie Box Set</h1>
          <div className="op-subtle op-text-sm op-mt-6">
            Reference creator: <strong>willtong93</strong>
          </div>
        </div>
        <a className="op-link op-text-sm" href="/tv/201834/boxset">
          Back to TV box set →
        </a>
      </div>

      <section className="op-section">
        <h2 className="op-section-title">Related artwork</h2>
        <div className="op-grid op-grid--posters op-mt-10">
          <div className="op-card">
            <a className="op-link" href="/tv/201834/boxset">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="op-img"
                src="/demo/ted-boxset/c4ae91b4-a5ee-404d-a65d-9d42f81f64b0.jpg"
                alt="ted (2024) TV Box Set"
              />
            </a>
            <div className="op-poster-meta">
              <div className="op-poster-title">ted (2024) TV Box Set</div>
            </div>
          </div>
        </div>
      </section>

      <section className="op-section">
        <h2 className="op-section-title">Movie box set posters</h2>
        <div className="op-grid op-grid--posters op-mt-10">
          {boxsetPosters.map((p) => (
            <div key={p.src} className="op-card">
              <a className="op-link" href={p.src} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="op-img" src={p.src} alt={p.title} />
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MovieBoxsetReal({ collectionTmdbId }: { collectionTmdbId: string }) {
  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);
  const [collection, setCollection] = useState<PosterEntry | null>(null);
  const [movies, setMovies] = useState<PosterEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const u = new URL(`${base}/v1/search`);
        u.searchParams.set("tmdb_id", collectionTmdbId);
        u.searchParams.set("type", "collection");
        u.searchParams.set("limit", "5");
        const r = await fetch(u.toString());
        if (!r.ok) throw new Error(`collection search failed: ${r.status}`);
        const json = (await r.json()) as SearchResponse;
        const first = json.results[0] || null;
        setCollection(first);

        if (!first?.links || first.links.length === 0) {
          setMovies([]);
          return;
        }

        const movieLinks = first.links.filter((l) => l.media?.type === "movie" && l.href.startsWith("/p/"));
        const posterIds = movieLinks
          .map((l) => decodeURIComponent(l.href.slice("/p/".length)))
          .filter(Boolean);

        const fetched: PosterEntry[] = [];
        for (const pid of posterIds) {
          // eslint-disable-next-line no-await-in-loop
          const pr = await fetch(`${base}/v1/posters/${encodeURIComponent(pid)}`);
          if (!pr.ok) continue;
          // eslint-disable-next-line no-await-in-loop
          fetched.push((await pr.json()) as PosterEntry);
        }

        setMovies(fetched);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
  }, [base, collectionTmdbId]);

  if (error) return <div className="op-alert op-alert--error">{error}</div>;

  // If not found or not linked yet, fall back to demo.
  if (!collection) return <TedMovieBoxSetDemo />;

  return (
    <div>
      <div className="op-row op-row--between">
        <div>
          <h1 className="op-title-lg">{collection.media.title || "Movie Box Set"}</h1>
          <div className="op-subtle op-text-sm op-mt-6">
            Created by: <strong>{collection.creator.display_name}</strong>
          </div>
        </div>
      </div>

      <section className="op-section">
        <h2 className="op-section-title">Box set poster</h2>
        <PosterGridIndexed items={[collection]} />
      </section>

      <section className="op-section">
        <h2 className="op-section-title">Movies</h2>
        {movies.length === 0 ? (
          <p className="op-subtle op-mt-12">No movies linked yet.</p>
        ) : (
          <PosterGridIndexed items={movies} />
        )}
      </section>

      <RelatedArtworkFromLinks base={base} links={collection.links || null} />
    </div>
  );
}

export default function MovieBoxsetPage({
  params,
}: {
  params: Promise<{ collectionTmdbId: string }>;
}) {
  const { collectionTmdbId } = use(params);

  return (
    <div className="op-container">
      <MovieBoxsetReal collectionTmdbId={collectionTmdbId} />
    </div>
  );
}
