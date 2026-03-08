"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardMedia from "@mui/material/CardMedia";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/GridLegacy";

import type { PosterEntry } from "@/lib/types";

export type RelatedArtworkSectionProps = {
  base: string;
  links: PosterEntry["links"];
  /** Default: only show rel === "related" */
  relFilter?: (rel: string) => boolean;
  title?: string;
};

function typeLabel(p: PosterEntry): string {
  if (p.media.type === "show") return "TV Show Box Set";
  if (p.media.type === "collection") return "Movie Box Set";
  return "Poster";
}

function targetHref(p: PosterEntry): string {
  if (p.media.type === "show" && p.media.tmdb_id) return `/tv/${encodeURIComponent(String(p.media.tmdb_id))}/boxset`;
  if (p.media.type === "collection" && p.media.tmdb_id) return `/movie/${encodeURIComponent(String(p.media.tmdb_id))}/boxset`;
  return `/p/${encodeURIComponent(p.poster_id)}`;
}

export default function RelatedArtworkSection({
  base,
  links,
  relFilter,
  title = "Related artwork",
}: RelatedArtworkSectionProps) {
  const [items, setItems] = useState<PosterEntry[] | null>(null);

  const filteredLinks = useMemo(() => {
    if (!links || links.length === 0) return [];
    const filter = relFilter || ((r: string) => r === "related");
    return links.filter((l) => filter(l.rel) && typeof l.href === "string" && l.href.startsWith("/p/"));
  }, [links, relFilter]);

  useEffect(() => {
    void (async () => {
      if (filteredLinks.length === 0) {
        setItems([]);
        return;
      }

      const posterIds = filteredLinks.map((l) => decodeURIComponent(l.href.slice(3))).filter(Boolean);

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
  }, [base, filteredLinks]);

  if (filteredLinks.length === 0) return null;
  if (items === null) return <Typography color="text.secondary">Loading related…</Typography>;
  if (items.length === 0) return null;

  return (
    <Paper sx={{ p: 2.5 }}>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>
        {title}
      </Typography>

      <Box sx={{ mt: 1.5 }}>
        <Grid container spacing={2}>
          {items.map((p) => {
            const href = targetHref(p);
            return (
              <Grid key={p.poster_id} item xs={12} sm={6} md={4} lg={3}>
                <Card>
                  <Link href={href} style={{ textDecoration: "none" }}>
                    <CardMedia
                      component="img"
                      height={320}
                      image={p.assets.preview.url}
                      alt={p.media.title || p.poster_id}
                      sx={{ objectFit: "cover" }}
                    />
                  </Link>
                  <CardContent>
                    <Typography sx={{ fontWeight: 800 }} noWrap>
                      {p.media.title || "(untitled)"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {typeLabel(p)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Box>
    </Paper>
  );
}
