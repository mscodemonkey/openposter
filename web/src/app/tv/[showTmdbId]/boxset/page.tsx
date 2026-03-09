"use client";

import { use, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
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

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

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

function PosterCard({
  image,
  title,
  subtitle,
  actions,
}: {
  image: { url: string; alt: string };
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardMedia
        component="img"
        image={image.url}
        alt={image.alt}
        sx={{ aspectRatio: "2 / 3", objectFit: "contain" }}
      />
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography sx={{ fontWeight: 800 }} noWrap>
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary" noWrap>
            {subtitle}
          </Typography>
        ) : null}
      </CardContent>
      {actions ? <CardActions sx={{ px: 2, justifyContent: "space-between" }}>{actions}</CardActions> : null}
    </Card>
  );
}

function PosterGrid({ items }: { items: PosterEntry[] }) {
  return (
    <Grid container spacing={2}>
      {items.map((p) => (
        <Grid key={p.poster_id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
          <PosterCard
            image={{ url: p.assets.preview.url, alt: p.media.title || p.poster_id }}
            title={p.media.title || "(untitled)"}
            subtitle={p.creator.display_name}
            actions={
              <Box>
                <Button
                  component={Link}
                  variant="text"
                  size="small"
                  href={`/p/${encodeURIComponent(p.poster_id)}`}
                  sx={{ pl: 0, minWidth: 0 }}
                >
                  DETAILS
                </Button>
              </Box>
            }
          />
        </Grid>
      ))}
    </Grid>
  );
}

function EpisodeGrid({ items }: { items: PosterEntry[] }) {
  return (
    <Grid container spacing={2}>
      {items.map((p) => (
        <Grid key={p.poster_id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <Card>
            <CardMedia
              component="img"
              image={p.assets.preview.url}
              alt={p.media.title || p.poster_id}
              sx={{ height: 120, width: "100%", objectFit: "contain" }}
            />
            <CardContent sx={{ py: 1.5 }}>
              <Typography sx={{ fontWeight: 800 }} noWrap>
                {p.media.title || "(untitled)"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
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
  const [expandedSeasons, setExpandedSeasons] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    for (const s of seasonGroups) m[s.season] = s.season === latestSeason;
    return m;
  });

  const sortedSeasonGroups = [...seasonGroups].sort((a, b) => b.season - a.season);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            ted
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            TV SHOW | 2024 | willtong93
          </Typography>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Main show poster
          </Typography>
          <Box sx={{ mt: 1.5 }}>
            <Grid container spacing={2}>
              {main.map((p) => (
                <Grid key={p.src} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                  <Card>
                    <CardMedia component="img" image={p.src} alt={p.title} sx={{ aspectRatio: "2 / 3", objectFit: "contain" }} />
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Season posters
          </Typography>
          <Box sx={{ mt: 1.5 }}>
            <Grid container spacing={2}>
              {seasons.map((p) => (
                <Grid key={p.src} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                  <Card>
                    <CardMedia component="img" image={p.src} alt={p.title} sx={{ aspectRatio: "2 / 3", objectFit: "contain" }} />
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Episode cards
          </Typography>
          <Box sx={{ mt: 1.5 }}>
            {sortedSeasonGroups.map((sg) => (
              <Accordion
                key={sg.season}
                expanded={!!expandedSeasons[sg.season]}
                onChange={(_, expanded) =>
                  setExpandedSeasons((prev) => ({
                    ...prev,
                    [sg.season]: expanded,
                  }))
                }
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography sx={{ fontWeight: 800 }}>Season {sg.season}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    {sg.episodes.map((e) => (
                      <Grid key={e.src} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                        <Card>
                          <CardMedia
                            component="img"
                            image={e.src}
                            alt={e.title}
                            sx={{ height: 120, width: "100%", objectFit: "contain" }}
                          />
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
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
                    image="/demo/ted-movie-boxset/d7ee7c6c-89cc-46b7-95ba-0c276fd78a7d.jpg"
                    alt="ted collection"
                    sx={{ aspectRatio: "2 / 3", objectFit: "contain" }}
                  />
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography sx={{ fontWeight: 800 }} noWrap>
                      ted collection
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      Movie Box Set
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ px: 2 }}>
                    <Button component={Link} variant="text" size="small" href="/movie/1703/boxset" sx={{ pl: 0, minWidth: 0 }}>
                      BOX SET
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            </Grid>
          </Box>
        </Box>
      </Stack>
    </Container>
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
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [base, showTmdbId]);

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography color="error">{error}</Typography>
      </Container>
    );
  }

  if (!data) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography color="text.secondary">Loading…</Typography>
      </Container>
    );
  }

  const hasSeasonsOrEpisodes = data.seasons.length > 0 || Object.keys(data.episodes_by_season).length > 0;

  if (!hasSeasonsOrEpisodes) {
    // If the network doesn’t have the full box set structure yet, show the demo reference.
    return <TedBoxSetDemo />;
  }

  const showPoster = data.show[0] || null;

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {showPoster?.media.title || "TV Box Set"}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            TV SHOW
            {showPoster?.media.year ? ` | ${showPoster.media.year}` : ""}
            {showPoster?.creator.display_name ? ` | ${showPoster.creator.display_name}` : ""}
          </Typography>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Main show posters
          </Typography>
          <Box sx={{ mt: 1.5 }}>
            <PosterGrid items={data.show} />
          </Box>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Season posters
          </Typography>
          <Box sx={{ mt: 1.5 }}>
            <PosterGrid items={data.seasons} />
          </Box>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Episode cards
          </Typography>
          <Box sx={{ mt: 1.5 }}>
            {Object.entries(data.episodes_by_season)
              .map(([season, eps]) => ({ season: Number(season), eps }))
              .filter((x) => Number.isFinite(x.season))
              .sort((a, b) => b.season - a.season)
              .map(({ season, eps }) => (
                <Accordion
                  key={season}
                  expanded={!!expandedSeasons[season]}
                  onChange={(_, expanded) =>
                    setExpandedSeasons((prev) => ({
                      ...prev,
                      [season]: expanded,
                    }))
                  }
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography sx={{ fontWeight: 800 }}>Season {season}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <EpisodeGrid items={eps} />
                  </AccordionDetails>
                </Accordion>
              ))}
          </Box>
        </Box>

        {showPoster ? <RelatedArtworkSection base={base} links={showPoster.links || null} /> : null}
      </Stack>
    </Container>
  );
}

export default function TvBoxsetPage({
  params,
}: {
  params: Promise<{ showTmdbId: string }>;
}) {
  const { showTmdbId } = use(params);
  return <TvBoxsetReal showTmdbId={showTmdbId} />;
}
