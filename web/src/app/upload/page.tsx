"use client";

import { useMemo, useState } from "react";

import { loadCreatorConnection } from "@/lib/storage";

export default function UploadPage() {
  const conn = loadCreatorConnection();

  const baseUrl = useMemo(() => conn?.nodeUrl?.replace(/\/+$/, "") || "", [conn]);

  const [tmdbId, setTmdbId] = useState("2316");
  const [mediaType, setMediaType] = useState("show");
  const [showTmdbId, setShowTmdbId] = useState("");
  const [seasonNumber, setSeasonNumber] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState("");
  const [title, setTitle] = useState("The Office");
  const [year, setYear] = useState("2005");
  const [creatorId, setCreatorId] = useState("cr_creator_a");
  const [creatorName, setCreatorName] = useState("Creator A");
  const [redistribution, setRedistribution] = useState("mirrors-approved");
  const [license, setLicense] = useState("all-rights-reserved");
  const [linksJson, setLinksJson] = useState("");

  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [fullFile, setFullFile] = useState<File | null>(null);

  const [status, setStatus] = useState<string | null>(null);

  async function upload() {
    if (!conn) {
      setStatus("Not connected. Go to /connect first.");
      return;
    }
    if (!previewFile || !fullFile) {
      setStatus("Select preview and full files.");
      return;
    }

    setStatus("Uploading...");

    const fd = new FormData();
    fd.set("tmdb_id", tmdbId);
    fd.set("media_type", mediaType);
    if (showTmdbId.trim() !== "") fd.set("show_tmdb_id", showTmdbId.trim());
    if (seasonNumber.trim() !== "") fd.set("season_number", seasonNumber.trim());
    if (episodeNumber.trim() !== "") fd.set("episode_number", episodeNumber.trim());
    fd.set("title", title);
    fd.set("year", year);
    fd.set("creator_id", creatorId);
    fd.set("creator_display_name", creatorName);
    if (linksJson.trim() !== "") fd.set("links_json", linksJson.trim());
    fd.set("attribution_redistribution", redistribution);
    fd.set("attribution_license", license);
    fd.set("preview", previewFile);
    fd.set("full", fullFile);

    const r = await fetch(baseUrl + "/v1/admin/posters", {
      method: "POST",
      headers: { authorization: `Bearer ${conn.adminToken}` },
      body: fd,
    });

    const json = await r.json().catch(() => null);
    if (!r.ok) {
      setStatus(`Upload failed: ${r.status} ${JSON.stringify(json)}`);
      return;
    }

    setStatus("Uploaded. Redirecting to My library...");
    setTimeout(() => {
      window.location.href = "/library?check=1";
    }, 400);
  }

  return (
    <div className="op-container op-container--narrow">
      <h1 className="op-title-lg">Upload poster</h1>
      <p className="op-subtle op-mt-6">
        Uploads to your connected node’s <code className="op-code">/v1/admin/posters</code> endpoint.
      </p>
      <p className="op-subtle op-mt-8">
        After upload, you’ll be redirected to <a className="op-link" href="/library">My library</a>.
      </p>

      {!conn ? (
        <div className="op-card op-card--padded op-mt-16">
          Not connected. Go to <a className="op-link" href="/connect">/connect</a> first.
        </div>
      ) : (
        <div className="op-card op-card--padded op-mt-16">
          Connected node: <code className="op-code">{baseUrl}</code>
        </div>
      )}

      <div className="op-section op-stack">
        <div className="op-form-grid-2">
          <label className="op-label">
            <div className="op-label-hint">TMDB id</div>
            <input className="op-input" value={tmdbId} onChange={(e) => setTmdbId(e.target.value)} />
          </label>
          <label className="op-label">
            <div className="op-label-hint">Media type</div>
            <select className="op-select" value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
              {["movie", "show", "season", "episode", "collection"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="op-form-grid-2">
          <label className="op-label">
            <div className="op-label-hint">Show TMDB id (for season/episode)</div>
            <input className="op-input" value={showTmdbId} onChange={(e) => setShowTmdbId(e.target.value)} placeholder="required for season/episode" />
          </label>
          <div className="op-form-grid-2">
            <label className="op-label">
              <div className="op-label-hint">Season #</div>
              <input className="op-input" value={seasonNumber} onChange={(e) => setSeasonNumber(e.target.value)} placeholder="optional" />
            </label>
            <label className="op-label">
              <div className="op-label-hint">Episode #</div>
              <input className="op-input" value={episodeNumber} onChange={(e) => setEpisodeNumber(e.target.value)} placeholder="optional" />
            </label>
          </div>
        </div>

        <div className="op-form-grid-title-year">
          <label className="op-label">
            <div className="op-label-hint">Title</div>
            <input className="op-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="op-label">
            <div className="op-label-hint">Year</div>
            <input className="op-input" value={year} onChange={(e) => setYear(e.target.value)} />
          </label>
        </div>

        <div className="op-form-grid-2">
          <label className="op-label">
            <div className="op-label-hint">Creator id</div>
            <input className="op-input" value={creatorId} onChange={(e) => setCreatorId(e.target.value)} />
          </label>
          <label className="op-label">
            <div className="op-label-hint">Creator name</div>
            <input className="op-input" value={creatorName} onChange={(e) => setCreatorName(e.target.value)} />
          </label>
        </div>

        <div className="op-form-grid-2">
          <label className="op-label">
            <div className="op-label-hint">Redistribution</div>
            <select className="op-select" value={redistribution} onChange={(e) => setRedistribution(e.target.value)}>
              {["public-cache-ok", "mirrors-approved", "none"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="op-label">
            <div className="op-label-hint">License</div>
            <input className="op-input" value={license} onChange={(e) => setLicense(e.target.value)} />
          </label>
        </div>

        <label className="op-label">
          <div className="op-label-hint">Related links (JSON array, optional)</div>
          <textarea
            className="op-input"
            value={linksJson}
            onChange={(e) => setLinksJson(e.target.value)}
            placeholder='e.g. [{"rel":"related","href":"/p/<other_poster_id>","title":"Related artwork"}]'
            rows={3}
          />
          <div className="op-subtle op-text-sm op-mt-6">
            Links are stored with the poster metadata.
          </div>
        </label>

        <label className="op-label">
          <div className="op-label-hint">Preview file (jpg/png)</div>
          <input type="file" accept="image/jpeg,image/png" onChange={(e) => setPreviewFile(e.target.files?.[0] || null)} />
        </label>

        <label className="op-label">
          <div className="op-label-hint">Full file (jpg/png)</div>
          <input type="file" accept="image/jpeg,image/png" onChange={(e) => setFullFile(e.target.files?.[0] || null)} />
        </label>

        <button className="op-btn" onClick={() => void upload()}>
          Upload
        </button>

        {status && (
          <pre className="op-card op-card--padded op-pre op-mt-8">{status}</pre>
        )}
      </div>
    </div>
  );
}
