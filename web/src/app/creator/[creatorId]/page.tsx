import { getTranslations } from "next-intl/server";

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import PersonIcon from "@mui/icons-material/Person";

import { fetchCreatorName, fetchCreatorPosters } from "@/lib/server-api";
import SectionedPosterView from "@/components/SectionedPosterView";

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ creatorId: string }>;
}) {
  const { creatorId } = await params;
  const t = await getTranslations("creator");

  const [displayName, allItems] = await Promise.all([
    fetchCreatorName(creatorId),
    fetchCreatorPosters(creatorId).catch(() => []),
  ]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={4}>
        <Stack direction="row" spacing={2.5} alignItems="center">
          <Avatar sx={{ width: 72, height: 72, bgcolor: "primary.main" }}>
            <PersonIcon sx={{ fontSize: 40 }} />
          </Avatar>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {displayName || creatorId}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("posterCount", { id: creatorId, count: allItems.length })}
            </Typography>
          </Box>
        </Stack>

        <SectionedPosterView items={allItems} loading={false} showCreator={false} />
      </Stack>
    </Container>
  );
}
