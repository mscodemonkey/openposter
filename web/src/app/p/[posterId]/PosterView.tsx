"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import RelatedArtworkSection from "@/components/RelatedArtworkSection";
import PosterCard from "@/components/PosterCard";
import { INDEXER_BASE_URL } from "@/lib/config";
import { loadCreatorConnection } from "@/lib/storage";
import type { PosterEntry, SearchResponse } from "@/lib/types";

type PosterLink = NonNullable<PosterEntry["links"]>[number];

type PosterAttribution = {
  license?: string;
  redistribution?: string;
  source_url?: string;
};

function useMediaTypeLabel() {
  const t = useTranslations("poster");
  return (mediaType: string): string => {
    if (mediaType === "show") return t("tvShow");
    if (mediaType === "season") return t("tvSeason");
    if (mediaType === "episode") return t("tvEpisode");
    if (mediaType === "collection") return t("movieCollection");
    if (mediaType === "movie") return t("movie");
    return t("posterLabel");
  };
}

function useSimilarConfig() {
  const t = useTranslations("poster");
  type SimilarConfig = {
    title: string;
    aspectRatio: string;
    cardWidth: number;
    getHref: (p: PosterEntry) => string;
    actionLabel: string;
  };

  return (poster: PosterEntry): SimilarConfig | null => {
    const mediaType = poster.media.type;
    if (mediaType === "episode") {
      return {
        title: t("alsoThisSeason"),
        aspectRatio: "16 / 9",
        cardWidth: 280,
        getHref: (p) => `/p/${encodeURIComponent(p.poster_id)}`,
        actionLabel: "DETAILS",
      };
    }
    if (mediaType === "movie") {
      return {
        title: t("otherPostersMovie"),
        aspectRatio: "2 / 3",
        cardWidth: 160,
        getHref: (p) => `/p/${encodeURIComponent(p.poster_id)}`,
        actionLabel: "POSTER",
      };
    }
    if (mediaType === "show") {
      return {
        title: t("otherPostersShow"),
        aspectRatio: "2 / 3",
        cardWidth: 160,
        getHref: (p) =>
          p.media.tmdb_id != null ? `/tv/${p.media.tmdb_id}/boxset` : `/p/${encodeURIComponent(p.poster_id)}`,
        actionLabel: "BOX SET",
      };
    }
    if (mediaType === "season") {
      return {
        title: t("otherPostersSeason"),
        aspectRatio: "2 / 3",
        cardWidth: 160,
        getHref: (p) =>
          p.media.show_tmdb_id != null ? `/tv/${p.media.show_tmdb_id}/boxset` : `/p/${encodeURIComponent(p.poster_id)}`,
        actionLabel: "BOX SET",
      };
    }
    return null;
  };
}

function SimilarSection({ poster, items }: { poster: PosterEntry; items: PosterEntry[] }) {
  const getConfig = useSimilarConfig();
  const config = getConfig(poster);
  if (!config || items.length === 0) return null;

  const sorted =
    poster.media.type === "episode"
      ? [...items].sort((a, b) => (a.media.episode_number ?? 0) - (b.media.episode_number ?? 0))
      : items;

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>
        {config.title}
      </Typography>
      <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pt: 1.5 }}>
        {sorted.map((p) => (
          <Box
            key={p.poster_id}
            sx={{ minWidth: config.cardWidth, maxWidth: config.cardWidth, flex: "0 0 auto" }}
          >
            <PosterCard
              poster={p}
              aspectRatio={config.aspectRatio}
              showCreator
              hideBoxSetLink={poster.media.type === "episode"}
              actions={[{ label: config.actionLabel, href: config.getHref(p) }]}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export type PosterViewProps = {
  poster: PosterEntry;
  tvShowTitle: string | null;
  backdropUrl: string | null;
  similarByTmdb: PosterEntry[];
  moreByCreator: PosterEntry[];
};

export default function PosterView({
  poster,
  tvShowTitle,
  backdropUrl,
  similarByTmdb,
  moreByCreator,
}: PosterViewProps) {
  const t = useTranslations("poster");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const tr = useTranslations("relatedArtwork");
  const mediaTypeLabel = useMediaTypeLabel();
  const base = INDEXER_BASE_URL.replace(/\/+$/, "");

  const relatedArtworkTitle = (() => {
    const title = poster.media.title ?? "";
    if (poster.media.type === "movie" || poster.media.type === "show" || poster.media.type === "collection")
      return tr("otherPostersFor", { title });
    return tr("title");
  })();

  const [linksValue, setLinksValue] = useState<PosterLink[]>((poster.links || []) as PosterLink[]);
  const [linksDraft, setLinksDraft] = useState<string>(JSON.stringify(poster.links || [], null, 2));
  const [linksAdvanced, setLinksAdvanced] = useState<boolean>(false);
  const [linksStatus, setLinksStatus] = useState<string | null>(null);
  const [linksSaving, setLinksSaving] = useState<boolean>(false);

  const [linkSearchQ, setLinkSearchQ] = useState<string>("");
  const [linkSearchLoading, setLinkSearchLoading] = useState<boolean>(false);
  const [linkSearchResults, setLinkSearchResults] = useState<PosterEntry[]>([]);
  const [linkSearchError, setLinkSearchError] = useState<string | null>(null);

  const [newLinkRelPreset, setNewLinkRelPreset] = useState<string>("related");
  const [newLinkRelCustom, setNewLinkRelCustom] = useState<string>("");

  async function saveLinks() {
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
      setLinksStatus(t("linksSaved"));
    } finally {
      setLinksSaving(false);
    }
  }

  async function searchForLinkTargets() {
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

  const attribution = (poster as unknown as { attribution?: PosterAttribution }).attribution;
  const isLandscape = (p: PosterEntry) => p.media.type === "episode" || p.media.type === "backdrop";
  const portrait = moreByCreator.filter((p) => !isLandscape(p));
  const landscape = moreByCreator.filter(isLandscape);

  return (
    <>
      {backdropUrl && (
        <Box
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: "60vh",
            zIndex: 0,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <Box
            component="img"
            src={backdropUrl}
            alt=""
            sx={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", opacity: 0.4 }}
          />
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              background: (theme) =>
                `linear-gradient(to bottom, transparent 40%, ${theme.palette.background.default} 95%)`,
            }}
          />
        </Box>
      )}
      <Container maxWidth="lg" sx={{ py: 3, position: "relative", zIndex: 1 }}>
        <Stack spacing={2.5}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between" alignItems={{ sm: "flex-end" }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h4" sx={{ fontWeight: 900 }} noWrap>
                {poster.media.type === "episode" || poster.media.type === "season"
                  ? `${tvShowTitle ?? poster.media.title ?? "\u2026"}${poster.media.year ? ` (${poster.media.year})` : ""}`
                  : `${poster.media.title || t("posterLabel")}${poster.media.type !== "collection" && poster.media.year ? ` (${poster.media.year})` : ""}`}
              </Typography>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {poster.media.type === "episode"
                  ? [
                      poster.media.season_number != null
                        ? `Season ${String(poster.media.season_number).padStart(2, "0")}`
                        : null,
                      poster.media.episode_number != null
                        ? `Episode ${String(poster.media.episode_number).padStart(2, "0")}`
                        : null,
                      poster.media.title && poster.media.title !== tvShowTitle ? poster.media.title : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : poster.media.type === "season"
                  ? [
                      poster.media.season_number != null
                        ? `Season ${String(poster.media.season_number).padStart(2, "0")}`
                        : "Season",
                      poster.media.title && poster.media.title !== tvShowTitle ? poster.media.title : null,
                    ].filter(Boolean).join(" · ")

                  : poster.media.type === "collection"
                  ? t("movieBoxSet")
                  : poster.media.type === "show"
                  ? t("tvShow").toUpperCase()
                  : poster.media.type === "backdrop"
                  ? poster.media.show_tmdb_id != null
                    ? poster.media.season_number != null
                      ? t("backdropForSeason", { season: String(poster.media.season_number).padStart(2, "0") })
                      : t("backdropForShow")
                    : t("backdropForMovie")
                  : `${mediaTypeLabel(poster.media.type)} · ${poster.creator.display_name}`}
              </Typography>
            </Box>

            <Button component={Link} href="/browse" variant="outlined">
              {t("backToPosters")}
            </Button>
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="flex-start">
            <Box sx={{ width: { xs: "100%", md: "41.67%" }, flexShrink: 0 }}>
              <PosterCard
                poster={poster}

                showCreator={false}
                aspectRatio={poster.media.type === "episode" || poster.media.type === "backdrop" ? "16 / 9" : "2 / 3"}
                actions={[{ label: tc("openFull"), href: poster.assets.full.url, external: true }]}
              />
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Paper sx={{ p: 2.5 }}>
                <Stack spacing={2}>
                  <Stack spacing={1}>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>
                      {t("tmdbIdLabel")}
                    </Typography>
                    <Typography>
                      {poster.media.tmdb_id != null ? (
                        <MuiLink
                          href={
                            poster.media.type === "movie"
                              ? `https://www.themoviedb.org/movie/${poster.media.tmdb_id}`
                              : poster.media.type === "collection"
                              ? `https://www.themoviedb.org/collection/${poster.media.tmdb_id}`
                              : poster.media.type === "episode"
                              ? `https://www.themoviedb.org/tv/${poster.media.show_tmdb_id ?? poster.media.tmdb_id}`
                              : `https://www.themoviedb.org/tv/${poster.media.tmdb_id}`
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          {poster.media.type === "episode"
                            ? (poster.media.show_tmdb_id ?? poster.media.tmdb_id)
                            : poster.media.tmdb_id}
                        </MuiLink>
                      ) : "-"}
                    </Typography>

                    <Typography variant="body2" sx={{ fontWeight: 800, mt: 1 }}>
                      {t("creatorLabel")}
                    </Typography>
                    <Typography>
                      <MuiLink component={Link} href={`/creator/${encodeURIComponent(poster.creator.creator_id)}`}>
                        {poster.creator.display_name}
                      </MuiLink>
                    </Typography>

                    <Typography variant="body2" sx={{ fontWeight: 800, mt: 1 }}>
                      {t("artworkIdLabel")}
                    </Typography>
                    <Typography variant="body2" sx={{ wordBreak: "break-all", fontFamily: "monospace" }}>
                      {poster.poster_id}
                    </Typography>
                  </Stack>

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button href={poster.assets.full.url} target="_blank" rel="noreferrer">
                      {tc("downloadFull")}
                    </Button>
                    <Button variant="outlined" href={poster.assets.preview.url} target="_blank" rel="noreferrer">
                      {tc("openPreview")}
                    </Button>
                  </Stack>

                  <Divider />

                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 800 }}>
                      {t("attribution")}
                    </Typography>
                    <Stack spacing={0.75} sx={{ mt: 1 }}>
                      <Typography variant="body2">
                        <strong>{t("licenseLabel")}</strong> {attribution?.license || "-"}
                      </Typography>
                      <Typography variant="body2">
                        <strong>{t("redistributionLabel")}</strong> {attribution?.redistribution || "-"}
                      </Typography>
                      <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                        <strong>{t("sourceLabel")}</strong>{" "}
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
            </Box>
          </Stack>

          <RelatedArtworkSection base={base} links={poster.links || null} title={relatedArtworkTitle} />

          <SimilarSection poster={poster} items={similarByTmdb} />

          {moreByCreator.length > 0 && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {t("moreByCreator")}
              </Typography>
              {portrait.length > 0 && (
                <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pt: 1.5 }}>
                  {portrait.map((p) => (
                    <Box key={p.poster_id} sx={{ minWidth: 160, maxWidth: 160, flex: "0 0 auto" }}>
                      <PosterCard
                        poster={p}
                        showCreator={false}
                        actions={[{ label: "DETAILS", href: `/p/${encodeURIComponent(p.poster_id)}` }]}
                      />
                    </Box>
                  ))}
                </Box>
              )}
              {landscape.length > 0 && (
                <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pt: 1.5 }}>
                  {landscape.map((p) => (
                    <Box key={p.poster_id} sx={{ minWidth: 256, maxWidth: 256, flex: "0 0 auto" }}>
                      <PosterCard
                        poster={p}
                        showCreator={false}
                        aspectRatio="16 / 9"
                        hideBoxSetLink
                        actions={[{ label: "DETAILS", href: `/p/${encodeURIComponent(p.poster_id)}` }]}
                      />
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {/* Creator tools */}
          <Paper sx={{ p: 2.5 }}>
            <Stack spacing={1.5}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {t("creatorTools")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("creatorToolsDesc")}
              </Typography>

              {(() => {
                const conn = loadCreatorConnection();
                const canEdit =
                  conn &&
                  conn.nodeUrl.replace(/\/+$/, "") === poster.creator.home_node.replace(/\/+$/, "");

                if (!conn) {
                  return (
                    <Alert severity="info">
                      {t("connectNodeHint")} <Link href="/settings">{tn("settings")}</Link>.
                    </Alert>
                  );
                }

                if (!canEdit) {
                  return (
                    <Alert severity="info">
                      {t("wrongNode", { connectedNode: conn.nodeUrl, homeNode: poster.creator.home_node })}
                    </Alert>
                  );
                }

                return (
                  <Stack spacing={2}>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                      <TextField
                        label={t("searchYourPosters")}
                        value={linkSearchQ}
                        onChange={(e) => setLinkSearchQ(e.target.value)}
                        fullWidth
                      />
                      <Button
                        variant="outlined"
                        disabled={linkSearchLoading}
                        onClick={() => void searchForLinkTargets()}
                      >
                        {linkSearchLoading ? t("searching") : tc("search")}
                      </Button>
                    </Stack>

                    {linkSearchError && <Alert severity="error">{linkSearchError}</Alert>}

                    {linkSearchResults.length > 0 && (
                      <Paper variant="outlined" sx={{ p: 1.5 }}>
                        <Stack spacing={1}>
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>
                            {t("addALink")}
                          </Typography>

                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                            <TextField
                              select
                              label={t("relation")}
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
                              label={t("customRelation")}
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
                                  {tc("add")}
                                </Button>
                              </Stack>
                            ))}
                          </Stack>
                        </Stack>
                      </Paper>
                    )}

                    <TextField
                      label={t("linksAdvanced")}
                      value={linksDraft}
                      onChange={(e) => setLinksDraft(e.target.value)}
                      multiline
                      minRows={8}
                      helperText={t("linksHelperText")}
                    />

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <Button
                        onClick={() =>
                          void saveLinks().catch((e: unknown) =>
                            setLinksStatus(e instanceof Error ? e.message : String(e))
                          )
                        }
                        disabled={linksSaving}
                      >
                        {linksSaving ? t("savingLinks") : t("saveLinks")}
                      </Button>
                      <Button variant="outlined" onClick={() => setLinksAdvanced((v) => !v)}>
                        {linksAdvanced ? t("hideExtraTools") : t("showExtraTools")}
                      </Button>
                    </Stack>

                    {linksStatus && (
                      <Alert severity={linksStatus === t("linksSaved") ? "success" : "info"}>
                        {linksStatus}
                      </Alert>
                    )}
                  </Stack>
                );
              })()}
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </>
  );
}
