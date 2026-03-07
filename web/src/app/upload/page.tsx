"use client";

import { useMemo, useState } from "react";

import { loadCreatorConnection } from "@/lib/storage";

export default function UploadPage() {
  const conn = loadCreatorConnection();

  const baseUrl = useMemo(() => conn?.nodeUrl?.replace(/\/+$/, "") || "", [conn]);

  const [tmdbId, setTmdbId] = useState("2316");
  const [mediaType, setMediaType] = useState("show");
  const [title, setTitle] = useState("The Office");
  const [year, setYear] = useState("2005");
  const [creatorId, setCreatorId] = useState("cr_creator_a");
  const [creatorName, setCreatorName] = useState("Creator A");
  const [redistribution, setRedistribution] = useState("mirrors-approved");
  const [license, setLicense] = useState("all-rights-reserved");

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
    fd.set("title", title);
    fd.set("year", year);
    fd.set("creator_id", creatorId);
    fd.set("creator_display_name", creatorName);
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

    setStatus(`Uploaded: ${JSON.stringify(json)}`);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Upload poster</h1>
      <p style={{ opacity: 0.8 }}>
        Uploads to your connected node’s <code>/v1/admin/posters</code> endpoint.
      </p>

      {!conn ? (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #333", borderRadius: 10 }}>
          Not connected. Go to <a href="/connect">/connect</a> first.
        </div>
      ) : (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #333", borderRadius: 10 }}>
          Connected node: <code>{baseUrl}</code>
        </div>
      )}

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>TMDB id</div>
            <input value={tmdbId} onChange={(e) => setTmdbId(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #333" }} />
          </label>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Media type</div>
            <select value={mediaType} onChange={(e) => setMediaType(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #333" }}>
              {[
                "movie",
                "show",
                "season",
                "episode",
                "collection",
              ].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Title</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #333", width: "100%" }} />
          </label>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Year</div>
            <input value={year} onChange={(e) => setYear(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #333" }} />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Creator id</div>
            <input value={creatorId} onChange={(e) => setCreatorId(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #333" }} />
          </label>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Creator name</div>
            <input value={creatorName} onChange={(e) => setCreatorName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #333" }} />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Redistribution</div>
            <select value={redistribution} onChange={(e) => setRedistribution(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #333" }}>
              {["public-cache-ok", "mirrors-approved", "none"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>License</div>
            <input value={license} onChange={(e) => setLicense(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #333" }} />
          </label>
        </div>

        <label>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Preview file (jpg/png)</div>
          <input type="file" accept="image/jpeg,image/png" onChange={(e) => setPreviewFile(e.target.files?.[0] || null)} />
        </label>

        <label>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Full file (jpg/png)</div>
          <input type="file" accept="image/jpeg,image/png" onChange={(e) => setFullFile(e.target.files?.[0] || null)} />
        </label>

        <button onClick={() => void upload()} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #333", width: 140 }}>
          Upload
        </button>

        {status && (
          <pre style={{ marginTop: 8, padding: 12, border: "1px solid #333", borderRadius: 10, whiteSpace: "pre-wrap" }}>
            {status}
          </pre>
        )}
      </div>
    </div>
  );
}
