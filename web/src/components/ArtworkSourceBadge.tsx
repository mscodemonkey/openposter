"use client";

// ─── ArtworkSourceBadge ───────────────────────────────────────────────────────
// Small badge shown on MediaCards indicating whether artwork is managed by
// OpenPoster or sourced directly from the media server (Plex, etc.)

import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import { useTranslations } from "next-intl";

import { CHIP_HEIGHT } from "@/lib/grid-sizes";

import OPLogo from "./OPLogo";
import PlexMark from "./PlexMark";

interface ArtworkSourceBadgeProps {
  source: "openposter" | "plex" | null;
  /** Creator display name — shown in tooltip when source is "openposter". */
  creatorName?: string | null;
  /** Media server label — shown in tooltip when source is not "openposter". Defaults to "Plex". */
  mediaServer?: string;
}

export default function ArtworkSourceBadge({ source, creatorName, mediaServer = "Plex" }: ArtworkSourceBadgeProps) {
  const t = useTranslations("common");
  if (!source) return null;
  const label = source === "openposter"
    ? t("sourceOpenPoster")
    : t("sourceMediaServer", { name: mediaServer });
  return (
    <Tooltip title={label} arrow placement="left">
      <Box
        component="span"
        aria-label={label}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          height: CHIP_HEIGHT,
          flexShrink: 0,
          cursor: "default",
          filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.7))",
          // Parent badge container has pointerEvents: none to let clicks pass
          // through to the card. Override here so the Tooltip receives mouseEnter.
          pointerEvents: "auto",
        }}
      >
        {source === "openposter" ? <OPLogo size={20} /> : <PlexMark />}
      </Box>
    </Tooltip>
  );
}
