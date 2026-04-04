import type { Theme } from "@mui/material/styles";

export function getCardSurfaceShadow(theme: Theme) {
  return theme.palette.mode === "light"
    ? "0 10px 28px rgba(15,23,42,0.16), 0 3px 10px rgba(15,23,42,0.12), 0 1px 2px rgba(15,23,42,0.08)"
    : "0 8px 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4)";
}

export const cardMediaSurfaceSx = {
  position: "relative",
  borderRadius: 1,
  overflow: "hidden",
  boxShadow: (theme: Theme) => getCardSurfaceShadow(theme),
} as const;
