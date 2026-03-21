"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import Link from "next/link";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import CardMedia from "@mui/material/CardMedia";
import Typography from "@mui/material/Typography";

import type { PosterEntry } from "@/lib/types";
import OPLogo from "./OPLogo";

export type CardAction = {
  label: string;
  href: string;
  /** Opens in a new tab with rel="noreferrer" */
  external?: boolean;
};

interface PosterCardProps {
  poster: PosterEntry;
  /** Buttons rendered in the card footer. Omit or pass empty array for no buttons. */
  actions?: CardAction[];
  /**
   * Image aspect ratio. Default "2 / 3" (portrait poster).
   * Use "16 / 9" for episode thumb cards.
   */
  aspectRatio?: string;
  /** Called when the preview image fails to load. */
  onImageError?: () => void;
  /**
   * Override the auto-derived type chip. Pass `false` to suppress it entirely,
   * or an object to replace it with a custom label/color.
   */
  chip?: { label: string; color: "primary" | "success" | "error" | "secondary" | "warning" } | false;
  /** Called when the card is clicked (image area). */
  onClick?: () => void;
  /** When true, draws a primary-colour ring on the image to indicate selection. */
  selected?: boolean;
  /** When true, skips rendering the image and shows a grey placeholder instead. */
  imageFailed?: boolean;
  /** When true, shows the OpenPoster logo badge in the top-right corner. */
  managed?: boolean;
  /** Optional node rendered in the title strip (e.g. retry menu). Ignored for episode cards. */
  menuSlot?: React.ReactNode;
  /**
   * Optional wrapper applied to the image area only (not the title strip).
   * Use this to attach a tooltip to just the image, e.g.:
   *   imageWrapper={(img) => <ArtworkMetadataTooltip meta={...}>{img}</ArtworkMetadataTooltip>}
   */
  imageWrapper?: (img: React.ReactElement) => React.ReactElement;
  /**
   * Optional node rendered next to the creator name in the title strip.
   * Use this for a subscribe star/menu. Only shown when creator.display_name is present.
   */
  subscribeSlot?: React.ReactNode;
}

export default function PosterCard({
  poster,
  actions,
  aspectRatio = "2 / 3",
  onImageError,
  chip,
  onClick,
  imageFailed: imageFailed_prop = false,
  managed = false,
  menuSlot,
  selected = false,
  imageWrapper,
  subscribeSlot,
}: PosterCardProps) {
  const t = useTranslations("posterCard");
  const tc = useTranslations("common");

  const isEpisode = poster.media.type === "episode";
  const isSeason = poster.media.type === "season";
  const seasonDisplayTitle = isSeason
    ? poster.media.season_number != null
      ? `Season ${String(poster.media.season_number).padStart(2, "0")}`
      : poster.media.title || tc("untitled")
    : null;
  const episodeMeta = null; // replaced by title strip below

  const autoChipProps: { label: string; color: "primary" | "success" | "error" | "secondary" | "warning" } | null =
    poster.media.type === "collection" ? { label: t("movieBoxSet"), color: "primary" }
    : poster.media.type === "movie" ? { label: t("movie"), color: "success" }
    : poster.media.type === "show" ? { label: t("tvBoxSet"), color: "error" }
    : poster.media.type === "season" ? { label: t("season"), color: "secondary" }
    : poster.media.type === "episode" ? { label: t("episode"), color: "warning" }
    : poster.media.type === "backdrop" ? { label: t("backdrop"), color: "warning" }
    : null;
  // chip prop: false = suppress, object = override, undefined = use auto
  const typeChipProps = chip === false ? null : (chip ?? autoChipProps);

  const titleLine = seasonDisplayTitle ?? (poster.media.title || tc("untitled"));
  const subtitleParts = isEpisode
    ? [
        poster.media.episode_number != null ? `Episode ${String(poster.media.episode_number).padStart(2, "0")}` : null,
        poster.creator.display_name || null,
      ].filter(Boolean)
    : [
        !isSeason && poster.media.year ? String(poster.media.year) : null,
        poster.creator.display_name || null,
      ].filter(Boolean);
  const subtitleLine = subtitleParts.join(" · ");

  const titleStrip = (
    <Box sx={{ px: 1, pt: 0.75, pb: 0.75, textAlign: "center", position: "relative" }}>
      <Typography
        variant="caption"
        noWrap
        sx={{ display: "block", fontWeight: 600, color: "text.primary", lineHeight: 1.6 }}
      >
        {titleLine}
      </Typography>
      {subtitleLine && (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.25 }}>
          <Typography
            variant="caption"
            noWrap
            sx={{ color: "text.secondary", lineHeight: 1.4 }}
          >
            {subtitleLine}
          </Typography>
          {subscribeSlot}
        </Box>
      )}
      {menuSlot && (
        <Box sx={{ position: "absolute", top: "50%", right: 0, transform: "translateY(-50%)" }}>
          {menuSlot}
        </Box>
      )}
    </Box>
  );

  const primary = actions?.[0];
  const [imgFailed, setImgFailed] = useState(false);
  const showPlaceholder = imageFailed_prop || imgFailed;

  const imageArea = (
    <Box sx={{ position: "relative", ...(selected && { outline: "3px solid", outlineColor: "primary.main" }) }}>
      {showPlaceholder ? (
        <Box sx={{ aspectRatio, bgcolor: "action.hover", display: "block" }} />
      ) : (
        <CardMedia
          component="img"
          image={poster.assets.preview.url}
          alt={poster.media.title || poster.poster_id}
          onError={() => { setImgFailed(true); onImageError?.(); }}
          sx={{ aspectRatio, objectFit: "contain", display: "block" }}
        />
      )}
      {typeChipProps && (
        <Chip
          label={typeChipProps.label}
          size="small"
          color={typeChipProps.color}
          sx={{ position: "absolute", top: 10, left: 0, fontWeight: 700, fontSize: "0.6rem", height: 20, borderRadius: "0 6px 6px 0", pointerEvents: "none", opacity: 0.9 }}
        />
      )}
      {managed && (
        <Box sx={{ position: "absolute", top: 10, right: 6, pointerEvents: "none" }}>
          <OPLogo size={20} />
        </Box>
      )}
    </Box>
  );

  const wrappedImageArea = imageWrapper ? imageWrapper(imageArea) : imageArea;

  return (
    <Card sx={{ height: "100%", border: 0, boxShadow: "none", bgcolor: "transparent" }}>
      {primary ? (
        primary.external ? (
          <a href={primary.href} target="_blank" rel="noreferrer" style={{ display: "block" }}>{wrappedImageArea}</a>
        ) : (
          <Link href={primary.href} style={{ display: "block" }}>{wrappedImageArea}</Link>
        )
      ) : (
        <Box sx={{ cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
          {wrappedImageArea}
        </Box>
      )}
      {episodeMeta}
      {titleStrip}
    </Card>
  );
}
