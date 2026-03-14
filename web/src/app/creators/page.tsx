import { getTranslations } from "next-intl/server";

import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { fetchCreators } from "@/lib/server-api";
import CreatorsGrid from "./CreatorsGrid";

export default async function CreatorsPage() {
  const t = await getTranslations("creators");
  const tc = await getTranslations("common");
  const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_BASE_URL || "http://localhost:8090";
  const creators = await fetchCreators(200).catch(() => []);

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <div>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {tc("indexerLabel", { url: indexerUrl })}
          </Typography>
        </div>

        <CreatorsGrid creators={creators} />
      </Stack>
    </Container>
  );
}
