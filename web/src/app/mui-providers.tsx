"use client";

import { useEffect, useMemo, useState } from "react";
import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";

import { makeTheme } from "./mui-theme";

export default function MuiProviders({ children }: { children: React.ReactNode }) {
  // Read the OS colour-scheme preference only after mount so that the server
  // render and the initial client hydration both use "light" (no Emotion class
  // mismatch). The theme switches after hydration, which may cause a brief
  // light→dark flash for dark-mode users — the correct long-term solution is
  // CssVarsProvider, but that's a larger refactor.
  const [prefersDarkMode, setPrefersDarkMode] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setPrefersDarkMode(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersDarkMode(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const theme = useMemo(() => makeTheme(prefersDarkMode ? "dark" : "light"), [prefersDarkMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
