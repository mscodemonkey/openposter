import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import { fetchPosters, BASE } from "@/lib/server-api";

import SectionedPosterView from "@/components/SectionedPosterView";

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  let items = await fetchPosters({ q, limit: 200 }).catch(() => null);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {items === null && (
        <Typography color="error" role="alert" sx={{ mb: 2 }}>
          Could not reach the indexer at {BASE}. Is it running?
        </Typography>
      )}
      <SectionedPosterView items={items ?? []} loading={false} showCreator />
    </Container>
  );
}
