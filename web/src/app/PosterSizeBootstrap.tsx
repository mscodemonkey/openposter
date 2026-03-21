"use client";

import { useEffect } from "react";
import { applyPosterSize, getPosterSize } from "@/lib/grid-sizes";

/** Reads the stored poster-size preference and applies CSS variables on mount. */
export default function PosterSizeBootstrap() {
  useEffect(() => {
    applyPosterSize(getPosterSize());
  }, []);
  return null;
}
