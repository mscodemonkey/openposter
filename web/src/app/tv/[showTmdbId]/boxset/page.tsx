"use client";

import { use, useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { PosterEntry } from "@/lib/types";

type PosterImg = { src: string; title: string };

type SeasonGroup = { season: number; episodes: PosterImg[] };

type TvBoxsetResponse = {
  show_tmdb_id: string;
  show: PosterEntry[];
  seasons: PosterEntry[];
  episodes_by_season: Record<string, PosterEntry[]>;
};

function PosterGridStatic({ items }: { items: PosterImg[] }) {
  return (
    <div className="op-grid op-grid--posters op-mt-10">
      {items.map((p) => (
        <div key={p.src} className="op-card">
          <a className="op-link" href={p.src} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="op-img" src={p.src} alt={p.title} />
          </a>
        </div>
      ))}
    </div>
  );
}

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

function TedBoxSetDemo() {
  // NOTE: Reference layout inspired by mediux.pro/sets/41948 (willtong93)
  // These are downloaded assets stored locally under /public/demo/ted-boxset
  const main: PosterImg[] = [
    {
      src: "/demo/ted-boxset/c4ae91b4-a5ee-404d-a65d-9d42f81f64b0.jpg",
      title: "Main show poster",
    },
  ];

  const seasons: PosterImg[] = [
    {
      src: "/demo/ted-boxset/564086cb-c416-4a52-910a-1e6245eecc64.jpg",
      title: "Season poster",
    },
    {
      src: "/demo/ted-boxset/e17b53be-4d55-4445-b65e-dc0840ea6df6.jpg",
      title: "Season poster",
    },
  ];

  const seasonGroups: SeasonGroup[] = [
    {
      season: 1,
      episodes: [
        { src: "/demo/ted-boxset/2e9bab52-ab2f-46cf-bd97-5df7d9255fc8.jpg", title: "Episode card" },
        { src: "/demo/ted-boxset/65397f0f-fd8b-4729-897b-7af4ee70f9a0.jpg", title: "Episode card" },
        { src: "/demo/ted-boxset/7774fa94-61e3-4cf5-bda0-9af7d15c2f99.jpg", title: "Episode card" },
        { src: "/demo/ted-boxset/7899535c-4164-414a-97cc-3678e3cbb755.jpg", title: "Episode card" },
        { src: "/demo/ted-boxset/58d48c5d-7cc8-4a90-8684-ec8990af7df4.jpg", title: "Episode card" },
        { src: "/demo/ted-boxset/39ee2afb-55d5-4aed-bd6e-c84e5858e459.jpg", title: "Episode card" },
        { src: "/demo/ted-boxset/bb4c1a15-543c-4168-aa16-7e2d46da375c.jpg", title: "Episode card" },
      ],
    },
  ];

  return (
    <div>
      <div className="op-row op-row--between">
        <div>
          <h1 className="op-title-lg">ted (2024) Box Set</h1>
          <div className="op-subtle op-text-sm op-mt-6">
            Reference creator: <strong>willtong93</strong>
          </div>
        </div>
      </div>

      <section className="op-section">
        <h2 className="op-section-title">Related artwork</h2>
        <div className="op-subtle op-text-sm op-mt-6">
          <a className="op-link" href="/movie/1703/boxset">
            ted collection Movie Box Set
          </a>
        </div>
      </section>

      <section className="op-section">
        <h2 className="op-section-title">Main show poster</h2>
        <PosterGridStatic items={main} />
      </section>

      <section className="op-section">
        <h2 className="op-section-title">Season posters</h2>
        <PosterGridStatic items={seasons} />
      </section>

      <section className="op-section">
        <h2 className="op-section-title">Episode cards</h2>
        <p className="op-subtle op-text-sm op-mt-6">
          Grouped by season. (Movie box set posters are shown under Related artwork.)
        </p>

        {seasonGroups.map((sg) => (
          <div key={sg.season} className="op-section">
            <h3 className="op-section-title">Season {sg.season}</h3>
            <div className="op-grid op-grid--episode-cards op-mt-10">
              {sg.episodes.map((e) => (
                <div key={e.src} className="op-card">
                  <a className="op-link" href={e.src} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="op-img" src={e.src} alt={e.title} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function RelatedArtworkFromLinks({ links }: { links: PosterEntry["links"] }) {
  if (!links || links.length === 0) return null;

  return (
    <section className="op-section">
      <h2 className="op-section-title">Related artwork</h2>
      <div className="op-grid op-mt-10">
        {links.map((l, idx) => {
          const derivedBoxsetHref =
            l.media?.type === "show" && l.media.tmdb_id
              ? `/tv/${encodeURIComponent(String(l.media.tmdb_id))}/boxset`
              : l.media?.type === "collection" && l.media.tmdb_id
                ? `/movie/${encodeURIComponent(String(l.media.tmdb_id))}/boxset`
                : null;

          return (
            <div key={idx} className="op-card op-card--padded">
              <div className="op-card-title">{l.title || l.rel || "Related"}</div>
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
    </section>
  );
}

function TvBoxsetReal({ showTmdbId }: { showTmdbId: string }) {
  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);

  const [data, setData] = useState<TvBoxsetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`${base}/v1/tv_boxset/${encodeURIComponent(showTmdbId)}`);
        if (!r.ok) throw new Error(`tv_boxset failed: ${r.status}`);
        setData((await r.json()) as TvBoxsetResponse);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
  }, [base, showTmdbId]);

  if (error) {
    return <div className="op-alert op-alert--error">{error}</div>;
  }

  if (!data) {
    return <p className="op-subtle op-mt-12">Loading…</p>;
  }

  const hasSeasonsOrEpisodes = data.seasons.length > 0 || Object.keys(data.episodes_by_season).length > 0;

  if (!hasSeasonsOrEpisodes) {
    // If the network doesn’t have the full box set structure yet, show the demo reference.
    return <TedBoxSetDemo />;
  }

  return (
    <div>
      <div className="op-row op-row--between">
        <div>
          <h1 className="op-title-lg">Ted (2024) Box Set</h1>
          <div className="op-subtle op-text-sm op-mt-6">
            Rendered from indexer <code className="op-code">/v1/tv_boxset</code>
          </div>
        </div>
      </div>

      <RelatedArtworkFromLinks links={data.show[0]?.links || null} />

      <section className="op-section">
        <h2 className="op-section-title">Main show posters</h2>
        <PosterGridIndexed items={data.show} />
      </section>

      <section className="op-section">
        <h2 className="op-section-title">Season posters</h2>
        <PosterGridIndexed items={data.seasons} />
      </section>

      <section className="op-section">
        <h2 className="op-section-title">Episode cards</h2>
        {Object.entries(data.episodes_by_season).map(([season, eps]) => (
          <div key={season} className="op-section">
            <h3 className="op-section-title">Season {season}</h3>
            <div className="op-grid op-grid--episode-cards op-mt-10">
              {eps.map((p) => (
                <div key={p.poster_id} className="op-card">
                  <a className="op-link" href={`/p/${encodeURIComponent(p.poster_id)}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="op-img" src={p.assets.preview.url} alt={p.media.title || p.poster_id} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export default function TvBoxsetPage({
  params,
}: {
  params: Promise<{ showTmdbId: string }>;
}) {
  const { showTmdbId } = use(params);

  return (
    <div className="op-container">
      <TvBoxsetReal showTmdbId={showTmdbId} />
    </div>
  );
}
