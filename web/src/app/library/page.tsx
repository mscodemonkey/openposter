"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";

import { POSTER_GRID_COLS, GRID_GAP } from "@/lib/grid-sizes";
import Typography from "@mui/material/Typography";

import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import PersonIcon from "@mui/icons-material/Person";
import TvIcon from "@mui/icons-material/Tv";

import ArtworkCardFrame from "@/components/ArtworkCardFrame";
import {
  getThemeSubscriptions,
  getCollectionSubscriptions,
  getTvShowSubscriptions,
  getFavouriteCreators,
  type ThemeSubscription,
  type CollectionSubscription,
  type TvShowSubscription,
  type FavouriteCreator,
} from "@/lib/subscriptions";
import { loadIssuerToken } from "@/lib/issuer_storage";

export default function LibraryPage() {
  const t = useTranslations("library");
  const [subs, setSubs] = useState<ThemeSubscription[]>([]);
  const [collectionSubs, setCollectionSubs] = useState<CollectionSubscription[]>([]);
  const [tvSubs, setTvSubs] = useState<TvShowSubscription[]>([]);
  const [favCreators, setFavCreators] = useState<FavouriteCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasToken, setHasToken] = useState(true);

  useEffect(() => {
    const token = loadIssuerToken();
    if (!token) {
      setHasToken(false);
      setLoading(false);
      return;
    }
    setHasToken(true);
    Promise.all([
      getThemeSubscriptions(token),
      getCollectionSubscriptions(token),
      getTvShowSubscriptions(token),
      getFavouriteCreators(token),
    ])
      .then(([themes, collections, tv, favs]) => {
        setSubs(themes);
        setCollectionSubs(collections);
        setTvSubs(tv);
        setFavCreators(favs);
      })
      .catch(() => {
        setSubs([]);
        setCollectionSubs([]);
        setTvSubs([]);
        setFavCreators([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <BookmarkIcon sx={{ color: "primary.main" }} />
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("following")}
          </Typography>
        </Stack>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : !hasToken ? (
          <Typography variant="body2" color="text.secondary">
            {t("signInToFollow")}
          </Typography>
        ) : (
          <Stack spacing={4}>
            {/* Favourite Creators */}
            {favCreators.length > 0 && (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
                  {t("favouriteCreators")}
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                  {favCreators.map((fav) => (
                    <Box key={fav.creatorId}>
                      <ArtworkCardFrame
                        media={
                          <Box sx={{ aspectRatio: "2 / 3", bgcolor: "action.hover", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <PersonIcon sx={{ color: "text.disabled", fontSize: "2rem" }} />
                          </Box>
                        }
                        title={fav.creatorDisplayName}
                        href={`/creator/${encodeURIComponent(fav.creatorId)}`}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Themes */}
            {subs.length > 0 && (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
                  {t("themes")}
                </Typography>
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
              </Box>
            )}

            {/* Collections */}
            {collectionSubs.length > 0 && (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
                  {t("collections")}
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                  {collectionSubs.map((sub, i) => (
                    <Box key={`${sub.collectionTmdbId}-${sub.themeId}-${i}`}>
                      <ArtworkCardFrame
                        media={
                          <Box sx={{ aspectRatio: "2 / 3", bgcolor: "action.hover", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <LayersOutlinedIcon sx={{ color: "text.disabled", fontSize: "2rem" }} />
                          </Box>
                        }
                        title={sub.collectionName}
                        subtitle={`${sub.themeName}${sub.language ? ` · ${sub.language.toUpperCase()}` : ""}`}
                        href={`/movie/${encodeURIComponent(sub.collectionTmdbId)}/boxset`}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* TV Shows */}
            {tvSubs.length > 0 && (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
                  {t("tvShows")}
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: POSTER_GRID_COLS, gap: GRID_GAP }}>
                  {tvSubs.map((sub, i) => (
                    <Box key={`${sub.showTmdbId}-${sub.themeId}-${i}`}>
                      <ArtworkCardFrame
                        media={
                          <Box sx={{ aspectRatio: "2 / 3", bgcolor: "action.hover", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <TvIcon sx={{ color: "text.disabled", fontSize: "2rem" }} />
                          </Box>
                        }
                        title={sub.showName}
                        subtitle={`${sub.themeName}${sub.language ? ` · ${sub.language.toUpperCase()}` : ""}`}
                        href={`/tv/${encodeURIComponent(sub.showTmdbId)}/boxset`}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Empty state */}
            {subs.length === 0 && collectionSubs.length === 0 && tvSubs.length === 0 && favCreators.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                {t("noSubscriptions")}
              </Typography>
            )}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
