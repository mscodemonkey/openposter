"use client";

import { createTheme } from "@mui/material/styles";

export function makeTheme(mode: "light" | "dark") {
  return createTheme({
    palette: {
      mode,
    },
    components: {
      MuiChip: {
        styleOverrides: {
          // Force lineHeight: 1 on chip labels so font descenders/ascenders
          // don't create uneven visual padding at different font sizes.
          label: { lineHeight: 1 },
        },
      },
    },
  });
}
