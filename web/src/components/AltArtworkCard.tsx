"use client";

// ─── AltArtworkCard ───────────────────────────────────────────────────────────
// Shared card used inside AltArtworkDrawer (and anywhere else alt artwork is
// displayed in a grid). MUST remain a module-level export — never define it
// inside another component, or React will remount it on every parent render.

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";

import PosterCard from "@/components/PosterCard";
import PosterSubscribeMenu from "@/components/PosterSubscribeMenu";
import type { PosterEntry } from "@/lib/types";
import type { ThemeSubscription } from "@/lib/subscriptions";

export type AltArtworkChip = {
  label: string;
  color: "primary" | "secondary" | "error" | "success" | "warning" | "info";
};

export interface AltArtworkCardProps {
  poster: PosterEntry;
  subs: ThemeSubscription[];
  applyingId: string | null;
  appliedIds: Set<string>;
  chip: AltArtworkChip;
  /** true → 16/9 aspect; false (default) → 2/3 poster aspect */
  isBackdrop?: boolean;
  /** Override the aspect ratio (e.g. "3 / 1" for logos). Takes precedence over isBackdrop. */
  aspectRatio?: string;
  /** Override button label. Defaults to t("usePoster") or t("useBackdrop"). */
  buttonLabel?: string;
  onApply: (p: PosterEntry) => void;
}

export default function AltArtworkCard({
  poster,
  subs,
  applyingId,
  appliedIds,
  chip,
  isBackdrop = false,
  aspectRatio: aspectRatioProp,
  buttonLabel,
  onApply,
}: AltArtworkCardProps) {
  const t = useTranslations("myMedia");
  const themeId = poster.media.theme_id ?? null;
  const matchingSub = themeId ? subs.find((s) => s.themeId === themeId) : null;
  const themeLabel = matchingSub?.themeName ?? (themeId ? t("inATheme") : null);
  const isApplying = applyingId === poster.poster_id;
  const isApplied = appliedIds.has(poster.poster_id);
  const label = buttonLabel ?? (isBackdrop ? t("useBackdrop") : t("usePoster"));

  return (
    <Box>
      <PosterCard
        poster={poster}
        chip={chip}
        aspectRatio={aspectRatioProp ?? (isBackdrop ? "16 / 9" : "2 / 3")}
        subscribeSlot={
          poster.creator.creator_id ? (
            <PosterSubscribeMenu
              creatorId={poster.creator.creator_id}
              creatorDisplayName={poster.creator.creator_id}
              themeId={themeId}
              themeName={themeLabel}
              coverUrl={poster.assets.preview.url}
              nodeBase={poster.creator.home_node}
            />
          ) : undefined
        }
      />
      <Box sx={{ px: 1, pt: 0.5, pb: 1 }}>
        {themeLabel && (
          <Typography variant="caption" color="text.secondary" display="block" noWrap textAlign="center">
            {themeLabel}
          </Typography>
        )}
        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center" sx={{ mt: 0.75 }}>
          <Button
            size="small"
            variant={isApplied ? "contained" : "outlined"}
            onClick={() => onApply(poster)}
            disabled={isApplying || isApplied}
            data-testid={`use-artwork-${poster.poster_id}`}
            sx={{ fontSize: "0.65rem", py: 0.25, minWidth: 0 }}
          >
            {isApplied ? t("appliedCheck") : isApplying ? <CircularProgress size={12} /> : label}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
