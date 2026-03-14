import { getTranslations } from "next-intl/server";

import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import { fetchTvBoxset } from "@/lib/server-api";
import TvBoxsetContent from "./TvBoxsetContent";

export default async function TvBoxsetPage({
  params,
}: {
  params: Promise<{ showTmdbId: string }>;
}) {
  const { showTmdbId } = await params;
  const t = await getTranslations("tvBoxset");

  const data = await fetchTvBoxset(showTmdbId).catch(() => null);

  if (!data) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography color="text.secondary">{t("tvBoxSet")}</Typography>
      </Container>
    );
  }

  return <TvBoxsetContent data={data} />;
}
