import { notFound } from "next/navigation";

import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import { fetchPoster, fetchSimilarByTmdb, fetchMoreByCreator, fetchTvShowInfo } from "@/lib/server-api";
import PosterView from "./PosterView";

export default async function PosterPage({
  params,
}: {
  params: Promise<{ posterId: string }>;
}) {
  const { posterId } = await params;
  const decodedPosterId = (() => {
    try {
      return decodeURIComponent(posterId);
    } catch {
      return posterId;
    }
  })();

  const poster = await fetchPoster(decodedPosterId);
  if (!poster) notFound();

  const similarIds = new Set<string>();

  const [similarByTmdb, tvShowInfo] = await Promise.all([
    fetchSimilarByTmdb(poster).then((results) => {
      results.forEach((p) => similarIds.add(p.poster_id));
      return results;
    }),
    (poster.media.type === "episode" || poster.media.type === "season") && poster.media.show_tmdb_id != null
      ? fetchTvShowInfo(poster.media.show_tmdb_id)
      : Promise.resolve({ title: null, backdropUrl: null }),
  ]);

  const moreByCreator = await fetchMoreByCreator(poster, similarIds);

  return (
    <PosterView
      poster={poster}
      tvShowTitle={tvShowInfo.title}
      backdropUrl={tvShowInfo.backdropUrl}
      similarByTmdb={similarByTmdb}
      moreByCreator={moreByCreator}
    />
  );
}
