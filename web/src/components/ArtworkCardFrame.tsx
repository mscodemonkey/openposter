"use client";

import type { ReactElement, ReactNode } from "react";
import Link from "next/link";

import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";

import OPLogo from "@/components/OPLogo";
import CardTitleStrip from "@/components/CardTitleStrip";
import { cardMediaSurfaceSx } from "@/components/cardSurface";

interface ArtworkCardFrameProps {
  media: ReactNode;
  title?: string;
  subtitle?: string | null;
  subtitleHref?: string;
  subtitleSlot?: ReactNode;
  subscribeSlot?: ReactNode;
  statusBar?: ReactNode;
  topLeftSlot?: ReactNode;
  menuSlot?: ReactNode;
  bottomLeftSlot?: ReactNode;
  bottomRightSlot?: ReactNode;
  managed?: boolean;
  selected?: boolean;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  imageWrapper?: (img: ReactElement) => ReactElement;
  containerSx?: SxProps<Theme>;
  surfaceSx?: SxProps<Theme>;
  showTitleStrip?: boolean;
  surfaceTabIndex?: number;
  surfaceRole?: string;
  surfaceAriaPressed?: boolean;
  surfaceTitle?: string;
  onSurfaceMouseDown?: () => void;
  onSurfaceFocus?: React.FocusEventHandler<HTMLElement>;
  onSurfaceBlur?: React.FocusEventHandler<HTMLElement>;
  onSurfaceKeyDown?: React.KeyboardEventHandler<HTMLElement>;
}

export default function ArtworkCardFrame({
  media,
  title,
  subtitle,
  subtitleHref,
  subtitleSlot,
  subscribeSlot,
  statusBar,
  topLeftSlot,
  menuSlot,
  bottomLeftSlot,
  bottomRightSlot,
  managed = false,
  selected = false,
  href,
  external = false,
  onClick,
  ariaLabel,
  imageWrapper,
  containerSx,
  surfaceSx,
  showTitleStrip = true,
  surfaceTabIndex,
  surfaceRole,
  surfaceAriaPressed,
  surfaceTitle,
  onSurfaceMouseDown,
  onSurfaceFocus,
  onSurfaceBlur,
  onSurfaceKeyDown,
}: ArtworkCardFrameProps) {
  const mediaSurface = (
    <Box sx={{ position: "relative" }}>
      <Box
        sx={{
          ...cardMediaSurfaceSx,
          ...(selected && {
            outline: "3px solid",
            outlineColor: "primary.main",
            outlineOffset: "-1px",
          }),
          ...surfaceSx as object,
        }}
      >
        {media}
        {topLeftSlot && (
          <Box sx={{ position: "absolute", top: 0, left: 0 }}>
            {topLeftSlot}
          </Box>
        )}
        {managed && (
          <Box sx={{ position: "absolute", top: 0, right: menuSlot ? 34 : 6, pointerEvents: "none" }}>
            <OPLogo size={20} />
          </Box>
        )}
        {bottomLeftSlot && (
          <Box sx={{ position: "absolute", bottom: 8, left: 8 }}>
            {bottomLeftSlot}
          </Box>
        )}
        {bottomRightSlot && (
          <Box sx={{ position: "absolute", bottom: 8, right: menuSlot ? 44 : 8, pointerEvents: "none" }}>
            {bottomRightSlot}
          </Box>
        )}
        {menuSlot && (
          <Box
            sx={{ position: "absolute", right: 4, bottom: 4, zIndex: 2 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {menuSlot}
          </Box>
        )}
      </Box>
    </Box>
  );

  const wrappedMedia = imageWrapper ? imageWrapper(mediaSurface) : mediaSurface;

  const clickableMedia = href ? (
    external ? (
      <a href={href} target="_blank" rel="noreferrer" style={{ display: "block" }} aria-label={ariaLabel ?? title} onClick={onClick ? (e) => { e.preventDefault(); onClick(); } : undefined}>
        {wrappedMedia}
      </a>
    ) : (
      <Link href={href} style={{ display: "block" }} aria-label={ariaLabel ?? title} onClick={onClick ? (e) => { e.preventDefault(); onClick(); } : undefined}>
        {wrappedMedia}
      </Link>
    )
  ) : (
    <Box
      sx={{ cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
      aria-label={ariaLabel ?? title}
      title={surfaceTitle}
      tabIndex={surfaceTabIndex}
      role={surfaceRole}
      aria-pressed={surfaceAriaPressed}
      onMouseDown={onSurfaceMouseDown}
      onFocus={onSurfaceFocus}
      onBlur={onSurfaceBlur}
      onKeyDown={onSurfaceKeyDown}
    >
      {wrappedMedia}
    </Box>
  );

  return (
    <Box sx={{ position: "relative", height: "100%", overflow: "visible", ...containerSx as object }}>
      {clickableMedia}
      {statusBar}
      {showTitleStrip && title && (
        <CardTitleStrip
          title={title}
          subtitle={subtitle}
          subtitleHref={subtitleHref}
          subtitleSlot={subtitleSlot}
          subscribeSlot={subscribeSlot}
          sx={{ mt: 0, px: 1, pt: 0.75, pb: 0.75 }}
        />
      )}
    </Box>
  );
}
