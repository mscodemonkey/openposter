"use client";

import { useState, useRef } from "react";

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";

import CloseIcon from "@mui/icons-material/Close";
import ImageIcon from "@mui/icons-material/Image";

// =============================================================
// ToolbarButton
// =============================================================

export interface ToolbarButtonProps {
  /** Number of 4-col grid columns this button spans. Default 1. */
  cols?: 1 | 2;
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
          sx={{ color: "white", fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.3, mb: 0.6 }}
        >
          {title}
        </Typography>
      )}
      {subtitle && (
        <Typography
          noWrap
          sx={{ color: "white", fontSize: "0.78rem", lineHeight: 1.4, mb: detail ? 0.6 : 2.625, textTransform: "uppercase", letterSpacing: "0.04em" }}
        >
          {subtitle}
        </Typography>
      )}
      {detail && (
        <Typography
          noWrap
          sx={{ color: "white", fontSize: "0.72rem", lineHeight: 1.4, mb: 2.625 }}
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
}: MediaCardProps) {
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

  const card = (
    <Box
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
      aria-pressed={onClick ? selected : undefined}
      title={tooltip && !isOverlayVisible ? tooltip : undefined}
      onClick={onClick}
      onMouseDown={handleMouseDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      sx={{
        position: "relative",
        cursor: onClick ? "pointer" : "default",
        borderRadius: 1,
        overflow: "hidden",
        // Force a persistent GPU compositing layer so the overlay's translateY
        // animation doesn't cause mid-animation layer promotion, which produces
        // sub-pixel rounding shifts in the card contents.
        willChange: "transform",
        userSelect: "none",
        outline: selected ? "3px solid" : "none",
        outlineColor: "primary.main",
        outlineOffset: "-1px",
        "&:focus-visible": { outline: "none" },
      }}
    >
      {/* Image — always full opacity, never animated */}
      <Box sx={{ aspectRatio, bgcolor: "action.hover", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {!imageFailed && image && (
          <Box
            component="img"
            src={image}
            alt={alt}
            onError={onImageError}
            sx={{ width: "100%", height: "100%", objectFit: "contain", display: "block", opacity: resetting ? 0 : 1, transition: resetting ? "opacity 1.2s ease" : "opacity 0.8s ease" }}
          />
        )}
        {(imageFailed || !image) && (
          <ImageIcon sx={{ fontSize: "2.5rem", color: "action.disabled", opacity: 0.5 }} />
        )}
        {resetting && (
          <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, pointerEvents: "none" }}>
            <CircularProgress size={28} sx={{ color: "white" }} />
            <Typography sx={{ color: "white", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em" }}>RESETTING</Typography>
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
          transition: "opacity 0.22s ease",
          pointerEvents: "none",
        }}
      />

      {/* Chip — top-left, slides up out of view when overlay appears */}
      {chip && (
        <Box
          sx={{
            position: "absolute",
            top: 10,
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
            top: 10,
            right: 8,
            transform: isOverlayVisible ? "translateY(-42px)" : "translateY(0)",
            transition: "transform 0.22s ease",
            pointerEvents: "none",
          }}
        >
          {badge}
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

      {/* Close button — slides DOWN into view when overlay appears (opposite of badge/chip) */}
      {onClose && (
        <Box
          sx={{
            position: "absolute",
            top: 10,
            right: 8,
            transform: isOverlayVisible ? "translateY(0)" : "translateY(-42px)",
            transition: "transform 0.22s ease",
            zIndex: 2,
          }}
        >
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            sx={{ color: "white", width: 22, height: 22, p: 0, bgcolor: "rgba(0,0,0,0.45)", "&:hover": { bgcolor: "rgba(0,0,0,0.65)" } }}
          >
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      )}
    </Box>
  );

  return card;
}
