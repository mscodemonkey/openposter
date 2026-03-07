"use client";

import { use, useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";
import RelatedArtworkSection from "@/components/RelatedArtworkSection";
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="op-img" src={p.src} alt={p.title} />
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

  const latestSeason = Math.max(...seasonGroups.map((s) => s.season));
  // Latest season expanded by default
  const [expandedSeasons, setExpandedSeasons] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    for (const s of seasonGroups) m[s.season] = s.season === latestSeason;
    return m;
  });

  const sortedSeasonGroups = [...seasonGroups].sort((a, b) => b.season - a.season);

  return (
    <div className="op-page">
      <div className="op-page-bg" style={{ backgroundImage: `url(${main[0]?.src})` }} />
      <div className="op-page-content">
        <div className="op-row op-row--between">
        <div>
          <h1 className="op-title-lg">ted</h1>
          <div className="op-subtle op-mt-6" style={{ fontSize: "1rem" }}>
            TV SHOW | 2024 | willtong93
          </div>
        </div>
      </div>


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

        {sortedSeasonGroups.map((sg) => {
          const expanded = !!expandedSeasons[sg.season];
          return (
            <div key={sg.season} className="op-section">
              <button
                type="button"
                className="op-row"
                style={{
                  gap: 10,
                  width: "100%",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onClick={() =>
                  setExpandedSeasons((prev) => ({
                    ...prev,
                    [sg.season]: !prev[sg.season],
                  }))
                }
              >
                <span style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
                  {expanded ? "▼" : "▶︎"}
                </span>
                <h3 className="op-section-title" style={{ margin: 0 }}>
                  Season {sg.season}
                </h3>
              </button>

              {expanded && (
                <div className="op-grid op-grid--episode-cards op-mt-10">
                  {sg.episodes.map((e) => (
                    <div key={e.src} className="op-card" style={{ justifySelf: "start" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="op-img"
                        src={e.src}
                        alt={e.title}
                        style={{ height: 100, width: "auto", objectFit: "contain" }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      <section className="op-section">
        <h2 className="op-section-title">Related artwork</h2>
        <div className="op-grid op-grid--posters op-mt-10">
          <div className="op-card">
            <a className="op-link" href="/movie/1703/boxset">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="op-img"
                src="/demo/ted-movie-boxset/d7ee7c6c-89cc-46b7-95ba-0c276fd78a7d.jpg"
                alt="ted collection"
              />
            </a>
            <div className="op-poster-meta">
              <a className="op-link" href="/movie/1703/boxset">
                <div className="op-poster-title">ted collection</div>
                <div className="op-subtle op-text-sm">Movie Box Set</div>
              </a>
            </div>
          </div>
        </div>
      </section>
      </section>
      </div>
    </div>
  );
}

function RelatedArtworkFromLinks({
  base,
  links,
}: {
  base: string;
  links: PosterEntry["links"];
}) {
  const [items, setItems] = useState<PosterEntry[] | null>(null);

  useEffect(() => {
    void (async () => {
      if (!links || links.length === 0) {
        setItems([]);
        return;
      }

      const posterLinks = links.filter(
        (l) => l.rel === "related" && typeof l.href === "string" && l.href.startsWith("/p/"),
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

function TvBoxsetReal({ showTmdbId }: { showTmdbId: string }) {
  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);

  const [data, setData] = useState<TvBoxsetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSeasons, setExpandedSeasons] = useState<Record<number, boolean>>({});

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`${base}/v1/tv_boxset/${encodeURIComponent(showTmdbId)}`);
        if (!r.ok) throw new Error(`tv_boxset failed: ${r.status}`);
        const json = (await r.json()) as TvBoxsetResponse;
        setData(json);

        const seasons = Object.keys(json.episodes_by_season)
          .map((k) => Number(k))
          .filter((n) => Number.isFinite(n));
        const latest = seasons.length > 0 ? Math.max(...seasons) : null;
        if (latest !== null) {
          setExpandedSeasons(() => {
            const m: Record<number, boolean> = {};
            for (const s of seasons) m[s] = s === latest;
            return m;
          });
        }
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
    <div className="op-page">
      <div className="op-page-bg" style={{ backgroundImage: `url(${data.show[0]?.assets.preview.url})` }} />
      <div className="op-page-content">
        <div className="op-row op-row--between">
        <div>
          <h1 className="op-title-lg">{data.show[0]?.media.title || "TV Box Set"}</h1>
          <div className="op-subtle op-mt-6" style={{ fontSize: "1rem" }}>
            TV SHOW{data.show[0]?.media.year ? ` | ${data.show[0].media.year}` : ""}{data.show[0]?.creator.display_name ? ` | ${data.show[0].creator.display_name}` : ""}
          </div>
        </div>
      </div>

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

        {Object.entries(data.episodes_by_season)
          .map(([season, eps]) => ({ season: Number(season), eps }))
          .filter((x) => Number.isFinite(x.season))
          .sort((a, b) => b.season - a.season)
          .map(({ season, eps }) => {
            const expanded = !!expandedSeasons[season];
            return (
              <div key={season} className="op-section">
                <button
                  type="button"
                  className="op-row"
                  style={{
                    gap: 10,
                    width: "100%",
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onClick={() =>
                    setExpandedSeasons((prev) => ({
                      ...prev,
                      [season]: !prev[season],
                    }))
                  }
                >
                  <span style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
                    {expanded ? "▼" : "▶︎"}
                  </span>
                  <h3 className="op-section-title" style={{ margin: 0 }}>
                    Season {season}
                  </h3>
                </button>

                {expanded && (
                  <div className="op-grid op-grid--episode-cards op-mt-10">
                    {eps.map((p) => (
                      <div key={p.poster_id} className="op-card" style={{ justifySelf: "start" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className="op-img"
                          src={p.assets.preview.url}
                          alt={p.media.title || p.poster_id}
                          style={{ height: 100, width: "auto", objectFit: "contain" }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </section>

      <RelatedArtworkSection base={base} links={data.show[0]?.links || null} />
      </div>
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
