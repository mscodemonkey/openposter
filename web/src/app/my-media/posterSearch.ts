import type { PosterEntry } from "@/lib/types";

function hasPreview(poster: PosterEntry): boolean {
  return typeof poster.assets?.preview?.url === "string" && poster.assets.preview.url.length > 0;
}

export async function loadPosterSearchResults(searchUrl: string): Promise<PosterEntry[]> {
  try {
    const response = await fetch(searchUrl);
    const data = (await response.json()) as { results?: PosterEntry[] };
    return (data.results ?? []).filter(hasPreview);
  } catch {
    return [];
  }
}
