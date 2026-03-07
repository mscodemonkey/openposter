"use client";

import { useMemo } from "react";

type PosterImg = { src: string; title: string };

type SeasonGroup = { season: number; episodes: PosterImg[] };

function TedBoxSet() {
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
    <div className="op-container">
      <div className="op-row op-row--between">
        <div>
          <h1 className="op-title-lg">ted (2024) Box Set</h1>
          <div className="op-subtle op-text-sm op-mt-6">
            Reference creator: <strong>willtong93</strong>
          </div>
        </div>
      </div>

      <section className="op-section">
        <h2 className="op-section-title">Main show poster</h2>
        <div className="op-grid op-grid--posters op-mt-10">
          {main.map((p) => (
            <div key={p.src} className="op-card">
              <a className="op-link" href={p.src} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="op-img" src={p.src} alt={p.title} />
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="op-section">
        <h2 className="op-section-title">Season posters</h2>
        <div className="op-grid op-grid--posters op-mt-10">
          {seasons.map((p) => (
            <div key={p.src} className="op-card">
              <a className="op-link" href={p.src} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="op-img" src={p.src} alt={p.title} />
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="op-section">
        <h2 className="op-section-title">Episode cards</h2>
        <p className="op-subtle op-text-sm op-mt-6">
          Grouped by season. (Boxset posters for the Ted movies are intentionally omitted.)
        </p>

        {seasonGroups.map((sg) => (
          <div key={sg.season} className="op-section">
            <div className="op-row op-row--between">
              <h3 className="op-section-title">Season {sg.season}</h3>
            </div>
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

export default function TvBoxsetPage({
  params,
}: {
  params: { showTmdbId: string };
}) {
  const showTmdbId = params.showTmdbId;

  const isTed = useMemo(() => showTmdbId === "201834", [showTmdbId]);

  if (!isTed) {
    return (
      <div className="op-container">
        <h1 className="op-title-lg">TV Box Set</h1>
        <p className="op-subtle op-mt-12">
          No demo box set is configured for <code className="op-code">{showTmdbId}</code> yet.
        </p>
      </div>
    );
  }

  return <TedBoxSet />;
}
