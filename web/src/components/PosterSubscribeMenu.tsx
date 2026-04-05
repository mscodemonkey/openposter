"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import {
  subscribeTheme, unsubscribeTheme, isSubscribed,
  getFavouriteCreators, addFavouriteCreator, removeFavouriteCreator,
} from "@/lib/subscriptions";
import { issuerGetThemeSubscriptions } from "@/lib/issuer";
import { loadIssuerToken } from "@/lib/issuer_storage";

interface PosterSubscribeMenuProps {
  creatorId: string;
  creatorDisplayName: string;
  themeId?: string | null;
  themeName?: string | null;
  coverUrl?: string;
  nodeBase: string;
}

export default function PosterSubscribeMenu({
  creatorId, creatorDisplayName, themeId, themeName, coverUrl, nodeBase,
}: PosterSubscribeMenuProps) {
  const t = useTranslations("creator");
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [subTheme, setSubTheme] = useState(false);
  const [subCreator, setSubCreator] = useState(false);

  useEffect(() => {
    const tok = loadIssuerToken();
    setToken(tok);
    if (!tok) return;
    getFavouriteCreators(tok)
      .then((favs) => setSubCreator(favs.some((f) => f.creatorId === creatorId)))
      .catch(() => {});
    if (!themeId) return;
    issuerGetThemeSubscriptions(tok)
      .then((subs) => setSubTheme(isSubscribed(subs, themeId)))
      .catch(() => {});
  }, [creatorId, themeId]);

  const isSubscribedAny = subTheme || subCreator;

  const handleToggleTheme = useCallback(async () => {
    if (!themeId || !token) return;
    if (subTheme) {
      await unsubscribeTheme(token, themeId).catch(() => {});
      setSubTheme(false);
    } else {
      await subscribeTheme(token, {
        creatorId, creatorDisplayName, themeId,
        themeName: themeName ?? "Theme", coverUrl: coverUrl ?? null, nodeBase,
      }).catch(() => {});
      setSubTheme(true);
    }
    setAnchorEl(null);
  }, [subTheme, themeId, token, creatorId, creatorDisplayName, themeName, coverUrl, nodeBase]);

  const handleToggleCreator = useCallback(async () => {
    if (!token) return;
    if (subCreator) {
      await removeFavouriteCreator(token, creatorId).catch(() => {});
      setSubCreator(false);
    } else {
      await addFavouriteCreator(token, { creatorId, creatorDisplayName, nodeBase }).catch(() => {});
      setSubCreator(true);
    }
    setAnchorEl(null);
  }, [subCreator, token, creatorId, creatorDisplayName, nodeBase]);

  return (
    <>
      <IconButton
        size="small"
        onClick={(e) => { e.stopPropagation(); setAnchorEl(e.currentTarget); }}
        sx={{ p: 0.25, color: isSubscribedAny ? "warning.main" : "action.active", flexShrink: 0 }}
        aria-label={isSubscribedAny ? t("unsubscribe") : t("subscribe")}
      >
        {isSubscribedAny
          ? <StarIcon sx={{ fontSize: 12 }} />
          : <StarBorderIcon sx={{ fontSize: 12 }} />}
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {themeId && token && (
          <MenuItem onClick={() => void handleToggleTheme()} dense>
            {subTheme
              ? t("unsubscribeFromTheme", { themeName: themeName ?? "Theme" })
              : t("subscribeToTheme", { themeName: themeName ?? "Theme" })}
          </MenuItem>
        )}
        <MenuItem onClick={() => void handleToggleCreator()} dense>
          {subCreator
            ? t("unfavouriteCreator", { creatorName: creatorDisplayName })
            : t("favouriteCreator", { creatorName: creatorDisplayName })}
        </MenuItem>
      </Menu>
    </>
  );
}
