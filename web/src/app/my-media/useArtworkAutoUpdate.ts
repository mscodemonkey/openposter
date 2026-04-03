"use client";

import { useEffect, useState } from "react";

import { getArtworkSettings } from "@/lib/artwork-tracking";

export function useArtworkAutoUpdate(nodeUrl: string, adminToken: string): boolean {
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getArtworkSettings(nodeUrl, adminToken).then((settings) => {
      if (!cancelled) {
        setAutoUpdateEnabled(settings.auto_update_artwork);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [nodeUrl, adminToken]);

  return autoUpdateEnabled;
}
