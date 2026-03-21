"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";

import { POSTER_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";
import Typography from "@mui/material/Typography";

import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import BookmarkIcon from "@mui/icons-material/Bookmark";

import { getSubscriptions, type ThemeSubscription } from "@/lib/subscriptions";

export default function LibraryPage() {
  const t = useTranslations("library");
  const [subs, setSubs] = useState<ThemeSubscription[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSubs(getSubscriptions());
    setMounted(true);
  }, []);

  if (!mounted) return null;

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
                <Card>
                  <CardActionArea
                    component={Link}
                    href={`/creator/${encodeURIComponent(sub.creatorId)}/themes/${encodeURIComponent(sub.themeId)}`}
                  >
                    <Box sx={{ aspectRatio: "2 / 3", bgcolor: "action.hover", overflow: "hidden" }}>
                      {sub.coverUrl ? (
                        <Box
                          component="img"
                          src={sub.coverUrl}
                          alt={sub.themeName}
                          sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      ) : (
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                          <LayersOutlinedIcon sx={{ color: "text.disabled", fontSize: "2rem" }} />
                        </Box>
                      )}
                    </Box>
                    <Box sx={{ px: 1.5, pt: 0.75, pb: 1 }}>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", fontWeight: 700 }}>
                        {sub.themeName}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" noWrap sx={{ display: "block" }}>
                        {sub.creatorDisplayName}
                      </Typography>
                    </Box>
                  </CardActionArea>
                </Card>
              </Box>
            ))}
          </Box>
        )}
      </Stack>
    </Container>
  );
}
