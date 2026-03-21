"use client";

import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";

export interface ArtworkMeta {
  creator?: string | null;
  theme?: string | null;
  appliedAt?: string | null;
}

function MetaTip({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography
        variant="overline"
        sx={{ display: "block", fontSize: "0.55rem", letterSpacing: 1.2, color: "text.secondary", lineHeight: 1.4 }}
      >
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.4 }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function ArtworkMetadataTooltip({
  meta,
  children,
}: {
  meta: ArtworkMeta;
  children: React.ReactElement;
}): React.ReactElement {
  const t = useTranslations("myMedia");

  const fields = [
    meta.creator ? { label: t("metaCreator"), value: meta.creator } : null,
    meta.theme ? { label: t("metaTheme"), value: meta.theme } : null,
    meta.appliedAt ? { label: t("metaLastUpdated"), value: meta.appliedAt } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  if (fields.length === 0) return children;

  return (
    <Tooltip
      title={
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
          {fields.map((f, i) => (
            <Box
              key={f.label}
              sx={i > 0 ? { pt: 1.25, borderTop: 1, borderColor: "divider" } : undefined}
            >
              <MetaTip label={f.label} value={f.value} />
            </Box>
          ))}
        </Box>
      }
      placement="top"
      arrow
      enterDelay={400}
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: "background.paper",
            color: "text.primary",
            boxShadow: 4,
            border: 1,
            borderColor: "divider",
            p: 1.5,
            maxWidth: 220,
          },
        },
        arrow: {
          sx: { color: "background.paper" },
        },
      }}
    >
      {children}
    </Tooltip>
  );
}
