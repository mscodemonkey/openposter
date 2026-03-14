import Container from "@mui/material/Container";

import SectionedPosterView from "@/components/SectionedPosterView";

export default function BrowseLoading() {
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <SectionedPosterView items={[]} loading={true} showCreator />
    </Container>
  );
}
