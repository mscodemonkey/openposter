"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import StatusChip, { type ServiceStatus } from "./StatusChip";
import { type DiagEvent, makeEventId } from "@/lib/events";

const POLL_IDLE = 10_000;
const POLL_FAST = 5_000;
const EVENT_POLL = 5_000;

type IndexerStats = { posters: number; nodes: { total: number; up: number } };
type CrawledNode = {
  url: string;
  status: string;
  last_crawled_at: string | null;
  consecutive_failures: number;
};

type RecentItem = { poster_id: string; changed_at: string; media?: { title?: string } };

type Props = { url: string; onEvent: (events: DiagEvent[]) => void };

function age(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function IndexerPanel({ url, onEvent }: Props) {
  const [status, setStatus] = useState<ServiceStatus>("checking");
  const [stats, setStats] = useState<IndexerStats | null>(null);
  const [nodes, setNodes] = useState<CrawledNode[]>([]);
  const seenPosterIds = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef(false);

  const pollHealth = useCallback(async () => {
    try {
      const r = await fetch(`${url}/v1/health`, { signal: AbortSignal.timeout(4000) });
      return r.ok;
    } catch {
      return false;
    }
  }, [url]);

  const pollInfo = useCallback(async () => {
    try {
      const [statsRes, nodesRes] = await Promise.allSettled([
        fetch(`${url}/v1/stats`, { signal: AbortSignal.timeout(4000) }),
        fetch(`${url}/v1/nodes`, { signal: AbortSignal.timeout(4000) }),
      ]);
      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        setStats(await statsRes.value.json() as IndexerStats);
      }
      if (nodesRes.status === "fulfilled" && nodesRes.value.ok) {
        const j = await nodesRes.value.json() as { nodes: CrawledNode[] };
        setNodes(j.nodes);
      }
    } catch {
      // ignore
    }
  }, [url]);

  const pollEvents = useCallback(async () => {
    try {
      const r = await fetch(`${url}/v1/recent?limit=20`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) return;
      const j = await r.json() as { results: RecentItem[] };
      const newEvents: DiagEvent[] = [];
      for (const item of j.results) {
        if (!seenPosterIds.current.has(item.poster_id)) {
          seenPosterIds.current.add(item.poster_id);
          if (initialLoadDone.current) {
            newEvents.push({
              id: makeEventId("indexed", "Indexer", item.poster_id, item.changed_at),
              type: "indexed",
              service: "Indexer",
              posterId: item.poster_id,
              title: item.media?.title ?? null,
              detail: null,
              at: item.changed_at,
            });
          }
        }
      }
      initialLoadDone.current = true;
      if (newEvents.length > 0) onEvent(newEvents);
    } catch {
      // ignore
    }
  }, [url, onEvent]);

  // Health + info polling
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (!active) return;
      const ok = await pollHealth();
      if (active) {
        setStatus(ok ? "up" : "down");
        if (ok) await pollInfo();
      }
      if (active) timer = setTimeout(poll, ok ? POLL_IDLE : POLL_FAST);
    }

    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [pollHealth, pollInfo]);

  // Event polling
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (!active) return;
      await pollEvents();
      if (active) timer = setTimeout(poll, EVENT_POLL);
    }

    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [pollEvents]);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Indexer</Typography>
          <StatusChip status={status} />
          <Typography variant="caption" color="text.disabled" sx={{ ml: "auto" }}>{url}</Typography>
        </Stack>

        {stats && (
          <Stack direction="row" spacing={3}>
            <Stack>
              <Typography variant="overline" sx={{ lineHeight: 1.2, color: "text.secondary" }}>Posters</Typography>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>{stats.posters.toLocaleString()}</Typography>
            </Stack>
            <Stack>
              <Typography variant="overline" sx={{ lineHeight: 1.2, color: "text.secondary" }}>Nodes</Typography>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>{stats.nodes.up} / {stats.nodes.total}</Typography>
            </Stack>
          </Stack>
        )}

        {nodes.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.7rem", pl: 0 }}>URL</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.7rem" }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.7rem" }}>Last crawled</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.7rem", pr: 0 }}>Failures</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {nodes.map((n) => (
                <TableRow key={n.url}>
                  <TableCell sx={{ fontSize: "0.72rem", pl: 0, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.url}
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.72rem" }}>
                    <span style={{ color: n.status === "up" ? "#4caf50" : "#f44336", fontWeight: 700 }}>
                      {n.status.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.72rem" }}>{age(n.last_crawled_at)}</TableCell>
                  <TableCell sx={{ fontSize: "0.72rem", pr: 0, color: n.consecutive_failures > 0 ? "error.main" : "inherit" }}>
                    {n.consecutive_failures}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Stack>
    </Paper>
  );
}
