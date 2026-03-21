/**
 * Shared grid layout constants for poster and episode grids.
 *
 * All grids reference CSS variables so changing the "Poster size" setting
 * in Settings updates every grid in the app without re-renders.
 */

export type PosterSize = "small" | "medium" | "large";

export const POSTER_WIDTHS: Record<PosterSize, number> = {
  small: 140,
  medium: 180,
  large: 240,
};

export const EPISODE_WIDTHS: Record<PosterSize, number> = {
  small: 210,
  medium: 280,
  large: 360,
};

export const BACKDROP_WIDTHS: Record<PosterSize, number> = {
  small: 260,
  medium: 340,
  large: 440,
};

/** CSS gridTemplateColumns for standard poster (2:3) grids */
export const POSTER_GRID_COLS = "repeat(auto-fill, var(--op-poster-width, 180px))";

/** CSS gridTemplateColumns for episode (16:9) grids */
export const EPISODE_GRID_COLS = "repeat(auto-fill, var(--op-episode-width, 280px))";

/** CSS gridTemplateColumns for backdrop (16:9, wider) grids */
export const BACKDROP_GRID_COLS = "repeat(auto-fill, var(--op-backdrop-width, 340px))";

/** MUI spacing gap between cards */
export const GRID_GAP = 2;

const STORAGE_KEY = "op-poster-size";

export function getPosterSize(): PosterSize {
  if (typeof window === "undefined") return "medium";
  return (localStorage.getItem(STORAGE_KEY) as PosterSize) ?? "medium";
}

export function applyPosterSize(size: PosterSize): void {
  const root = document.documentElement;
  root.style.setProperty("--op-poster-width", `${POSTER_WIDTHS[size]}px`);
  root.style.setProperty("--op-episode-width", `${EPISODE_WIDTHS[size]}px`);
  root.style.setProperty("--op-backdrop-width", `${BACKDROP_WIDTHS[size]}px`);
  localStorage.setItem(STORAGE_KEY, size);
}
