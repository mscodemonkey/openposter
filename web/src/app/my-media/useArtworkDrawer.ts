"use client";

import { useCallback, useRef, useState } from "react";

import type { PosterEntry } from "@/lib/types";

import { loadPosterSearchResults } from "./posterSearch";

type DrawerLoadOptions = {
  mapResults?: (results: PosterEntry[]) => PosterEntry[];
};

export function useArtworkDrawer() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPosters, setDrawerPosters] = useState<PosterEntry[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const loadIdRef = useRef(0);

  const closeDrawer = useCallback(() => {
    loadIdRef.current += 1;
    setDrawerOpen(false);
  }, []);

  const openDrawer = useCallback((searchUrl?: string | null, options?: DrawerLoadOptions) => {
    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;

    setDrawerPosters([]);
    setDrawerOpen(true);

    if (!searchUrl) {
      setDrawerLoading(false);
      return;
    }

    setDrawerLoading(true);
    loadPosterSearchResults(searchUrl)
      .then((results) => {
        if (loadIdRef.current !== loadId) return;
        setDrawerPosters(options?.mapResults ? options.mapResults(results) : results);
      })
      .finally(() => {
        if (loadIdRef.current === loadId) {
          setDrawerLoading(false);
        }
      });
  }, []);

  return {
    drawerOpen,
    drawerPosters,
    drawerLoading,
    closeDrawer,
    openDrawer,
    setDrawerPosters,
  };
}
