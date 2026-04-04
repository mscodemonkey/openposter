"use client";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";

import { POSTER_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";
import Typography from "@mui/material/Typography";

import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import BookmarkIcon from "@mui/icons-material/Bookmark";

import ArtworkCardFrame from "@/components/ArtworkCardFrame";
import { getSubscriptions, type ThemeSubscription } from "@/lib/subscriptions";

export default function LibraryPage() {
  const t = useTranslations("library");
  const subs = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      return () => window.removeEventListener("storage", onStoreChange);
    },
    () => getSubscriptions(),
    () => [] as ThemeSubscription[],
  );

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <BookmarkIcon sx={{ color: "primary.main" }} />
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("following")}
          </Typography>
        </Stack>

        {subs.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t("noSubscriptions")}
          </Typography>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
            {subs.map((sub) => (
              <Box key={sub.themeId}>
                <ArtworkCardFrame
                  media={
                    <Box sx={{ aspectRatio: "2 / 3", bgcolor: "action.hover", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {sub.coverUrl ? (
                        <Box
                          component="img"
                          src={sub.coverUrl}
                          alt={sub.themeName}
                          sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      ) : (
                        <LayersOutlinedIcon sx={{ color: "text.disabled", fontSize: "2rem" }} />
                      )}
                    </Box>
                  }
                  title={sub.themeName}
                  subtitle={sub.creatorDisplayName}
                  href={`/creator/${encodeURIComponent(sub.creatorId)}/themes/${encodeURIComponent(sub.themeId)}`}
                />
              </Box>
            ))}
          </Box>
        )}
      </Stack>
    </Container>
  );
}
