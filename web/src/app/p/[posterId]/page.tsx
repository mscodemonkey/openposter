"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardMedia from "@mui/material/CardMedia";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/GridLegacy";

import RelatedArtworkSection from "@/components/RelatedArtworkSection";
import { INDEXER_BASE_URL } from "@/lib/config";
import { loadCreatorConnection } from "@/lib/storage";
import type { PosterEntry, SearchResponse } from "@/lib/types";

type PosterLink = NonNullable<PosterEntry["links"]>[number];

type PosterAttribution = {
  license?: string;
  redistribution?: string;
  source_url?: string;
};

function mediaTypeLabel(t: string): string {
  if (t === "show") return "TV Show";
  if (t === "season") return "TV Season";
  if (t === "episode") return "TV Episode";
  if (t === "collection") return "Movie Collection";
  if (t === "movie") return "Movie";
  return "Poster";
}

function PosterStrip({ items, title }: { items: PosterEntry[]; title: string }) {
  if (!items || items.length === 0) return null;

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>
        {title}
      </Typography>
      <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pt: 1.5 }}>
        {items.map((r) => (
          <Card
            key={r.poster_id}
            variant="outlined"
            sx={{ minWidth: 200, maxWidth: 200, flex: "0 0 auto", border: 0, bgcolor: "transparent" }}
          >
            <Link href={`/p/${encodeURIComponent(r.poster_id)}`} style={{ textDecoration: "none" }}>
              <CardMedia
                component="img"
                height={280}
                image={r.assets.preview.url}
                alt={r.media.title || r.poster_id}
                sx={{ objectFit: "cover", borderRadius: 1 }}
              />
            </Link>
            <CardContent sx={{ px: 0, py: 1.5 }}>
              <Typography sx={{ fontWeight: 800 }} noWrap>
                {r.media.title || "(untitled)"}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {r.creator.display_name}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}

export default function PosterPage({ params }: { params: Promise<{ posterId: string }> }) {
  const { posterId } = use(params);
  const decodedPosterId = useMemo(() => {
    try {
      return decodeURIComponent(posterId);
    } catch {
      return posterId;
    }
  }, [posterId]);

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
        setError(null);
        const r = await fetch(`${base}/v1/posters/${encodeURIComponent(decodedPosterId)}`);
        if (r.status === 404) {
          setPoster(null);
          setError("Not found");
          return;
        }
        if (!r.ok) throw new Error(`poster failed: ${r.status}`);
        const p = (await r.json()) as PosterEntry;
        setPoster(p);

        const lv = (p.links || []) as PosterLink[];
        setLinksValue(lv);
        setLinksDraft(JSON.stringify(lv, null, 2));

        setSimilarByTmdb([]);
        setMoreByCreator([]);

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
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [base, decodedPosterId]);

  async function saveLinks() {
    if (!poster) return;
    const conn = loadCreatorConnection();
    if (!conn) throw new Error("Not connected to a node");

    const baseUrl = conn.nodeUrl.replace(/\/+$/, "");
    const token = conn.adminToken;

    setLinksSaving(true);
    setLinksStatus(null);
    try {
      const parsed = JSON.parse(linksDraft) as PosterLink[];
      const r = await fetch(`${baseUrl}/v1/admin/posters/${encodeURIComponent(poster.poster_id)}/links`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ links: parsed }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as unknown;
        const msg = (j as { error?: { message?: string } } | null)?.error?.message;
        throw new Error(msg || `save failed: ${r.status}`);
      }

      setLinksValue(parsed);
      setLinksStatus("Saved.");
    } finally {
      setLinksSaving(false);
    }
  }

  async function searchForLinkTargets() {
    if (!poster) return;
    setLinkSearchLoading(true);
    setLinkSearchError(null);
    setLinkSearchResults([]);
    try {
      const u = new URL(`${base}/v1/search`);
      u.searchParams.set("limit", "20");
      u.searchParams.set("creator_id", poster.creator.creator_id);
      if (linkSearchQ.trim()) u.searchParams.set("q", linkSearchQ.trim());
      const r = await fetch(u.toString());
      if (!r.ok) throw new Error(`search failed: ${r.status}`);
      const json = (await r.json()) as SearchResponse;
      setLinkSearchResults(json.results.filter((x) => x.poster_id !== poster.poster_id));
    } catch (e: unknown) {
      setLinkSearchError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinkSearchLoading(false);
    }
  }

  function addLink(targetPosterId: string) {
    const rel = (newLinkRelCustom.trim() || newLinkRelPreset).trim();
    const next = [...(linksValue || [])];
    next.push({ rel, href: `/p/${targetPosterId}` });
    setLinksValue(next);
    setLinksDraft(JSON.stringify(next, null, 2));
  }

  const attribution = poster ? (poster as unknown as { attribution?: PosterAttribution }).attribution : undefined;

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between" alignItems={{ sm: "flex-end" }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" sx={{ fontWeight: 900 }} noWrap>
              {poster?.media.title || "Poster"}
            </Typography>

            {poster ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {mediaTypeLabel(poster.media.type)} · {poster.creator.display_name}
              </Typography>
            ) : null}

            <Typography variant="caption" color="text.secondary">
              <code>{posterId}</code>
            </Typography>
          </Box>

          <Button component={Link} href="/browse" variant="outlined">
            Back to posters
          </Button>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        {!poster ? (
          <Typography color="text.secondary">Loading…</Typography>
        ) : (
          <>
            <Grid container spacing={2}>
              <Grid item xs={12} md={5}>
                <Card>
                  <a href={poster.assets.full.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                    <CardMedia
                      component="img"
                      image={poster.assets.preview.url}
                      alt={poster.media.title || poster.poster_id}
                      sx={{ maxHeight: 720, objectFit: "cover" }}
                    />
                  </a>
                </Card>
              </Grid>

              <Grid item xs={12} md={7}>
                <Paper sx={{ p: 2.5 }}>
                  <Stack spacing={2}>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Chip label={poster.media.type} />
                      {poster.media.tmdb_id !== undefined && poster.media.tmdb_id !== null ? (
                        <Chip label={`TMDB ${poster.media.tmdb_id}`} variant="outlined" />
                      ) : null}
                    </Stack>

                    <Divider />

                    <Stack spacing={1}>
                      <Typography variant="body2" color="text.secondary">
                        Creator
                      </Typography>
                      <Typography sx={{ fontWeight: 800 }}>
                        <Link href={`/creator/${encodeURIComponent(poster.creator.creator_id)}`}>
                          {poster.creator.display_name}
                        </Link>
                      </Typography>

                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Year
                      </Typography>
                      <Typography>{poster.media.year || "-"}</Typography>

                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Node
                      </Typography>
                      <Typography>
                        <a href={poster.creator.home_node} target="_blank" rel="noreferrer">
                          {poster.creator.home_node}
                        </a>
                      </Typography>
                    </Stack>

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <Button href={poster.assets.full.url} target="_blank" rel="noreferrer">
                        Download full
                      </Button>
                      <Button variant="outlined" href={poster.assets.preview.url} target="_blank" rel="noreferrer">
                        Open preview
                      </Button>
                    </Stack>

                    <Divider />

                    <Box>
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 800 }}>
                        Attribution
                      </Typography>
                      <Stack spacing={0.75} sx={{ mt: 1 }}>
                        <Typography variant="body2">
                          <strong>License:</strong> {attribution?.license || "-"}
                        </Typography>
                        <Typography variant="body2">
                          <strong>Redistribution:</strong> {attribution?.redistribution || "-"}
                        </Typography>
                        <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                          <strong>Source:</strong>{" "}
                          {attribution?.source_url ? (
                            <a href={attribution.source_url} target="_blank" rel="noreferrer">
                              {attribution.source_url}
                            </a>
                          ) : (
                            "-"
                          )}
                        </Typography>
                      </Stack>
                    </Box>
                  </Stack>
                </Paper>
              </Grid>
            </Grid>

            <RelatedArtworkSection base={base} links={poster.links || null} />

            <PosterStrip title="Similar posters" items={similarByTmdb || []} />
            <PosterStrip title="More by this creator" items={moreByCreator || []} />

            {/* Creator tools (still MVP, but at least styled) */}
            <Paper sx={{ p: 2.5 }}>
              <Stack spacing={1.5}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  Creator tools
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Add/remove related links. (MVP rules: links must be <code>/p/&lt;poster_id&gt;</code> and point to
                  posters by the same creator.)
                </Typography>

                {(() => {
                  const conn = loadCreatorConnection();
                  const canEdit =
                    conn &&
                    conn.nodeUrl.replace(/\/+$/, "") === poster.creator.home_node.replace(/\/+$/, "");

                  if (!conn) {
                    return (
                      <Alert severity="info">
                        To edit links, connect your node in <Link href="/settings">Settings</Link>.
                      </Alert>
                    );
                  }

                  if (!canEdit) {
                    return (
                      <Alert severity="info">
                        You’re connected to <code>{conn.nodeUrl}</code>, but this poster’s home node is{" "}
                        <code>{poster.creator.home_node}</code>. Connect to the correct node to edit links.
                      </Alert>
                    );
                  }

                  return (
                    <Stack spacing={2}>
                      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                        <TextField
                          label="Search your posters"
                          value={linkSearchQ}
                          onChange={(e) => setLinkSearchQ(e.target.value)}
                          fullWidth
                        />
                        <Button
                          variant="outlined"
                          disabled={linkSearchLoading}
                          onClick={() => void searchForLinkTargets()}
                        >
                          {linkSearchLoading ? "Searching…" : "Search"}
                        </Button>
                      </Stack>

                      {linkSearchError && <Alert severity="error">{linkSearchError}</Alert>}

                      {linkSearchResults.length > 0 ? (
                        <Paper variant="outlined" sx={{ p: 1.5 }}>
                          <Stack spacing={1}>
                            <Typography variant="body2" sx={{ fontWeight: 800 }}>
                              Add a link
                            </Typography>

                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                              <TextField
                                select
                                label="Relation"
                                value={newLinkRelPreset}
                                onChange={(e) => setNewLinkRelPreset(e.target.value)}
                                SelectProps={{ native: true }}
                                sx={{ minWidth: 180 }}
                              >
                                <option value="related">related</option>
                                <option value="variant">variant</option>
                                <option value="alt">alt</option>
                              </TextField>
                              <TextField
                                label="Custom relation (optional)"
                                value={newLinkRelCustom}
                                onChange={(e) => setNewLinkRelCustom(e.target.value)}
                                fullWidth
                              />
                            </Stack>

                            <Stack spacing={1}>
                              {linkSearchResults.slice(0, 8).map((r) => (
                                <Stack
                                  key={r.poster_id}
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                  justifyContent="space-between"
                                >
                                  <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                                    {r.media.title || r.poster_id}
                                  </Typography>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => addLink(r.poster_id)}
                                  >
                                    Add
                                  </Button>
                                </Stack>
                              ))}
                            </Stack>
                          </Stack>
                        </Paper>
                      ) : null}

                      <TextField
                        label="Links (advanced)"
                        value={linksDraft}
                        onChange={(e) => setLinksDraft(e.target.value)}
                        multiline
                        minRows={8}
                        helperText="JSON array of link objects"
                      />

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <Button
                          onClick={() => void saveLinks().catch((e: unknown) => setLinksStatus(e instanceof Error ? e.message : String(e)))}
                          disabled={linksSaving}
                        >
                          {linksSaving ? "Saving…" : "Save links"}
                        </Button>
                        <Button variant="outlined" onClick={() => setLinksAdvanced((v) => !v)}>
                          {linksAdvanced ? "Hide" : "Show"} extra tools
                        </Button>
                      </Stack>

                      {linksStatus && <Alert severity={linksStatus === "Saved." ? "success" : "info"}>{linksStatus}</Alert>}
                    </Stack>
                  );
                })()}
              </Stack>
            </Paper>
          </>
        )}
      </Stack>
    </Container>
  );
}
