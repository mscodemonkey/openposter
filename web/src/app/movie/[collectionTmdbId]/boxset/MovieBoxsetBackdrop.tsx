"use client";

import Box from "@mui/material/Box";

export default function MovieBoxsetBackdrop({ url }: { url: string }) {
  return (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "75vh",
        zIndex: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <Box
        component="img"
        src={url}
        alt=""
        sx={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", opacity: 0.3 }}
      />
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: (theme) =>
            `linear-gradient(to bottom, transparent 40%, ${theme.palette.background.default} 95%)`,
        }}
      />
    </Box>
  );
}
