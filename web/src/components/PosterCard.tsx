"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import Link from "next/link";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import CardMedia from "@mui/material/CardMedia";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";

import MoreVertIcon from "@mui/icons-material/MoreVert";

import type { PosterEntry } from "@/lib/types";
import { loadShowPosterDetails } from "@/lib/storage";

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
   * Show the creator name below the title, linked to /creator/[id].
   * Default: true. Set false when creator is already clear from context,
   * or when you are providing a custom subtitle instead.
   */
  showCreator?: boolean;
  /**
   * Override the subtitle line with plain text (e.g. "movie · TMDB 603").
   * When provided, replaces the creator name regardless of showCreator.
   */
  subtitle?: string;
  /**
   * If provided, shows a ⋮ overflow icon button that opens a menu with a
   * "Node" link to this URL. Useful on browse/search pages.
   */
  nodeUrl?: string;
  /**
   * Image aspect ratio. Default "2 / 3" (portrait poster).
   * Use "16 / 9" for episode thumb cards.
   */
  aspectRatio?: string;
  /** Called when the preview image fails to load (e.g. to remove broken cards). */
  onImageError?: () => void;
  /**
   * TV show title — for episode cards, shown above the S/E line.
   * Episode PosterEntry doesn't carry the show title, so callers must supply it when available.
   */
  showTitle?: string;
  /** Suppress the auto-generated TV BOX SET link on episode cards. Default: false. */
  hideBoxSetLink?: boolean;
}

export default function PosterCard({
  poster,
  actions,
  showCreator = true,
  subtitle,
  nodeUrl,
  aspectRatio = "2 / 3",
  onImageError,
  showTitle,
  hideBoxSetLink = false,
}: PosterCardProps) {
  const t = useTranslations("posterCard");
  const tc = useTranslations("common");
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [showDetails, setShowDetails] = useState(true);

  useEffect(() => {
    setShowDetails(loadShowPosterDetails());
  }, []);

  const hasButtons = actions && actions.length > 0;
  const hasMenu = !!nodeUrl;
  const showFooter = hasButtons || hasMenu;

  const isEpisode = poster.media.type === "episode";
  const boxSetHref =
    isEpisode && poster.media.show_tmdb_id != null
      ? `/tv/${poster.media.show_tmdb_id}/boxset`
      : null;
  const episodeMetaLine = isEpisode
    ? [
        showTitle ?? null,
        poster.media.season_number != null ? `S${String(poster.media.season_number).padStart(2, "0")}` : null,
        poster.media.episode_number != null ? `E${String(poster.media.episode_number).padStart(2, "0")}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  // Always-visible strip for episode cards (rendered in both compact and full modes)
  const episodeMeta =
    isEpisode && (episodeMetaLine || (boxSetHref && !hideBoxSetLink)) ? (
      <Box sx={{ px: 1.5, pt: 0.75, pb: 0.5 }}>
        {episodeMetaLine && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
            {episodeMetaLine}
          </Typography>
        )}
        {boxSetHref && !hideBoxSetLink && (
          <Button component={Link} href={boxSetHref} variant="text" size="small" sx={{ px: 0, minWidth: 0 }}>
            {t("tvBoxSet")}
          </Button>
        )}
      </Box>
    ) : null;

  const typeChipProps: { label: string; color: "primary" | "success" | "error" | "secondary" | "warning" } | null =
    poster.media.type === "collection" ? { label: t("boxSet"), color: "primary" }
    : poster.media.type === "movie" ? { label: t("movie"), color: "success" }
    : poster.media.type === "show" ? { label: t("tvShow"), color: "error" }
    : poster.media.type === "season" || poster.media.type === "episode" ? { label: poster.media.type === "season" ? t("season") : t("episode"), color: "secondary" }
    : poster.media.type === "backdrop" ? { label: t("backdrop"), color: "warning" }
    : null;

  const image = (
    <Box sx={{ position: "relative" }}>
      <CardMedia
        component="img"
        image={poster.assets.preview.url}
        alt={poster.media.title || poster.poster_id}
        onError={onImageError}
        sx={{ aspectRatio, objectFit: "contain", display: "block" }}
      />
      {typeChipProps && (
        <Chip
          label={typeChipProps.label}
          size="small"
          color={typeChipProps.color}
          sx={{ position: "absolute", top: 6, right: 6, fontWeight: 700, fontSize: "0.6rem", height: 20, borderRadius: "6px", pointerEvents: "none" }}
        />
      )}
    </Box>
  );

  const titleStrip = !isEpisode ? (
    <Box sx={{ px: 1.5, pt: 0.75, pb: 0.5 }}>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
        {poster.media.title || tc("untitled")}{poster.media.year ? ` (${poster.media.year})` : ""}
      </Typography>
    </Box>
  ) : null;

  // Compact mode: image only, tapping goes to the primary action
  if (!showDetails) {
    const primary = actions?.[0];
    return (
      <Card sx={{ height: "100%" }}>
        {primary ? (
          primary.external ? (
            <a href={primary.href} target="_blank" rel="noreferrer" style={{ display: "block" }}>
              {image}
            </a>
          ) : (
            <Link href={primary.href} style={{ display: "block" }}>
              {image}
            </Link>
          )
        ) : image}
        {episodeMeta}
        {titleStrip}
      </Card>
    );
  }

  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {image}
      {episodeMeta}

      <CardContent sx={{ flexGrow: 1 }}>
        <Typography sx={{ fontWeight: 800 }} noWrap>
          {poster.media.title || tc("untitled")}
        </Typography>

        {/* Subtitle line: explicit subtitle > linked creator name > nothing */}
        {subtitle ? (
          <Typography variant="body2" color="text.secondary" noWrap>
            {subtitle}
          </Typography>
        ) : showCreator ? (
          <Typography variant="body2" color="text.secondary" noWrap>
            <Link
              href={`/creator/${encodeURIComponent(poster.creator.creator_id)}`}
              style={{ color: "inherit", textDecoration: "none" }}
            >
              {poster.creator.display_name}
            </Link>
          </Typography>
        ) : null}
      </CardContent>

      {showFooter && (
        <CardActions sx={{ justifyContent: "space-between" }}>
          <Box>
            {actions?.map((action) =>
              action.external ? (
                <Button
                  key={action.label}
                  component="a"
                  variant="text"
                  size="small"
                  href={action.href}
                  target="_blank"
                  rel="noreferrer"
                  sx={{ px: 1, minWidth: 0 }}
                >
                  {action.label}
                </Button>
              ) : (
                <Button
                  key={action.label}
                  component={Link}
                  variant="text"
                  size="small"
                  href={action.href}
                  sx={{ px: 1, minWidth: 0 }}
                >
                  {action.label}
                </Button>
              )
            )}
          </Box>

          {hasMenu && (
            <>
              <IconButton
                aria-label={t("more")}
                size="small"
                onClick={(e) => setMenuAnchor(e.currentTarget)}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>

              <Menu
                open={Boolean(menuAnchor)}
                anchorEl={menuAnchor}
                onClose={() => setMenuAnchor(null)}
              >
                <MenuItem
                  component="a"
                  href={nodeUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMenuAnchor(null)}
                >
                  {t("node")}
                </MenuItem>
              </Menu>
            </>
          )}
        </CardActions>
      )}
    </Card>
  );
}
