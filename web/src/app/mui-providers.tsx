"use client";

import { useEffect, useMemo, useState } from "react";
import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

import { makeTheme } from "./mui-theme";

export default function MuiProviders({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = useMemo(() => makeTheme(mounted && prefersDarkMode ? "dark" : "light"), [prefersDarkMode, mounted]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
