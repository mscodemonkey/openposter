import Link from "next/link";
import { getTranslations } from "next-intl/server";

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";

import { POSTER_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";
import Typography from "@mui/material/Typography";

import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import PersonIcon from "@mui/icons-material/Person";

import { fetchCreatorName, fetchCreatorPosters, fetchCreatorProfile, fetchCreatorThemes } from "@/lib/server-api";
import SectionedPosterView from "@/components/SectionedPosterView";
import SubscribeButton from "@/components/SubscribeButton";
import type { CreatorTheme } from "@/lib/types";

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

  // Derive home node from first poster
  const homeNode = allItems[0]?.creator.home_node ?? null;

  const [profile, themes] = await Promise.all([
    homeNode ? fetchCreatorProfile(creatorId, homeNode) : Promise.resolve({ backdrop_url: null }),
    homeNode ? fetchCreatorThemes(creatorId, homeNode) : Promise.resolve([] as CreatorTheme[]),
  ]);

  return (
    <Box>
      {/* Backdrop hero */}
      <Box
        sx={{
          position: "relative",
          height: { xs: 160, sm: 220 },
          bgcolor: "action.hover",
          overflow: "hidden",
        }}
      >
        {profile.backdrop_url && (
          <Box
            component="img"
            src={profile.backdrop_url}
            alt=""
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "grayscale(0.75)" }}
          />
        )}
        {/* Gradient overlay for readability */}
        <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)" }} />
      </Box>

      <Container maxWidth="lg" sx={{ pb: 4 }}>
        {/* Creator identity — overlapping the bottom of the backdrop */}
        <Stack direction="row" spacing={2.5} alignItems="flex-end" sx={{ mt: -5, mb: 3, position: "relative" }}>
          <Avatar
            sx={{
              width: 80,
              height: 80,
              bgcolor: "primary.main",
              border: "3px solid",
              borderColor: "background.paper",
              flexShrink: 0,
            }}
          >
            <PersonIcon sx={{ fontSize: 44 }} />
          </Avatar>
          <Box sx={{ pb: 0.5 }}>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {displayName || creatorId}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("posterCount", { id: creatorId, count: allItems.length })}
            </Typography>
          </Box>
        </Stack>

        <Stack spacing={4}>
          {/* Themes */}
          {themes.length > 0 && (
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>{t("themes")}</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                {themes.map((theme) => (
                  <Box key={theme.theme_id}>
                    <Card sx={{ height: "100%" }}>
                      <Link href={`/creator/${encodeURIComponent(creatorId)}/themes/${encodeURIComponent(theme.theme_id)}`} style={{ display: "block", textDecoration: "none" }}>
                        <Box
                          sx={{
                            aspectRatio: "2 / 3",
                            bgcolor: "action.hover",
                            overflow: "hidden",
                          }}
                        >
                          {theme.cover_url ? (
                            <Box component="img" src={theme.cover_url} alt={theme.name} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          ) : (
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                              <LayersOutlinedIcon sx={{ color: "text.disabled", fontSize: "2rem" }} />
                            </Box>
                          )}
                        </Box>
                      </Link>
                      <Box sx={{ px: 1.5, pt: 0.75, pb: 1 }}>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", fontWeight: 700 }}>
                          {theme.name}
                        </Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="space-between" sx={{ mt: 0.5 }}>
                          <Chip
                            label={t("posterCountShort", { count: theme.poster_count ?? 0 })}
                            size="small"
                            sx={{ height: 18, fontSize: "0.6rem" }}
                          />
                          <SubscribeButton
                            themeId={theme.theme_id}
                            themeName={theme.name}
                            coverUrl={theme.cover_url ?? null}
                            creatorId={creatorId}
                            creatorDisplayName={displayName ?? creatorId}
                            nodeBase={homeNode ?? ""}
                          />
                        </Stack>
                      </Box>
                    </Card>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {/* All posters */}
          <SectionedPosterView items={allItems} loading={false} showCreator={false} />
        </Stack>
      </Container>
    </Box>
  );
}
