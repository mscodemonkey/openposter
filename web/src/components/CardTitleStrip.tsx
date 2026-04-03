import type { SxProps, Theme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "next/link";

interface CardTitleStripProps {
  title: string;
  subtitle?: string | null;
  /** Render subtitle as a clickable link. */
  subtitleHref?: string;
  /** Replace the subtitle line entirely with a custom node. */
  subtitleSlot?: React.ReactNode;
  /** Rendered inline after the subtitle text (e.g. subscribe star). */
  subscribeSlot?: React.ReactNode;
  /** Rendered absolutely on the right of the strip (e.g. retry menu). */
  menuSlot?: React.ReactNode;
  /** Override container styles — use to control margin/padding per context. */
  sx?: SxProps<Theme>;
}

export default function CardTitleStrip({
  title,
  subtitle,
  subtitleHref,
  subtitleSlot,
  subscribeSlot,
  menuSlot,
  sx,
}: CardTitleStripProps) {
  const hasSubtitle = subtitleSlot || subtitle;
  return (
    <Box sx={{ mt: 1, textAlign: "center", position: "relative", ...sx as object }}>
      <Typography variant="body2" noWrap sx={{ display: "block", fontWeight: 600, color: "text.primary", lineHeight: 1.6 }}>
        {title}
      </Typography>
      {hasSubtitle && (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.25 }}>
          {subtitleSlot ?? (
            <>
              {subtitleHref ? (
                <Link href={subtitleHref} style={{ color: "inherit" }} onClick={(e) => e.stopPropagation()}>
                  <Typography variant="caption" noWrap sx={{ display: "block", color: "text.secondary", textDecoration: "underline", textUnderlineOffset: 2 }}>
                    {subtitle}
                  </Typography>
                </Link>
              ) : (
                <Typography variant="caption" noWrap sx={{ color: "text.secondary", lineHeight: 1.4 }}>
                  {subtitle}
                </Typography>
              )}
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
}
