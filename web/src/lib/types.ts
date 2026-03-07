export type PosterEntry = {
  poster_id: string;
  media: {
    type: string;
    tmdb_id?: number;
    show_tmdb_id?: number;
    title?: string;
    year?: number;
    season_number?: number;
    episode_number?: number;
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
    preview: { url: string; hash: string; mime: string };
    full: { url: string; hash: string; mime: string; access: string };
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
