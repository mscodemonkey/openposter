"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { INDEXER_BASE_URL } from "@/lib/config";

type CreatorsResponse = {
  results: Array<{
    creator_id: string;
    display_name: string | null;
    count: number;
    last_changed_at: string | null;
  }>;
};

export default function CreatorsPage() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<CreatorsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const url = useMemo(() => {
    const base = INDEXER_BASE_URL.replace(/\/+$/, "");
    const u = new URL(base + "/v1/creators");
    u.searchParams.set("limit", "200");
    if (q.trim() !== "") u.searchParams.set("q", q.trim());
    return u.toString();
  }, [q]);

  useEffect(() => {
    void (async () => {
      try {
        setError(null);
        const r = await fetch(url);
        if (!r.ok) throw new Error(`creators failed: ${r.status}`);
        setData((await r.json()) as CreatorsResponse);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [url]);

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Creators
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Indexer: <code>{INDEXER_BASE_URL}</code>
          </Typography>
        </Box>

        <TextField
          label="Find a creator"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search creator names…"
        />

        {error && <Alert severity="error">{error}</Alert>}

        {!data ? (
          <Typography color="text.secondary">Loading…</Typography>
        ) : (
          <Stack spacing={1.5}>
            {data.results.map((c) => (
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
                        {c.count} poster(s)
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
                      View creator →
                    </Typography>
                  </Link>
                  <Link
                    href={`/browse?creator_id=${encodeURIComponent(c.creator_id)}`}
                    style={{ textDecoration: "none" }}
                  >
                    <Typography variant="body2" sx={{ px: 1 }}>
                      Browse posters →
                    </Typography>
                  </Link>
                </CardActions>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
