"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Typography from "@mui/material/Typography";

import { loadIssuerToken } from "@/lib/issuer_storage";
import {
  getCollectionSubscriptions,
  getTvShowSubscriptions,
  subscribeCollection,
  subscribeTvShow,
  unsubscribeCollection,
  unsubscribeTvShow,
  getPreferredLanguage,
  savePreferredLanguage,
  type CollectionSubscription,
  type TvShowSubscription,
} from "@/lib/subscriptions";

export interface SubscribeEntityButtonProps {
  entityType: "collection" | "tv";
  entityId: string;
  entityName: string;
  availableThemes: Array<{ themeId: string; themeName: string; nodeBase: string; creatorName: string }>;
  availableLanguages: string[];
}

type AnySubscription = CollectionSubscription | TvShowSubscription;

function getEntityIdFromSub(entityType: "collection" | "tv", sub: AnySubscription): string {
  if (entityType === "collection") return (sub as CollectionSubscription).collectionTmdbId;
  return (sub as TvShowSubscription).showTmdbId;
}

// ─── Unsubscribe menu item — module-level to avoid remount on parent re-render ─

function UnsubscribeMenuItem({
  sub,
  entityType,
  onUnsubscribe,
}: {
  sub: AnySubscription;
  entityType: "collection" | "tv";
  onUnsubscribe: (sub: AnySubscription) => void;
}) {
  const t = useTranslations("subscribeEntity");
  const label = `${sub.themeName || sub.themeId}${sub.language ? ` · ${sub.language.toUpperCase()}` : ""}`;
  return (
    <MenuItem onClick={() => onUnsubscribe(sub)} dense>
      <ListItemText
        primary={t("unsubscribe")}
        secondary={label}
      />
    </MenuItem>
  );
}

export default function SubscribeEntityButton({
  entityType,
  entityId,
  entityName,
  availableThemes,
  availableLanguages,
}: SubscribeEntityButtonProps) {
  const t = useTranslations("subscribeEntity");

  const [token, setToken] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<AnySubscription[]>([]);
  const [preferredLanguage, setPreferredLanguage] = useState<string | null>(null);

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Dialog form state
  const [selectedThemeId, setSelectedThemeId] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("__textless__");
  const [saveAsPreferred, setSaveAsPreferred] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const tok = loadIssuerToken();
    setToken(tok);
    if (!tok) return;

    const fetchSubs =
      entityType === "collection"
        ? getCollectionSubscriptions(tok)
        : getTvShowSubscriptions(tok);

    fetchSubs
      .then((subs) => {
        const filtered = subs.filter((s) => getEntityIdFromSub(entityType, s) === entityId);
        setSubscriptions(filtered);
      })
      .catch(() => {});

    getPreferredLanguage(tok)
      .then(setPreferredLanguage)
      .catch(() => {});
  }, [entityType, entityId]);

  const isSubscribed = subscriptions.length > 0;

  const handleButtonClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      if (isSubscribed) {
        setMenuAnchor(e.currentTarget);
      } else {
        // Pre-fill form defaults
        if (availableThemes.length > 0) setSelectedThemeId(availableThemes[0].themeId);
        const langDefault =
          preferredLanguage && availableLanguages.includes(preferredLanguage)
            ? preferredLanguage
            : availableLanguages[0] ?? "__textless__";
        setSelectedLanguage(langDefault ?? "__textless__");
        setSaveAsPreferred(false);
        setDialogOpen(true);
      }
    },
    [isSubscribed, availableThemes, availableLanguages, preferredLanguage],
  );

  const handleUnsubscribe = useCallback(
    async (sub: AnySubscription) => {
      setMenuAnchor(null);
      if (!token) return;
      try {
        if (entityType === "collection") {
          await unsubscribeCollection(token, entityId, sub.themeId, sub.language);
        } else {
          await unsubscribeTvShow(token, entityId, sub.themeId, sub.language);
        }
        setSubscriptions((prev) => prev.filter((s) => s !== sub));
      } catch {
        // silently ignore
      }
    },
    [token, entityType, entityId],
  );

  const handleSubscribe = useCallback(async () => {
    if (!token || !selectedThemeId) return;
    setSaving(true);
    try {
      const theme = availableThemes.find((t) => t.themeId === selectedThemeId);
      const language = selectedLanguage === "__textless__" ? null : selectedLanguage;

      if (saveAsPreferred && language !== null) {
        await savePreferredLanguage(token, language).catch(() => {});
        setPreferredLanguage(language);
      }

      if (entityType === "collection") {
        await subscribeCollection(token, {
          collectionTmdbId: entityId,
          collectionName: entityName,
          themeId: selectedThemeId,
          themeName: theme?.themeName ?? selectedThemeId,
          language,
          nodeBase: theme?.nodeBase ?? "",
        });
      } else {
        await subscribeTvShow(token, {
          showTmdbId: entityId,
          showName: entityName,
          themeId: selectedThemeId,
          themeName: theme?.themeName ?? selectedThemeId,
          language,
          nodeBase: theme?.nodeBase ?? "",
        });
      }

      // Re-fetch to update state
      const fetchSubs =
        entityType === "collection"
          ? getCollectionSubscriptions(token)
          : getTvShowSubscriptions(token);
      const subs = await fetchSubs;
      setSubscriptions(subs.filter((s) => getEntityIdFromSub(entityType, s) === entityId));
      setDialogOpen(false);
    } catch {
      // silently ignore
    } finally {
      setSaving(false);
    }
  }, [
    token,
    selectedThemeId,
    selectedLanguage,
    saveAsPreferred,
    entityType,
    entityId,
    entityName,
    availableThemes,
  ]);

  if (!token) return null;

  return (
    <>
      <IconButton
        size="small"
        onClick={handleButtonClick}
        aria-label={isSubscribed ? t("subscribedTo", { name: entityName }) : t("title", { name: entityName })}
        sx={{ color: isSubscribed ? "primary.main" : "action.active" }}
      >
        {isSubscribed ? <BookmarkIcon /> : <BookmarkBorderIcon />}
      </IconButton>

      {/* Subscriptions menu (when already subscribed) */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        {subscriptions.map((sub, i) => (
          <UnsubscribeMenuItem
            key={i}
            sub={sub}
            entityType={entityType}
            onUnsubscribe={handleUnsubscribe}
          />
        ))}
      </Menu>

      {/* Subscribe dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("title", { name: entityName })}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          {availableThemes.length > 0 && (
            <FormControl fullWidth size="small">
              <InputLabel>{t("theme")}</InputLabel>
              <Select
                label={t("theme")}
                value={selectedThemeId}
                onChange={(e) => setSelectedThemeId(e.target.value)}
              >
                {availableThemes.map((theme) => (
                  <MenuItem key={theme.themeId} value={theme.themeId}>
                    <ListItemText primary={theme.themeName} secondary={theme.creatorName} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <FormControl fullWidth size="small">
            <InputLabel>{t("language")}</InputLabel>
            <Select
              label={t("language")}
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
            >
              <MenuItem value="__textless__">
                <Typography variant="body2" sx={{ textTransform: "uppercase" }}>
                  {t("textless")}
                </Typography>
              </MenuItem>
              {availableLanguages.map((lang) => (
                <MenuItem key={lang} value={lang}>
                  {lang.toUpperCase()}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControlLabel
            control={
              <Checkbox
                checked={saveAsPreferred}
                onChange={(e) => setSaveAsPreferred(e.target.checked)}
                size="small"
              />
            }
            label={t("saveAsPreferred")}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => void handleSubscribe()}
            variant="contained"
            disabled={saving || !selectedThemeId}
          >
            {t("subscribe")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
