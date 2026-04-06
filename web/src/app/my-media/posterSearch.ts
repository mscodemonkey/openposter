import type { PosterEntry } from "@/lib/types";

function hasPreview(poster: PosterEntry): boolean {
  return typeof poster.assets?.preview?.url === "string" && poster.assets.preview.url.length > 0;
}

function canLoadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function hasRenderableArtwork(poster: PosterEntry): Promise<boolean> {
  const previewUrl = poster.assets?.preview?.url?.trim();
  const fullUrl = poster.assets?.full?.url?.trim();

  if (previewUrl && await canLoadImage(previewUrl)) return true;
  if (fullUrl && fullUrl !== previewUrl && await canLoadImage(fullUrl)) return true;
  return false;
}

export async function loadPosterSearchResults(searchUrl: string): Promise<PosterEntry[]> {
  try {
    const response = await fetch(searchUrl);
    const data = (await response.json()) as { results?: PosterEntry[] };
    const candidates = (data.results ?? []).filter(hasPreview);
    const verdicts = await Promise.all(candidates.map((poster) => hasRenderableArtwork(poster)));
    return candidates.filter((_, index) => verdicts[index]);
  } catch {
    return [];
  }
}
