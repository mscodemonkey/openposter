"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import Box from "@mui/material/Box";
import CardMedia from "@mui/material/CardMedia";
import Typography from "@mui/material/Typography";


import type { PosterEntry } from "@/lib/types";
import { CardChip } from "./MediaCard";
import ImageIcon from "@mui/icons-material/Image";
import ArtworkCardFrame from "./ArtworkCardFrame";

const CHECKER = "repeating-conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%) 0 0 / 20px 20px";

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

function PosterCardImage({
  activeImage,
  imageCandidates,
  aspectRatio,
  alt,
  onImageError,
}: {
  activeImage: string | null;
  imageCandidates: string[];
  aspectRatio: string;
  alt: string;
  onImageError?: () => void;
}) {
  const [imageIndex, setImageIndex] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);

  const resolvedImage = imageCandidates[imageIndex] ?? activeImage;
  const showPlaceholder = imgFailed || !resolvedImage;

  const handleImageError = () => {
    if (imageIndex < imageCandidates.length - 1) {
      setImageIndex((prev) => prev + 1);
      return;
    }
    setImgFailed(true);
    onImageError?.();
  };

  if (showPlaceholder) {
    return (
      <Box sx={{ position: "relative", aspectRatio, background: CHECKER, display: "block" }}>
        <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.75, px: 1, pointerEvents: "none" }}>
          <ImageIcon sx={{ fontSize: "2.25rem", color: "rgba(255,255,255,0.7)" }} />
          <Typography sx={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", lineHeight: 1.2, color: "rgba(255,255,255,0.78)", textAlign: "center" }}>
            Missing artwork
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <CardMedia
      component="img"
      image={resolvedImage}
      alt={alt}
      loading="lazy"
      onError={handleImageError}
      sx={{ aspectRatio, objectFit: "contain", display: "block" }}
    />
  );
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
  const autoChipProps: { label: string; color: "primary" | "success" | "error" | "secondary" | "warning" | "default" | "info" } | null =
    poster.kind === "square" ? { label: t("square"), color: "warning" }
    : poster.kind === "logo" ? { label: t("logo"), color: "warning" }
    : (poster.kind === "background" || poster.media.type === "backdrop") ? { label: t("backdrop"), color: "warning" }
    : poster.media.type === "collection" ? { label: t("movieBoxSet"), color: "primary" }
    : poster.media.type === "movie" ? { label: t("movie"), color: "success" }
    : poster.media.type === "show" ? { label: t("tvBoxSet"), color: "secondary" }
    : poster.media.type === "season" ? { label: t("season"), color: "info" }
    : poster.media.type === "episode" ? { label: t("episode"), color: "warning" }
    : null;
  // chip prop: false = suppress, object = override, undefined = use auto
  const typeChipProps = chip === false ? null : (chip ?? autoChipProps);

  const titleLine = titleOverride ?? seasonDisplayTitle ?? (poster.media.title || tc("untitled"));
  const subtitleParts = isEpisode
    ? [
        poster.media.episode_number != null ? `Episode ${String(poster.media.episode_number).padStart(2, "0")}` : null,
        !hideCreator ? (poster.creator.creator_id || null) : null,
      ].filter(Boolean)
    : [
        !isSeason && poster.media.year ? String(poster.media.year) : null,
        !hideCreator ? (poster.creator.creator_id || null) : null,
      ].filter(Boolean);
  const subtitleLine = subtitle ?? subtitleParts.join(" · ");

  const primary = actions?.[0];
  const imageCandidates = useMemo(() => {
    const urls = [poster.assets.preview.url];
    if (poster.assets.full.url && poster.assets.full.url !== poster.assets.preview.url) {
      urls.push(poster.assets.full.url);
    }
    return urls.filter((url): url is string => typeof url === "string" && url.length > 0);
  }, [poster.assets.full.url, poster.assets.preview.url]);
  const imageArea = imageFailed_prop ? (
    <Box sx={{ position: "relative", aspectRatio, background: CHECKER, display: "block" }}>
      <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.75, px: 1, pointerEvents: "none" }}>
        <ImageIcon sx={{ fontSize: "2.25rem", color: "rgba(255,255,255,0.7)" }} />
        <Typography sx={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", lineHeight: 1.2, color: "rgba(255,255,255,0.78)", textAlign: "center" }}>
          Missing artwork
        </Typography>
      </Box>
    </Box>
  ) : (
    <PosterCardImage
      key={`${poster.poster_id}:${poster.assets.preview.url}:${poster.assets.full.url}`}
      activeImage={imageCandidates[0] ?? null}
      imageCandidates={imageCandidates}
      aspectRatio={aspectRatio}
      alt={poster.media.title || poster.poster_id}
      onImageError={onImageError}
    />
  );

  return (
    <ArtworkCardFrame
      media={imageArea}
      title={titleLine}
      subtitle={subtitleSlot ? undefined : subtitleLine || undefined}
      subtitleSlot={subtitleSlot}
      subscribeSlot={subscribeSlot}
      statusBar={statusBar}
      topLeftSlot={typeChipProps ? <CardChip label={typeChipProps.label} color={typeChipProps.color} /> : undefined}
      menuSlot={menuSlot}
      managed={managed}
      selected={selected}
      href={primary?.href}
      external={primary?.external}
      onClick={!primary ? onClick : undefined}
      imageWrapper={imageWrapper}
    />
  );
}
