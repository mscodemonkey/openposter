"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import CardMedia from "@mui/material/CardMedia";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";

import MoreVertIcon from "@mui/icons-material/MoreVert";

import type { PosterEntry } from "@/lib/types";

export type RelatedArtworkSectionProps = {
  base: string;
  links: PosterEntry["links"];
  /** Default: only show rel === "related" */
  relFilter?: (rel: string) => boolean;
  title?: string;
};

function boxSetHref(p: PosterEntry): string | null {
  if (p.media.type === "show" && p.media.tmdb_id) return `/tv/${encodeURIComponent(String(p.media.tmdb_id))}/boxset`;
  if (p.media.type === "collection" && p.media.tmdb_id) return `/movie/${encodeURIComponent(String(p.media.tmdb_id))}/boxset`;
  return null;
}

export default function RelatedArtworkSection({
  base,
  links,
  relFilter,
  title = "Related artwork",
}: RelatedArtworkSectionProps) {
  const [items, setItems] = useState<PosterEntry[] | null>(null);

  const [nodeMenuAnchor, setNodeMenuAnchor] = useState<null | HTMLElement>(null);
  const [nodeMenuUrl, setNodeMenuUrl] = useState<string | null>(null);

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
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>
        {title}
      </Typography>

      <Box sx={{ mt: 1.5 }}>
        <Grid container spacing={2}>
          {items.map((p) => {
            const bsHref = boxSetHref(p);
            const isBoxset = !!bsHref;

            return (
              <Grid key={p.poster_id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                  <CardMedia
                    component="img"
                    image={p.assets.preview.url}
                    alt={p.media.title || p.poster_id}
                    sx={{ aspectRatio: "2 / 3", objectFit: "contain" }}
                  />

                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography sx={{ fontWeight: 800 }} noWrap>
                      {p.media.title || "(untitled)"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      <Link href={`/creator/${encodeURIComponent(p.creator.creator_id)}`} style={{ color: "inherit" }}>
                        {p.creator.display_name}
                      </Link>
                    </Typography>
                  </CardContent>

                  <CardActions sx={{ px: 2, justifyContent: "space-between" }}>
                    <Box>
                      {isBoxset ? (
                        <Button
                          component={Link}
                          variant="text"
                          size="small"
                          href={`/p/${encodeURIComponent(p.poster_id)}`}
                          sx={{ pl: 0, minWidth: 0 }}
                        >
                          POSTER
                        </Button>
                      ) : (
                        <Button
                          variant="text"
                          size="small"
                          href={p.assets.full.url}
                          target="_blank"
                          rel="noreferrer"
                          sx={{ pl: 0, minWidth: 0 }}
                        >
                          VIEW
                        </Button>
                      )}

                      {isBoxset && (
                        <Button
                          component={Link}
                          variant="text"
                          size="small"
                          href={bsHref}
                          sx={{ minWidth: 0 }}
                        >
                          BOX SET
                        </Button>
                      )}
                    </Box>

                    <IconButton
                      aria-label="More"
                      size="small"
                      onClick={(e) => {
                        setNodeMenuAnchor(e.currentTarget);
                        setNodeMenuUrl(p.creator.home_node);
                      }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Box>

      <Menu
        open={Boolean(nodeMenuAnchor)}
        anchorEl={nodeMenuAnchor}
        onClose={() => {
          setNodeMenuAnchor(null);
          setNodeMenuUrl(null);
        }}
      >
        <MenuItem
          component="a"
          href={nodeMenuUrl || undefined}
          target="_blank"
          rel="noreferrer"
          disabled={!nodeMenuUrl}
          onClick={() => {
            setNodeMenuAnchor(null);
            setNodeMenuUrl(null);
          }}
        >
          Node
        </MenuItem>
      </Menu>
    </Box>
  );
}
