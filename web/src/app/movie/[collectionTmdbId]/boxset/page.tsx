"use client";

import { useMemo } from "react";

type PosterImg = { src: string; title: string };

function TedMovieBoxSet() {
  const boxsetPosters: PosterImg[] = [
    {
      src: "/demo/ted-movie-boxset/d7ee7c6c-89cc-46b7-95ba-0c276fd78a7d.jpg",
      title: "Movie box set poster",
    },
    {
      src: "/demo/ted-movie-boxset/80cc5135-0583-413b-9e5c-204a47cca3d2.jpg",
      title: "Movie box set poster",
    },
    {
      src: "/demo/ted-movie-boxset/60d105b9-740d-4d1e-9d3f-5759e9d9aa7c.jpg",
      title: "Movie box set poster",
    },
  ];

  return (
    <div className="op-container">
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
        <div className="op-subtle op-text-sm op-mt-6">
          <a className="op-link" href="/tv/201834/boxset">
            ted (2024) TV Box Set
          </a>
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

export default function MovieBoxsetPage({
  params,
}: {
  params: { collectionTmdbId: string };
}) {
  const id = params.collectionTmdbId;
  const isTed = useMemo(() => id === "1703", [id]);

  if (!isTed) {
    return (
      <div className="op-container">
        <h1 className="op-title-lg">Movie Box Set</h1>
        <p className="op-subtle op-mt-12">
          No demo movie box set is configured for <code className="op-code">{id}</code> yet.
        </p>
      </div>
    );
  }

  return <TedMovieBoxSet />;
}
