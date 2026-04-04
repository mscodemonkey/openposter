"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import ImageIcon from "@mui/icons-material/Image";

interface ArtworkPlaceholderProps {
  aspectRatio: string;
  alt: string;
  imageUrl?: string | null;
  fit?: "cover" | "contain";
  source?: string | null;
  checkerboard?: boolean;
}

export default function ArtworkPlaceholder({
  aspectRatio,
  alt,
  imageUrl,
  fit = "cover",
  source,
  checkerboard = true,
}: ArtworkPlaceholderProps) {
  const hasImage = Boolean(imageUrl);
  const label = source ? `Placeholder from ${source}` : "Missing artwork";

  return (
    <Box
      sx={{
        aspectRatio,
        position: "relative",
        overflow: "hidden",
        borderRadius: 1,
        background: (theme) =>
          !checkerboard || hasImage
            ? undefined
            : theme.palette.mode === "light"
              ? "repeating-conic-gradient(#ececec 0% 25%, #dcdcdc 0% 50%) 0 0 / 20px 20px"
              : "repeating-conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%) 0 0 / 20px 20px",
        bgcolor: "background.paper",
      }}
    >
      {hasImage && (
        <Box
          component="img"
          src={imageUrl!}
          alt={alt}
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: fit,
            display: "block",
            filter: "grayscale(0.75)",
            opacity: 0.2,
          }}
        />
      )}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: source ? 0.5 : 0.75,
          pointerEvents: "none",
          px: 1,
        }}
      >
        <ImageIcon
          sx={{
            fontSize: "2rem",
            color: (theme) => theme.palette.mode === "light" ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.7)",
          }}
        />
        <Typography
          sx={{
            fontSize: "0.6rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            lineHeight: 1,
            color: (theme) => theme.palette.mode === "light" ? "rgba(0,0,0,0.54)" : "rgba(255,255,255,0.7)",
            textAlign: "center",
          }}
        >
          {label}
        </Typography>
      </Box>
    </Box>
  );
}
