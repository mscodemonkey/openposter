"use client";

import { useState, useRef } from "react";

import Box from "@mui/material/Box";

import { CHIP_HEIGHT } from "@/lib/grid-sizes";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";

import ImageIcon from "@mui/icons-material/Image";

import { useTranslations } from "next-intl";

import ArtworkCardFrame from "@/components/ArtworkCardFrame";

const CHECKER = "repeating-conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%) 0 0 / 20px 20px";

// =============================================================
// CardChip
// =============================================================
// Plain Box+Typography chip — no MUI Chip internals, no sub-pixel
// flexbox variance. Every instance renders identically regardless
// of DOM position or DPR.

type ChipColor = "primary" | "secondary" | "error" | "warning" | "info" | "success" | "default" | "light";

const CHIP_BG: Record<ChipColor, string> = {
  primary:   "#1d4ed8",
  secondary: "#7c3aed",
  error:     "#1d4ed8",
  warning:   "#ea580c",
  info:      "#0f766e",
  success:   "#2f855a",
  default:   "#334155",
  light:     "#dddddd",
};

const CHIP_TEXT: Record<ChipColor, string> = {
  primary:   "#ffffff",
  secondary: "#ffffff",
  error:     "#ffffff",
  warning:   "#ffffff",
  info:      "#ffffff",
  success:   "#ffffff",
  default:   "#ffffff",
  light:     "#000000",
};

export interface CardChipProps {
  label: string;
  color?: ChipColor;
  /** Default "0 6px 6px 0" — flush-left chip mirroring the card edge. */
  borderRadius?: string;
}

export function CardChip({ label, color = "default", borderRadius = "0 6px 6px 0" }: CardChipProps) {
  return (
    <Box sx={{
      display: "inline-flex",
      alignItems: "center",
      px: "8px",
      borderRadius,
      bgcolor: CHIP_BG[color],
      flexShrink: 0
    }}>
      <Typography sx={{
        fontSize: "0.6rem",
        mt: "2px",
        mb: "1px",
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: CHIP_TEXT[color],
        whiteSpace: "nowrap",
        userSelect: "none",
        pointerEvents: "none",
      }}>
        {label}
      </Typography>
    </Box>
  );
}

// =============================================================
// ToolbarButton
// =============================================================

export interface ToolbarButtonProps {
  /** Number of 4-col grid columns this button spans. Default 1. */
  cols?: 1 | 2 | 4;
  icon?: React.ReactNode;
  /** Shown below the icon (or alone for text-only buttons). */
  label?: string;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  /** When provided, clicking opens a MUI Menu with these items instead of calling onClick. */
  menuItems?: Array<{ label: string; onClick: () => void }>;
  /** When true, tints icon/label to primary.light (e.g. filled star = subscribed). */
  active?: boolean;
  /** Wraps the button in a Tooltip when provided. */
  tooltip?: string;
  /** Button height. "md" = 44px (default), "sm" = 30px. */
  size?: "md" | "sm";
}

export function ToolbarButton({
  cols = 1,
  icon,
  label,
  disabled = false,
  onClick,
  menuItems,
  active = false,
  tooltip,
  size = "md",
}: ToolbarButtonProps) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (menuItems?.length) {
      setMenuAnchor(e.currentTarget);
    } else {
      onClick?.(e);
    }
  };

  const btn = (
    <ButtonBase
      disabled={disabled}
      onClick={handleClick}
      focusRipple
      aria-label={tooltip ?? label}
      title={tooltip && !disabled ? tooltip : undefined}
      sx={{
        gridColumn: `span ${cols}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.5,
        height: size === "sm" ? 30 : 44,
        borderRadius: 1.5,
        bgcolor: "rgba(255,255,255,0.12)",
        color: disabled
          ? "rgba(255,255,255,0.28)"
          : active
          ? "primary.light"
          : "rgba(255,255,255,0.9)",
        transition: "color 0.15s, background-color 0.15s",
        "&:hover:not(:disabled)": { bgcolor: "rgba(255,255,255,0.22)" },
        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.light", outlineOffset: 2 },
        minWidth: 0,
        width: "100%",
        px: 0.5,
      }}
    >
      {icon && (
        <Box sx={{ display: "flex", alignItems: "center", fontSize: "1.2rem", lineHeight: 1 }}>
          {icon}
        </Box>
      )}
      {label && (
        <Typography
          sx={{
            fontSize: "0.68rem",
            fontWeight: 600,
            lineHeight: 1.2,
            textAlign: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
            px: 0.5,
          }}
        >
          {label}
        </Typography>
      )}
    </ButtonBase>
  );

  return (
    <>
      {btn}
      {menuItems && (
        <Menu
          anchorEl={menuAnchor}
          open={!!menuAnchor}
          onClose={() => setMenuAnchor(null)}
          onClick={(e) => e.stopPropagation()}
        >
          {menuItems.map((item) => (
            <MenuItem
              key={item.label}
              onClick={() => {
                item.onClick();
                setMenuAnchor(null);
              }}
            >
              {item.label}
            </MenuItem>
          ))}
        </Menu>
      )}
    </>
  );
}

// =============================================================
// MediaCardOverlay
// =============================================================

export interface MediaCardOverlayProps {
  /** Primary text — e.g. show name. White, bold, left-aligned. */
  title?: string;
  /** Secondary text — e.g. "Season 01 · 2022". Dimmer, left-aligned. */
  subtitle?: string;
  /** Tertiary text — e.g. season title. Even dimmer, shown between subtitle and toolbar. */
  detail?: string;
  /** ToolbarButton children. Rendered in a 4-column grid at the bottom. */
  children?: React.ReactNode;
}

export function MediaCardOverlay({ title, subtitle, detail, children }: MediaCardOverlayProps) {
  return (
    <Box
      sx={{
        px: 1.5,
        pt: 1,
        pb: 1.25,
      }}
    >
      {/* Text block */}
      {title && (
        <Typography
          noWrap
          sx={{ color: "white", fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.3, mb: (subtitle || detail) ? 0.6 : 1.2 }}
        >
          {title}
        </Typography>
      )}
      {subtitle && (
        <Typography
          noWrap
          sx={{ color: "white", fontSize: "0.78rem", lineHeight: 1.4, mb: detail ? 0.6 : 1.2, textTransform: "uppercase", letterSpacing: "0.04em" }}
        >
          {subtitle}
        </Typography>
      )}
      {detail && (
        <Typography
          noWrap
          sx={{ color: "white", fontSize: "0.72rem", lineHeight: 1.4, mb: 1.2 }}
        >
          {detail}
        </Typography>
      )}

      {/* Toolbar button row */}
      {children && (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.75 }}>
          {children}
        </Box>
      )}
    </Box>
  );
}

// =============================================================
// MediaCard
// =============================================================

interface MediaCardProps {
  /** Image URL. Pass null to render a grey placeholder. */
  image: string | null;
  alt: string;
  /** CSS aspect-ratio. Default "2 / 3" (portrait poster). */
  aspectRatio?: string;
  /**
   * When true: shows the WCAG selection ring + triggers the overlay.
   * Overlay also shows on keyboard focus (via onFocus / onBlur).
   */
  selected?: boolean;
  /** Node rendered top-right (e.g. CheckCircleIcon). Dims when overlay is visible. */
  badge?: React.ReactNode;
  /**
   * Node rendered top-left (e.g. a type Chip).
   * Fades out when the overlay is showing (overlay covers this area).
   */
  chip?: React.ReactNode;
  /**
   * Covers the entire card when the card is focused/selected.
   * Use MediaCardOverlay for the standard title + toolbar layout.
   */
  overlay?: React.ReactNode;
  onClick?: () => void;
  onImageError?: () => void;
  /** When true, skips rendering the <img> (grey placeholder shown instead). */
  imageFailed?: boolean;
  /** Called when the X close button is clicked. Renders an X button at top-right when provided. */
  onClose?: () => void;
  /** Tooltip shown on hover when the overlay is not visible. */
  tooltip?: string;
  /** When true, renders the image in greyscale with a spinner — used during artwork reset. */
  resetting?: boolean;
  /** When true, renders the image at 20% opacity greyscale — used for TMDB default placeholders. */
  placeholder?: boolean;
  /**
   * Optional label shown as a dark chip at the bottom-left of the card (e.g. movie title for
   * backdrop cards). Slides DOWN out of view when the overlay appears, and back up when it hides.
   * Rendered as all-caps white text on a 70%-opacity black pill, matching the top chip style.
   */
  bottomLabel?: string;
  /** Override the background color of the image area (default "action.hover"). Use for transparent art like logos. */
  imageBgColor?: string;
  /** Raw CSS `background` value for the image area — supports gradients and patterns. Takes priority over imageBgColor. */
  imageBackground?: string;
  /** Chip shown top-left when the overlay is open — slides down into view as the regular chip slides up out. */
  overlayChip?: React.ReactNode;
  /** Creator name shown top-right when the overlay is open — slides down mirroring the overlayChip. */
  creatorName?: string | null;
  /** Optional shared title strip below the media surface. */
  title?: string;
  /** Optional shared subtitle below the media surface. */
  subtitle?: string | null;
}

export default function MediaCard({
  image,
  alt,
  aspectRatio = "2 / 3",
  selected = false,
  badge,
  chip,
  overlay,
  onClick,
  onImageError,
  imageFailed = false,
  onClose,
  tooltip,
  resetting = false,
  placeholder = false,
  bottomLabel,
  imageBgColor,
  imageBackground,
  overlayChip,
  creatorName,
  title,
  subtitle,
}: MediaCardProps) {
  const t = useTranslations("posterCard");
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const isOverlayVisible = selected || keyboardFocused;

  // Distinguish keyboard focus from mouse focus so the ring
  // only appears for keyboard users (pointer press sets this flag first).
  const mouseDownRef = useRef(false);

  const handleMouseDown = () => {
    mouseDownRef.current = true;
  };
  const handleFocus = () => {
    if (!mouseDownRef.current) {
      setKeyboardFocused(true);
      // Notify parent so it can deselect any previously selected card
      onClick?.();
    }
    mouseDownRef.current = false;
  };
  const handleBlur = (e: React.FocusEvent) => {
    setKeyboardFocused(false);
    // If focus moved entirely outside this card, deselect via parent
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      onClose?.();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && onClick) {
      e.preventDefault();
      onClick();
    }
  };

  const media = (
    <Box
      sx={{
        position: "relative",
        willChange: "transform",
        userSelect: "none",
        width: "100%",
        "&:focus-visible": { outline: "none" },        
      }}
    >
      {/* Image — always full opacity, never animated */}
      <Box sx={{ aspectRatio, ...((imageFailed || !image || placeholder) ? { background: imageBackground ?? CHECKER } : (imageBackground ? { background: imageBackground } : { bgcolor: imageBgColor ?? "action.hover" })), position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {!imageFailed && image && (
          <Box
            component="img"
            src={image}
            alt={alt}
            loading="lazy"
            onError={onImageError}
            sx={{ width: "100%", height: "100%", objectFit: "contain", display: "block", opacity: resetting ? 0 : placeholder ? 0.3 : 1, filter: placeholder ? "grayscale(1)" : undefined, transition: resetting ? "opacity 1.2s ease" : "opacity 0.8s ease" }}
          />
        )}
        {(imageFailed || !image || placeholder) && (
          <Box sx={{ position: placeholder ? "absolute" : undefined, inset: placeholder ? 0 : undefined, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.5, pointerEvents: "none" }}>
            <ImageIcon sx={{ fontSize: "2.5rem", color: "rgba(255,255,255,0.65)" }} />
            <Typography sx={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.78)", lineHeight: 1.2, textAlign: "center", px: 1 }}>
              Missing artwork
            </Typography>
          </Box>
        )}
        {resetting && (
          <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, pointerEvents: "none" }}>
            <CircularProgress size={28} sx={{ color: "white" }} />
            <Typography sx={{ color: "white", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em" }}>{t("resetting")}</Typography>
          </Box>
        )}
      </Box>

      {/* Dim overlay — fades in over the image, fully opaque at bottom for text/toolbar */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,1) 72%, rgba(0,0,0,1) 100%)",
          opacity: isOverlayVisible ? 1 : 0,
          backdropFilter: isOverlayVisible ? "blur(6px)" : "none",
          transition: "opacity 0.22s ease, backdrop-filter 0.22s ease",
          pointerEvents: "none",
        }}
      />

      {/* Chip — top-left, slides up out of view when overlay appears */}
      {chip && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            transform: isOverlayVisible ? "translateY(-42px)" : "translateY(0)",
            transition: "transform 0.22s ease",
            pointerEvents: "none",
          }}
        >
          {chip}
        </Box>
      )}

      {/* Badge — top-right, slides up out of view when overlay appears */}
      {badge && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            right: 8,
            transform: isOverlayVisible ? "translateY(-42px)" : "translateY(0)",
            transition: "transform 0.22s ease",
            pointerEvents: "none",
          }}
        >
          {badge}
        </Box>
      )}

      {/* Bottom label chip — slides DOWN out of view when overlay appears */}
      {bottomLabel && (
        <Box
          sx={{
            position: "absolute",
            bottom: 10,
            left: 0,
            transform: isOverlayVisible ? "translateY(42px)" : "translateY(0)",
            transition: "transform 0.22s ease",
            pointerEvents: "none",
          }}
        >
          <Box
            sx={{
              bgcolor: "rgba(0,0,0,0.6)",
              borderRadius: "0 6px 6px 0",
              height: CHIP_HEIGHT,
              display: "flex",
              alignItems: "center",
              px: "8px",
              overflow: "hidden",
            }}
          >
            <Typography
              noWrap
              sx={{ color: "white", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1 }}
            >
              {bottomLabel}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Content + toolbar — slides up from bottom independently */}
      {overlay && (
        <Box
          sx={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            transform: isOverlayVisible ? "translateY(0)" : "translateY(100%)",
            opacity: isOverlayVisible ? 1 : 0,
            transition: "transform 0.22s ease, opacity 0.22s ease",
          }}
        >
          {overlay}
        </Box>
      )}

      {/* Overlay chip — slides DOWN into view top-left when overlay appears, mirroring close button */}
      {overlayChip && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            transform: isOverlayVisible ? "translateY(0)" : "translateY(-42px)",
            transition: "transform 0.22s ease",
            zIndex: 2,
            pointerEvents: "none",
          }}
        >
          {overlayChip}
        </Box>
      )}

      {/* Creator name — top-right chip, slides DOWN into view alongside the overlayChip */}
      {creatorName && (
        <Box
          sx={{
            position: "absolute",
            top: 12,
            right: 0,
            transform: isOverlayVisible ? "translateY(0)" : "translateY(-42px)",
            transition: "transform 0.22s ease",
            zIndex: 2,
            pointerEvents: "none",
            maxWidth: "45%",
            overflow: "hidden",
            bgcolor: "rgba(255,255,255,0.3)",
            borderRadius: "6px 0 0 6px",
            display: "flex",
            alignItems: "center",
            px: "8px",
          }}
        >
          <Typography
            noWrap
            sx={{ color: "black", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",  mt: "2px", mb: "1px"}}
          >
            {creatorName}
          </Typography>
        </Box>
      )}
    </Box>
  );

  return (
    <ArtworkCardFrame
      media={media}
      title={title}
      subtitle={subtitle}
      selected={selected}
      ariaLabel={tooltip ?? alt}
      surfaceSx={{ overflow: "hidden" }}
      onClick={onClick}
      surfaceTabIndex={onClick ? 0 : undefined}
      surfaceRole={onClick ? "button" : undefined}
      surfaceAriaPressed={onClick ? selected : undefined}
      surfaceTitle={tooltip && !isOverlayVisible ? tooltip : undefined}
      onSurfaceMouseDown={handleMouseDown}
      onSurfaceFocus={handleFocus}
      onSurfaceBlur={handleBlur}
      onSurfaceKeyDown={handleKeyDown}
    />
  );
}
