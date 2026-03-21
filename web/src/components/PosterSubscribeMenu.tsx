"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import {
  isSubscribed, subscribe, unsubscribe,
  isSubscribedToCreator, subscribeCreator, unsubscribeCreator,
} from "@/lib/subscriptions";

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
  const [subTheme, setSubTheme] = useState(() => (themeId ? isSubscribed(themeId) : false));
  const [subCreator, setSubCreator] = useState(() => isSubscribedToCreator(creatorId));

  const isSubscribedAny = subTheme || subCreator;

  const handleToggleTheme = useCallback(() => {
    if (!themeId) return;
    if (subTheme) {
      unsubscribe(themeId);
      setSubTheme(false);
    } else {
      subscribe({
        creatorId, creatorDisplayName, themeId,
        themeName: themeName ?? "Theme", coverUrl: coverUrl ?? null, nodeBase,
        subscribedAt: new Date().toISOString(),
      });
      setSubTheme(true);
    }
    setAnchorEl(null);
  }, [subTheme, themeId, creatorId, creatorDisplayName, themeName, coverUrl, nodeBase]);

  const handleToggleCreator = useCallback(() => {
    if (subCreator) {
      unsubscribeCreator(creatorId);
      setSubCreator(false);
    } else {
      subscribeCreator({ creatorId, creatorDisplayName, nodeBase });
      setSubCreator(true);
    }
    setAnchorEl(null);
  }, [subCreator, creatorId, creatorDisplayName, nodeBase]);

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
        {themeId && (
          <MenuItem onClick={handleToggleTheme} dense>
            {subTheme
              ? t("unsubscribeFromTheme", { themeName: themeName ?? "Theme" })
              : t("subscribeToTheme", { themeName: themeName ?? "Theme" })}
          </MenuItem>
        )}
        <MenuItem onClick={handleToggleCreator} dense>
          {subCreator
            ? t("unsubscribeFromCreator", { creatorName: creatorDisplayName })
            : t("subscribeToCreator", { creatorName: creatorDisplayName })}
        </MenuItem>
      </Menu>
    </>
  );
}
