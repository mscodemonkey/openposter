"use client";

import { useTranslations } from "next-intl";

import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";

import { ToolbarButton } from "@/components/MediaCard";

type CreatorSubscriptionToolbarActionProps = {
  creatorId?: string | null;
  isSubscribed: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onAfterToggle?: () => void;
};

export default function CreatorSubscriptionToolbarAction({
  creatorId,
  isSubscribed,
  disabled = false,
  onToggle,
  onAfterToggle,
}: CreatorSubscriptionToolbarActionProps) {
  const t = useTranslations("myMedia");

  return (
    <ToolbarButton
      icon={isSubscribed ? <StarIcon sx={{ fontSize: "1.1rem" }} /> : <StarBorderIcon sx={{ fontSize: "1.1rem" }} />}
      disabled={disabled || !creatorId}
      active={isSubscribed}
      tooltip={isSubscribed ? t("tooltipSubscribed") : t("tooltipSubscribeToCreator")}
      menuItems={creatorId ? [
        {
          label: isSubscribed ? t("menuUnsubscribe") : t("menuSubscribe"),
          onClick: () => {
            onToggle();
            onAfterToggle?.();
          },
        },
      ] : undefined}
    />
  );
}
