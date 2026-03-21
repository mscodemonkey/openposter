import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

/**
 * The OpenPoster app icon.
 * Uses the official poster-stack SVG logo for sizes < 32px,
 * and a bold "O" text fallback for larger sizes.
 */
export default function OPLogo({ size = 24 }: { size?: number }) {
  if (size < 32) {
    return (
      <Box
        component="img"
        src="/op-logo-small.svg"
        alt="OpenPoster"
        sx={{ width: size, height: size, flexShrink: 0, display: "block" }}
      />
    );
  }

  // Larger sizes: text-based fallback
  return (
    <Box
      sx={{
        width: size,
        height: size,
        bgcolor: "#ff1a1a",
        borderRadius: `${Math.round(size * 0.2)}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Typography
        component="span"
        sx={{
          color: "#fff",
          fontWeight: 900,
          fontFamily: "monospace",
          fontSize: size * 0.62,
          lineHeight: 1,
          userSelect: "none",
          letterSpacing: "-0.05em",
        }}
      >
        O
      </Typography>
    </Box>
  );
}
