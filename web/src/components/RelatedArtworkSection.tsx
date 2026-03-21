"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { POSTER_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";

import type { PosterEntry } from "@/lib/types";
import PosterCard, { type CardAction } from "@/components/PosterCard";

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
  title,
}: RelatedArtworkSectionProps) {
  const t = useTranslations("relatedArtwork");
  const displayTitle = title ?? t("title");
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
  if (items === null) return <Typography color="text.secondary">{t("loadingRelated")}</Typography>;
  if (items.length === 0) return null;

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>
        {displayTitle}
      </Typography>

      <Box sx={{ mt: 1.5 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
          {items.map((p) => {
            const bsHref = boxSetHref(p);
            const isBoxset = !!bsHref;
            const actions: CardAction[] = isBoxset && bsHref
              ? [
                  { label: p.media.type === "collection" ? "COLLECTION" : "BOX SET", href: bsHref },
                  { label: "POSTER", href: `/p/${encodeURIComponent(p.poster_id)}` },
                ]
              : [{ label: "VIEW", href: p.assets.full.url, external: true }];
            return (
              <Box key={p.poster_id}>
                <PosterCard
                  poster={p}
                  actions={actions}
                />
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
