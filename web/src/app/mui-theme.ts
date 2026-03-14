"use client";

import { createTheme } from "@mui/material/styles";

// Slightly "Apple-ish" tweaks: softer rounding, subtle borders, system font stack.
export function makeTheme(mode: "light" | "dark") {
  return createTheme({
    palette: {
      mode,
      background: {
        default: mode === "light" ? "#f5f5f7" : "#0b0b0c",
        paper: mode === "light" ? "#ffffff" : "#141416",
      },
    },
    shape: {
      borderRadius: 12,
    },
    typography: {
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          "*:focus-visible": {
            outline: "2px solid",
            outlineColor: mode === "light" ? "#1976d2" : "#90caf9",
            outlineOffset: "2px",
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            border: mode === "light" ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.08)",
          },
        },
      },
      MuiButton: {
        defaultProps: {
          variant: "contained",
        },
      },
    },
  });
}
