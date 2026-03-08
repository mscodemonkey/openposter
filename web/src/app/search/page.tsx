"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Search page deprecated.
 *
 * We keep this route so old links continue to work, but we redirect to /browse
 * (which now hosts both quick + advanced search).
 */
export default function SearchPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const out = new URLSearchParams();

      const q = sp.get("q");
      const tmdbId = sp.get("tmdb_id");
      const creatorId = sp.get("creator_id");
      const creatorQ = sp.get("creator_q");
      const type = sp.get("type");

      if (q) out.set("q", q);
      if (tmdbId) out.set("tmdb_id", tmdbId);
      if (creatorId) out.set("creator_id", creatorId);
      if (creatorQ) out.set("creator_q", creatorQ);
      // Browse uses media_type in the shareable URL.
      if (type) out.set("media_type", type);

      const qs = out.toString();
      router.replace(qs ? `/browse?${qs}` : "/browse");
    } catch {
      router.replace("/browse");
    }
  }, [router]);

  return null;
}
