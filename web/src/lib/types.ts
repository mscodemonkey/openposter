export type CreatorTheme = {
  theme_id: string;
  creator_id: string;
  name: string;
  description?: string | null;
  cover_url?: string | null;
  cover_hash?: string | null;
  poster_count?: number;
  created_at: string;
  updated_at: string;
};

export type PosterEntry = {
  poster_id: string;
  /** Artwork kind: "poster" | "background" | "logo" | "banner" | "thumb". Defaults to "poster" if absent. */
  kind?: string;
  /** BCP-47 language tag (e.g. "en", "ja") or null/undefined = language-neutral */
  language?: string | null;
  /** True = published (visible to indexers/public), false/undefined = draft */
  published?: boolean;
  media: {
    type: string;
    tmdb_id?: number;
    show_tmdb_id?: number;
    collection_tmdb_id?: number | null;
    title?: string;
    year?: number;
    season_number?: number;
    episode_number?: number;
    theme_id?: string | null;
  };
  creator: {
    creator_id: string;
    display_name: string;
    home_node: string;
  };
  // Optional extension: creator-authored related links
  links?: Array<{
    rel: string;
    href: string;
    title?: string;
    media?: { type?: string; tmdb_id?: number };
  }> | null;
  assets: {
    preview: { url: string; hash: string; mime: string; language?: string | null };
    full: { url: string; hash: string; mime: string; access: string; language?: string | null };
  };
};

export type SearchResponse = {
  results: PosterEntry[];
  next_cursor: string | null;
};

export type IndexerNodesResponse = {
  nodes: Array<{
    url: string;
    status: string;
    last_crawled_at: string | null;
    last_seen_up: string | null;
    down_since: string | null;
    consecutive_failures: number;
  }>;
};
