"use client";

import { use, useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";
import { loadCreatorConnection } from "@/lib/storage";
import type { PosterEntry, SearchResponse } from "@/lib/types";

type PosterLink = NonNullable<PosterEntry["links"]>[number];

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

export default function PosterPage({
  params,
}: {
  params: Promise<{ posterId: string }>;
}) {
  const { posterId } = use(params);
  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);

  const [poster, setPoster] = useState<PosterEntry | null>(null);
  const [similarByTmdb, setSimilarByTmdb] = useState<PosterEntry[] | null>(null);
  const [moreByCreator, setMoreByCreator] = useState<PosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [linksValue, setLinksValue] = useState<PosterLink[]>([]);
  const [linksDraft, setLinksDraft] = useState<string>("");
  const [linksAdvanced, setLinksAdvanced] = useState<boolean>(false);
  const [linksStatus, setLinksStatus] = useState<string | null>(null);
  const [linksSaving, setLinksSaving] = useState<boolean>(false);

  const [linkSearchQ, setLinkSearchQ] = useState<string>("");
  const [linkSearchLoading, setLinkSearchLoading] = useState<boolean>(false);
  const [linkSearchResults, setLinkSearchResults] = useState<PosterEntry[]>([]);
  const [linkSearchError, setLinkSearchError] = useState<string | null>(null);

  const [newLinkRelPreset, setNewLinkRelPreset] = useState<string>("related");
  const [newLinkRelCustom, setNewLinkRelCustom] = useState<string>("");

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
        const lv = (p.links || []) as PosterLink[];
        setLinksValue(lv);
        setLinksDraft(JSON.stringify(lv, null, 2));

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
                        <a
                          className="op-link"
                          href={l.href.startsWith("/p/") ? `/p/${encodeURIComponent(l.href.slice(3))}` : l.href}
                        >
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
            <h2 className="op-section-title">Creator tools</h2>
            <p className="op-subtle op-text-sm op-mt-6">
              Add/remove related links. The node validates: links must use <code className="op-code">/p/&lt;poster_id&gt;</code> and the target must be by the same creator.
            </p>

            {(() => {
              const conn = loadCreatorConnection();
              const canEdit = conn && conn.nodeUrl.replace(/\/+$/, "") === poster.creator.home_node.replace(/\/+$/, "");

              if (!conn) {
                return (
                  <div className="op-alert op-alert--info op-mt-12">
                    Connect your creator node on <a className="op-link" href="/connect">/connect</a> to edit links.
                  </div>
                );
              }

              if (!canEdit) {
                return (
                  <div className="op-alert op-alert--info op-mt-12">
                    Youre connected to <code className="op-code">{conn.nodeUrl}</code>, but this posters home node is{" "}
                    <code className="op-code">{poster.creator.home_node}</code>. Connect to the correct node to edit links.
                  </div>
                );
              }

              const saveLinks = async (value: PosterLink[]) => {
                setLinksStatus(null);
                setLinksSaving(true);
                try {
                  const url = `${conn.nodeUrl.replace(/\/+$/, "")}/v1/admin/posters/${encodeURIComponent(poster.poster_id)}/links`;
                  const r = await fetch(url, {
                    method: "PUT",
                    headers: {
                      authorization: `Bearer ${conn.adminToken}`,
                      "content-type": "application/json",
                    },
                    body: JSON.stringify({ links_json: JSON.stringify(value) }),
                  });

                  const json = await r.json().catch(() => ({}));
                  if (!r.ok || !json?.ok) {
                    throw new Error(json?.message || json?.detail || `save failed: ${r.status}`);
                  }

                  setLinksStatus("Saved.");

                  // Re-fetch poster from indexer to update the page view.
                  const pr = await fetch(`${base}/v1/posters/${encodeURIComponent(posterId)}`);
                  if (pr.ok) {
                    const pjson = (await pr.json()) as PosterEntry;
                    setPoster(pjson);
                    const lv = ((pjson.links || []) as PosterLink[]);
                    setLinksValue(lv);
                    setLinksDraft(JSON.stringify(lv, null, 2));
                  }
                } catch (e: any) {
                  setLinksStatus(e?.message || String(e));
                } finally {
                  setLinksSaving(false);
                }
              };

              const addLinkFromPoster = (target: PosterEntry) => {
                const title = target.media.title || target.poster_id;
                const tmdb = target.media.tmdb_id;

                const newLink: PosterLink = {
                  rel: (newLinkRelPreset === "custom" ? (newLinkRelCustom.trim() || "related") : newLinkRelPreset) || "related",
                  href: `/p/${target.poster_id}`,
                  title,
                  media: tmdb ? { type: target.media.type, tmdb_id: tmdb } : { type: target.media.type },
                };

                setLinksValue((prev) => {
                  const exists = prev.some((l) => l.href === newLink.href);
                  const next = exists ? prev : [...prev, newLink];
                  setLinksDraft(JSON.stringify(next, null, 2));
                  return next;
                });
              };

              const updateLinkAt = (idx: number, patch: Partial<PosterLink>) => {
                setLinksValue((prev) => {
                  const next = prev.map((l, i) => (i === idx ? ({ ...l, ...patch } as PosterLink) : l));
                  setLinksDraft(JSON.stringify(next, null, 2));
                  return next;
                });
              };

              const removeLink = (href: string) => {
                setLinksValue((prev) => {
                  const next = prev.filter((l) => l.href !== href);
                  setLinksDraft(JSON.stringify(next, null, 2));
                  return next;
                });
              };

              const runSearch = async () => {
                setLinkSearchError(null);
                setLinkSearchLoading(true);
                try {
                  const u = new URL(`${base}/v1/search`);
                  u.searchParams.set("creator_id", poster.creator.creator_id);
                  u.searchParams.set("limit", "24");
                  if (linkSearchQ.trim()) u.searchParams.set("q", linkSearchQ.trim());

                  const r = await fetch(u.toString());
                  if (!r.ok) throw new Error(`search failed: ${r.status}`);
                  const json = (await r.json()) as SearchResponse;
                  setLinkSearchResults(json.results.filter((x) => x.poster_id !== poster.poster_id));
                } catch (e: any) {
                  setLinkSearchError(e?.message || String(e));
                } finally {
                  setLinkSearchLoading(false);
                }
              };

              return (
                <div className="op-mt-12">
                  <div className="op-row op-row--between">
                    <div className="op-subtle op-text-sm">
                      Current links: <strong>{linksValue.length}</strong>
                    </div>
                    <button className="op-btn" disabled={linksSaving} onClick={() => void saveLinks(linksValue)}>
                      {linksSaving ? "Saving…" : "Save links"}
                    </button>
                  </div>

                  {linksStatus && <div className="op-subtle op-text-sm op-mt-10">{linksStatus}</div>}

                  {linksValue.length === 0 ? (
                    <p className="op-subtle op-mt-12">No links yet.</p>
                  ) : (
                    <div className="op-grid op-mt-10">
                      {linksValue.map((l, idx) => (
                        <div key={`${l.href}-${idx}`} className="op-card op-card--padded">
                          <div className="op-row op-row--between">
                            <div className="op-card-title">Link</div>
                            <button className="op-btn op-btn--subtle" onClick={() => removeLink(l.href)}>
                              Remove
                            </button>
                          </div>

                          <div className="op-subtle op-text-sm op-mt-10">Target</div>
                          <div className="op-text-sm op-mt-6">
                            <code className="op-code">{l.href}</code>
                          </div>

                          <div className="op-subtle op-text-sm op-mt-12">Rel</div>
                          <input
                            className="op-input op-mt-6"
                            value={l.rel}
                            onChange={(e) => updateLinkAt(idx, { rel: e.target.value })}
                            placeholder="related / contains / ..."
                          />

                          <div className="op-subtle op-text-sm op-mt-12">Title override (optional)</div>
                          <input
                            className="op-input op-mt-6"
                            value={l.title || ""}
                            onChange={(e) => updateLinkAt(idx, { title: e.target.value || undefined })}
                            placeholder="e.g. Ted 2 (2015)"
                          />

                          <div className="op-row op-mt-12">
                            <a className="op-link" href={l.href.startsWith("/p/") ? `/p/${encodeURIComponent(l.href.slice(3))}` : l.href}>
                              Open →
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="op-section">
                    <h3 className="op-section-title">Add a link</h3>

                    <div className="op-subtle op-text-sm op-mt-10">Default rel for new links</div>
                    <div className="op-row op-mt-6">
                      <select className="op-input" value={newLinkRelPreset} onChange={(e) => setNewLinkRelPreset(e.target.value)}>
                        <option value="related">related</option>
                        <option value="contains">contains</option>
                        <option value="companion">companion</option>
                        <option value="custom">custom…</option>
                      </select>
                      {newLinkRelPreset === "custom" && (
                        <input
                          className="op-input"
                          placeholder="custom rel"
                          value={newLinkRelCustom}
                          onChange={(e) => setNewLinkRelCustom(e.target.value)}
                        />
                      )}
                    </div>

                    <div className="op-row op-mt-10">
                      <input
                        className="op-input"
                        placeholder="Search your posters (title substring)"
                        value={linkSearchQ}
                        onChange={(e) => setLinkSearchQ(e.target.value)}
                      />
                      <button className="op-btn" disabled={linkSearchLoading} onClick={() => void runSearch()}>
                        {linkSearchLoading ? "Searching…" : "Search"}
                      </button>
                    </div>
                    {linkSearchError && <div className="op-alert op-alert--error op-mt-12">{linkSearchError}</div>}
                    {linkSearchResults.length > 0 && (
                      <div className="op-grid op-grid--strip op-mt-10">
                        {linkSearchResults.map((r) => (
                          <div key={r.poster_id} className="op-card">
                            <button
                              className="op-link"
                              style={{ width: "100%", textAlign: "left" }}
                              onClick={() => addLinkFromPoster(r)}
                              title="Add link"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img className="op-img" src={r.assets.preview.url} alt={r.media.title || r.poster_id} />
                            </button>
                            <div className="op-poster-meta">
                              <div className="op-poster-title">{r.media.title || "(untitled)"}</div>
                              <div className="op-subtle op-text-sm">
                                <span className="op-badge">{r.media.type}</span>
                                {r.media.tmdb_id !== undefined && r.media.tmdb_id !== null && (
                                  <span className="op-badge">TMDB {r.media.tmdb_id}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="op-section">
                    <button className="op-btn op-btn--subtle" onClick={() => setLinksAdvanced((v) => !v)}>
                      {linksAdvanced ? "Hide advanced JSON" : "Show advanced JSON"}
                    </button>

                    {linksAdvanced && (
                      <div className="op-mt-12">
                        <textarea
                          className="op-input"
                          style={{ minHeight: 180, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
                          value={linksDraft}
                          onChange={(e) => setLinksDraft(e.target.value)}
                        />
                        <div className="op-row op-mt-10">
                          <button
                            className="op-btn op-btn--subtle"
                            onClick={() => {
                              try {
                                const parsed = JSON.parse(linksDraft);
                                if (!Array.isArray(parsed)) throw new Error("links_json must be a JSON array");
                                setLinksValue(parsed as PosterLink[]);
                                setLinksStatus("Draft applied (not saved yet).");
                              } catch (e: any) {
                                setLinksStatus(e?.message || String(e));
                              }
                            }}
                          >
                            Apply JSON draft
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

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
