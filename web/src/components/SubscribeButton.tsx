"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import BookmarkIcon from "@mui/icons-material/Bookmark";

import { subscribeTheme, unsubscribeTheme, isSubscribed } from "@/lib/subscriptions";
import { issuerGetThemeSubscriptions } from "@/lib/issuer";
import { loadIssuerToken } from "@/lib/issuer_storage";

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
  const [token, setToken] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const tok = loadIssuerToken();
    setToken(tok);
    if (!tok) return;
    issuerGetThemeSubscriptions(tok)
      .then((subs) => setSubscribed(isSubscribed(subs, themeId)))
      .catch(() => {});
  }, [themeId]);

  if (!token) return null;

  async function toggle() {
    if (!token || loading) return;
    setLoading(true);
    try {
      if (subscribed) {
        await unsubscribeTheme(token, themeId);
        setSubscribed(false);
      } else {
        await subscribeTheme(token, {
          creatorId,
          creatorDisplayName,
          themeId,
          themeName,
          coverUrl,
          nodeBase,
        });
        setSubscribed(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Tooltip title={subscribed ? t("unsubscribe") : t("subscribe")}>
      <IconButton
        size="small"
        onClick={toggle}
        aria-label={subscribed ? t("unsubscribe") : t("subscribe")}
        disabled={loading}
      >
        {loading ? (
          <CircularProgress size="1rem" />
        ) : subscribed ? (
          <BookmarkIcon sx={{ fontSize: "1rem" }} color="primary" />
        ) : (
          <BookmarkBorderIcon sx={{ fontSize: "1rem" }} />
        )}
      </IconButton>
    </Tooltip>
  );
}
