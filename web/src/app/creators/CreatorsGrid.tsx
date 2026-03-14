"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type { Creator } from "@/lib/server-api";

export default function CreatorsGrid({ creators }: { creators: Creator[] }) {
  const t = useTranslations("creators");
  const [q, setQ] = useState("");

  const filtered = q.trim()
    ? creators.filter((c) =>
        (c.display_name || c.creator_id).toLowerCase().includes(q.trim().toLowerCase())
      )
    : creators;

  return (
    <Stack spacing={2.5}>
      <TextField
        label={t("findCreator")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("searchPlaceholder")}
      />

      <Stack spacing={1.5}>
        {filtered.map((c) => (
          <Card key={c.creator_id}>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="flex-start" justifyContent="space-between">
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 800 }} noWrap>
                    {c.display_name || c.creator_id}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    <code>{c.creator_id}</code>
                  </Typography>
                </Box>

                <Box sx={{ textAlign: "right" }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {t("posterCount", { count: c.count })}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {c.last_changed_at || "-"}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
            <CardActions>
              <Link href={`/creator/${encodeURIComponent(c.creator_id)}`} style={{ textDecoration: "none" }}>
                <Typography variant="body2" sx={{ px: 1 }}>
                  {t("viewCreator")}
                </Typography>
              </Link>
              <Link
                href={`/browse?creator_id=${encodeURIComponent(c.creator_id)}`}
                style={{ textDecoration: "none" }}
              >
                <Typography variant="body2" sx={{ px: 1 }}>
                  {t("browsePosters")}
                </Typography>
              </Link>
            </CardActions>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
