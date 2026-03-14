"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import PersonIcon from "@mui/icons-material/Person";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { PosterEntry } from "@/lib/types";
import SectionedPosterView from "@/components/SectionedPosterView";

type PagedResponse = {
  results: PosterEntry[];
  next_cursor?: string | null;
};

function CreatorPageInner({ creatorId }: { creatorId: string }) {
  const t = useTranslations("creator");
  const tc = useTranslations("common");
  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<PosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // Resolve display name
        const cr = await fetch(`${base}/v1/creators?limit=500`);
        if (cr.ok) {
          const json = (await cr.json()) as {
            results: Array<{ creator_id: string; display_name: string | null }>;
          };
          const match = json.results.find((c) => c.creator_id === creatorId);
          setDisplayName(match?.display_name ?? null);
        }

        // Load all posters (paginate through all pages)
        const collected: PosterEntry[] = [];
        let cursor: string | null = null;
        do {
          const u = new URL(`${base}/v1/by_creator`);
          u.searchParams.set("creator_id", creatorId);
          u.searchParams.set("limit", "100");
          if (cursor) u.searchParams.set("cursor", cursor);
          const r = await fetch(u.toString());
          if (!r.ok) throw new Error(`by_creator failed: ${r.status}`);
          const json = (await r.json()) as PagedResponse;
          collected.push(...json.results);
          cursor = json.next_cursor ?? null;
        } while (cursor);

        setAllItems(collected);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [base, creatorId]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={4}>
        {/* Profile header */}
        <Stack direction="row" spacing={2.5} alignItems="center">
          <Avatar sx={{ width: 72, height: 72, bgcolor: "primary.main" }}>
            <PersonIcon sx={{ fontSize: 40 }} />
          </Avatar>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {displayName || creatorId}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {allItems !== null
                ? t("posterCount", { id: creatorId, count: allItems.length })
                : creatorId}
            </Typography>
          </Box>
        </Stack>

        {error && <Typography color="error">{error}</Typography>}

        <SectionedPosterView
          items={allItems ?? []}
          loading={allItems === null}
          showCreator={false}
        />
      </Stack>
    </Container>
  );
}

export default function CreatorPage({
  params,
}: {
  params: Promise<{ creatorId: string }>;
}) {
  const { creatorId } = use(params);
  return <CreatorPageInner creatorId={creatorId} />;
}
