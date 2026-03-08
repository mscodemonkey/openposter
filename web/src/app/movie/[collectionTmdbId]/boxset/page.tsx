"use client";

import { use, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import CardMedia from "@mui/material/CardMedia";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { INDEXER_BASE_URL } from "@/lib/config";
import RelatedArtworkSection from "@/components/RelatedArtworkSection";
import type { PosterEntry, SearchResponse } from "@/lib/types";

type PosterImg = { src: string; title: string };

function PosterCard({
  poster,
  primaryActionLabel,
  primaryActionHref,
  showPosterLink,
}: {
  poster: PosterEntry;
  primaryActionLabel?: string;
  primaryActionHref?: string;
  showPosterLink?: boolean;
}) {
  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardMedia
        component="img"
        image={poster.assets.preview.url}
        alt={poster.media.title || poster.poster_id}
        sx={{ aspectRatio: "2 / 3", objectFit: "contain" }}
      />
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography sx={{ fontWeight: 800 }} noWrap>
          {poster.media.title || "(untitled)"}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {poster.creator.display_name}
        </Typography>
      </CardContent>
      <CardActions sx={{ px: 2 }}>
        {primaryActionHref && (
          <Button
            variant="text"
            size="small"
            href={primaryActionHref}
            target={primaryActionHref.startsWith("/") ? undefined : "_blank"}
            rel={primaryActionHref.startsWith("/") ? undefined : "noreferrer"}
            sx={{ pl: 0, minWidth: 0 }}
          >
            {primaryActionLabel || "VIEW"}
          </Button>
        )}
        {showPosterLink && (
          <Button
            component={Link}
            variant="text"
            size="small"
            href={`/p/${encodeURIComponent(poster.poster_id)}`}
            sx={{ minWidth: 0 }}
          >
            POSTER
          </Button>
        )}
      </CardActions>
    </Card>
  );
}

function PosterGrid({
  items,
  primaryAction,
  showPosterLink,
}: {
  items: PosterEntry[];
  primaryAction?: (p: PosterEntry) => { label: string; href: string } | null;
  showPosterLink?: boolean;
}) {
  return (
    <Grid container spacing={2}>
      {items.map((p) => {
        const act = primaryAction ? primaryAction(p) : null;
        return (
          <Grid key={p.poster_id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
            <PosterCard
              poster={p}
              primaryActionLabel={act?.label}
              primaryActionHref={act?.href}
              showPosterLink={showPosterLink}
            />
          </Grid>
        );
      })}
    </Grid>
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
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={2}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                ted
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                MOVIE COLLECTION | willtong93
              </Typography>
            </Box>

            <Button component={Link} variant="text" href="/tv/201834/boxset" sx={{ minWidth: 0 }}>
              Back to TV box set →
            </Button>
          </Stack>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Related artwork
          </Typography>
          <Box sx={{ mt: 1.5 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                  <CardMedia
                    component="img"
                    image="/demo/ted-boxset/c4ae91b4-a5ee-404d-a65d-9d42f81f64b0.jpg"
                    alt="ted (2024) TV Box Set"
                    sx={{ aspectRatio: "2 / 3", objectFit: "contain" }}
                  />
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography sx={{ fontWeight: 800 }} noWrap>
                      ted (2024) TV Box Set
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ px: 2 }}>
                    <Button component={Link} variant="text" size="small" href="/tv/201834/boxset" sx={{ pl: 0, minWidth: 0 }}>
                      BOX SET
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            </Grid>
          </Box>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Movie box set posters
          </Typography>
          <Box sx={{ mt: 1.5 }}>
            <Grid container spacing={2}>
              {boxsetPosters.map((p) => (
                <Grid key={p.src} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                  <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <CardMedia
                      component="img"
                      image={p.src}
                      alt={p.title}
                      sx={{ aspectRatio: "2 / 3", objectFit: "contain" }}
                    />
                    <CardActions sx={{ px: 2 }}>
                      <Button variant="text" size="small" href={p.src} target="_blank" rel="noreferrer" sx={{ pl: 0, minWidth: 0 }}>
                        VIEW
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        </Box>
      </Stack>
    </Container>
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
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [base, collectionTmdbId]);

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography color="error">{error}</Typography>
      </Container>
    );
  }

  // If not found or not linked yet, fall back to demo.
  if (!collection) return <TedMovieBoxSetDemo />;

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {(() => {
              const t = collection.media.title || "Movie Collection";
              // UX: don't repeat "collection"/"box set" in the title line
              return (
                t.replace(/\s+collection\s*$/i, "")
                  .replace(/\s+box\s*set\s*$/i, "")
                  .trim() || t
              );
            })()}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            MOVIE BOX SET | {collection.creator.display_name}
          </Typography>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Box set poster
          </Typography>
          <Box sx={{ mt: 1.5 }}>
            <PosterGrid
              items={[collection]}
              primaryAction={(p) => ({ label: "POSTER", href: `/p/${encodeURIComponent(p.poster_id)}` })}
            />
          </Box>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Movies
          </Typography>
          <Box sx={{ mt: 1.5 }}>
            {movies.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No movies linked yet.
              </Typography>
            ) : (
              <PosterGrid
                items={movies}
                primaryAction={(p) => ({ label: "POSTER", href: `/p/${encodeURIComponent(p.poster_id)}` })}
              />
            )}
          </Box>
        </Box>

        <RelatedArtworkSection base={base} links={collection.links || null} />
      </Stack>
    </Container>
  );
}

export default function MovieBoxsetPage({
  params,
}: {
  params: Promise<{ collectionTmdbId: string }>;
}) {
  const { collectionTmdbId } = use(params);

  return <MovieBoxsetReal collectionTmdbId={collectionTmdbId} />;
}
