"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import Link from "next/link";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardMedia from "@mui/material/CardMedia";
import Typography from "@mui/material/Typography";

import type { PosterEntry } from "@/lib/types";
import { CardChip } from "./MediaCard";
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
  chip?: { label: string; color: "primary" | "success" | "error" | "secondary" | "warning" | "info" } | false;
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
  /** When true, omits creator name from the subtitle line. */
  hideCreator?: boolean;
  /** Override the auto-derived title line entirely. */
  titleOverride?: string;
  /** Override the auto-derived subtitle line entirely. */
  subtitle?: string;
  /** When provided, replaces the subtitle Typography with a custom node (e.g. a Link). */
  subtitleSlot?: React.ReactNode;
  /** Optional node rendered between the image and the title strip (e.g. a status bar). */
  statusBar?: React.ReactNode;
}

export default function PosterCard({
  poster,
  actions,
  aspectRatio = "2 / 3",
  onImageError,
  chip,
  titleOverride,
  subtitle,
  subtitleSlot,
  onClick,
  imageFailed: imageFailed_prop = false,
  managed = false,
  menuSlot,
  selected = false,
  imageWrapper,
  subscribeSlot,
  hideCreator = false,
  statusBar,
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

  const autoChipProps: { label: string; color: "primary" | "success" | "error" | "secondary" | "warning" | "default" | "info" } | null =
    poster.kind === "square" ? { label: t("square"), color: "warning" }
    : poster.kind === "logo" ? { label: t("logo"), color: "warning" }
    : (poster.kind === "background" || poster.media.type === "backdrop") ? { label: t("backdrop"), color: "warning" }
    : poster.media.type === "collection" ? { label: t("movieBoxSet"), color: "error" }
    : poster.media.type === "movie" ? { label: t("movie"), color: "success" }
    : poster.media.type === "show" ? { label: t("tvBoxSet"), color: "error" }
    : poster.media.type === "season" ? { label: t("season"), color: "info" }
    : poster.media.type === "episode" ? { label: t("episode"), color: "success" }
    : null;
  // chip prop: false = suppress, object = override, undefined = use auto
  const typeChipProps = chip === false ? null : (chip ?? autoChipProps);

  const titleLine = titleOverride ?? seasonDisplayTitle ?? (poster.media.title || tc("untitled"));
  const subtitleParts = isEpisode
    ? [
        poster.media.episode_number != null ? `Episode ${String(poster.media.episode_number).padStart(2, "0")}` : null,
        !hideCreator ? (poster.creator.display_name || null) : null,
      ].filter(Boolean)
    : [
        !isSeason && poster.media.year ? String(poster.media.year) : null,
        !hideCreator ? (poster.creator.display_name || null) : null,
      ].filter(Boolean);
  const subtitleLine = subtitle ?? subtitleParts.join(" · ");

  const titleStrip = (
    <Box sx={{ px: 1, pt: 0.75, pb: 0.75, textAlign: "center", position: "relative" }}>
      <Typography
        variant="caption"
        noWrap
        sx={{ display: "block", fontWeight: 600, color: "text.primary", lineHeight: 1.6 }}
      >
        {titleLine}
      </Typography>
      {(subtitleSlot || subtitleLine) && (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.25 }}>
          {subtitleSlot ?? (
            <>
              <Typography variant="caption" noWrap sx={{ color: "text.secondary", lineHeight: 1.4 }}>
                {subtitleLine}
              </Typography>
              {subscribeSlot}
            </>
          )}
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
          loading="lazy"
          onError={() => { setImgFailed(true); onImageError?.(); }}
          sx={{ aspectRatio, objectFit: "contain", display: "block" }}
        />
      )}
      {typeChipProps && (
        <Box data-type-chip sx={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
          <CardChip label={typeChipProps.label} color={typeChipProps.color} />
        </Box>
      )}
      {managed && (
        <Box sx={{ position: "absolute", top: 0, right: 6, pointerEvents: "none" }}>
          <OPLogo size={20} />
        </Box>
      )}
    </Box>
  );

  const wrappedImageArea = imageWrapper ? imageWrapper(imageArea) : imageArea;

  return (
    <Card sx={{ height: "100%", border: 0, boxShadow: "none", bgcolor: "transparent", backgroundImage: "none" }}>
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
      {statusBar}
      {episodeMeta}
      {titleStrip}
    </Card>
  );
}
