"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import BookmarkIcon from "@mui/icons-material/Bookmark";

import { isSubscribed, subscribe, unsubscribe } from "@/lib/subscriptions";

interface SubscribeButtonProps {
  themeId: string;
  themeName: string;
  coverUrl: string | null;
  creatorId: string;
  creatorDisplayName: string;
  nodeBase: string;
}

export default function SubscribeButton({
  themeId,
  themeName,
  coverUrl,
  creatorId,
  creatorDisplayName,
  nodeBase,
}: SubscribeButtonProps) {
  const t = useTranslations("creator");
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    setSubscribed(isSubscribed(themeId));
  }, [themeId]);

  function toggle() {
    if (subscribed) {
      unsubscribe(themeId);
      setSubscribed(false);
    } else {
      subscribe({
        creatorId,
        creatorDisplayName,
        themeId,
        themeName,
        coverUrl,
        nodeBase,
        subscribedAt: new Date().toISOString(),
      });
      setSubscribed(true);
    }
  }

  return (
    <Tooltip title={subscribed ? t("unsubscribe") : t("subscribe")}>
      <IconButton size="small" onClick={toggle} aria-label={subscribed ? t("unsubscribe") : t("subscribe")}>
        {subscribed ? (
          <BookmarkIcon sx={{ fontSize: "1rem" }} color="primary" />
        ) : (
          <BookmarkBorderIcon sx={{ fontSize: "1rem" }} />
        )}
      </IconButton>
    </Tooltip>
  );
}
