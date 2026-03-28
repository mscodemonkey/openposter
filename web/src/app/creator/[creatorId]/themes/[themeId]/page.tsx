import { getTranslations } from "next-intl/server";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";

import { fetchCreatorTheme, fetchCreatorName } from "@/lib/server-api";
import SectionedPosterView from "@/components/SectionedPosterView";
import SubscribeButton from "../../SubscribeButton";

export default async function ThemePage({
  params,
}: {
  params: Promise<{ creatorId: string; themeId: string }>;
}) {
  const { creatorId, themeId } = await params;
  const t = await getTranslations("creator");

  const [displayName, data] = await Promise.all([
    fetchCreatorName(creatorId),
    fetchCreatorTheme(creatorId, themeId).catch(() => null),
  ]);

  if (!data) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography color="text.secondary">{t("themeNotFound")}</Typography>
      </Container>
    );
  }

  const { theme, results } = data;
  const homeNode = results[0]?.creator.home_node ?? "";

  return (
    <Box>
      {/* Theme cover hero */}
      <Box
        sx={{
          position: "relative",
          height: { xs: 160, sm: 220 },
          bgcolor: "action.hover",
          overflow: "hidden",
        }}
      >
        {theme.cover_url ? (
          <Box
            component="img"
            src={theme.cover_url}
            alt=""
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "grayscale(0.75)" }}
          />
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <LayersOutlinedIcon sx={{ color: "text.disabled", fontSize: "4rem" }} />
          </Box>
        )}
        <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)" }} />
      </Box>

      <Container maxWidth="lg" sx={{ pb: 4 }}>
        {/* Theme identity */}
        <Stack direction="row" spacing={2} alignItems="flex-end" justifyContent="space-between" sx={{ mt: 2, mb: 3 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {theme.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {displayName || creatorId}
              {" · "}
              {t("posterCountShort", { count: results.length })}
            </Typography>
            {theme.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {theme.description}
              </Typography>
            )}
          </Box>
          <SubscribeButton
            themeId={themeId}
            themeName={theme.name}
            coverUrl={theme.cover_url ?? null}
            creatorId={creatorId}
            creatorDisplayName={displayName ?? creatorId}
            nodeBase={homeNode}
          />
        </Stack>

        <SectionedPosterView items={results} loading={false} showCreator={false} />
      </Container>
    </Box>
  );
}
