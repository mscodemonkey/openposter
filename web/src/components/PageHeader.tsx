"use client";

import type React from "react";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export type PageCrumb = { label: React.ReactNode; onClick?: () => void };

/**
 * Shared page header — breadcrumbs, title, optional subtitle.
 * ONE place that owns all spacing and typography for page headers app-wide.
 *
 * Uses Stack (flexbox) internally — margins between flex items never collapse,
 * so spacing is identical regardless of the surrounding layout context.
 *
 * Spacing contract (all padding, not margin — immune to context):
 *   breadcrumbs → title   : mt 1  (8 px)   — margin inside flex, no collapse
 *   title → subtitle      : mb 0.5 (4 px)
 *   title/subtitle → page : pb 2  (16 px)  — padding on root, always reliable
 */
export default function PageHeader({
  crumbs,
  title,
  subtitle,
  compact,
}: {
  crumbs: PageCrumb[];
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Force the tight (4 px) title→content gap even when no subtitle is passed. */
  compact?: boolean;
}) {
  return (
    <Stack direction="column" sx={{ pb: 2 }}>
      <Breadcrumbs maxItems={8} aria-label="breadcrumb">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return isLast ? (
            <Typography
              key={i}
              variant="body2"
              color="text.primary"
              sx={{ display: "flex", alignItems: "center" }}
            >
              {crumb.label}
            </Typography>
          ) : (
            <Typography
              key={i}
              component="button"
              variant="body2"
              color="text.secondary"
              onClick={crumb.onClick}
              sx={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                background: "none",
                border: "none",
                p: 0,
                "&:hover": { textDecoration: "underline" },
              }}
            >
              {crumb.label}
            </Typography>
          );
        })}
      </Breadcrumbs>

      {title != null && (
        <Typography
          variant="h5"
          fontWeight={800}
          sx={{ mt: 1, mb: (subtitle != null || compact) ? 0.5 : 0 }}
        >
          {title}
        </Typography>
      )}

      {subtitle != null && (
        <Box>{subtitle}</Box>
      )}
    </Stack>
  );
}
