"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import StatusChip, { type ServiceStatus } from "./StatusChip";
import type { NodeConfig } from "@/lib/config";
import { type DiagEvent, makeEventId, mergeEvents } from "@/lib/events";

const POLL_IDLE = 10_000;
const POLL_FAST = 5_000;
const EVENT_POLL = 5_000;

type NodeInfo = {
  node_id: string;
  name: string;
  operator: { name: string; contact: string };
  base_url: string;
};

type Descriptor = {
  features: Record<string, boolean>;
  signing_keys: Array<{ key_id: string; alg: string }>;
};

type Props = {
  config: NodeConfig;
  onEvent: (events: DiagEvent[]) => void;
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell sx={{ color: "text.secondary", fontSize: "0.72rem", py: 0.5, pl: 0, border: 0, whiteSpace: "nowrap", width: 140 }}>
        {label}
      </TableCell>
      <TableCell sx={{ fontSize: "0.8rem", py: 0.5, pr: 0, border: 0, wordBreak: "break-all" }}>
        {value}
      </TableCell>
    </TableRow>
  );
}

export default function NodePanel({ config, onEvent }: Props) {
  const { label, url, adminToken } = config;
  const [status, setStatus] = useState<ServiceStatus>("checking");
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [descriptor, setDescriptor] = useState<Descriptor | null>(null);
  const [adminOk, setAdminOk] = useState<boolean | null>(null);
  const [peerCount, setPeerCount] = useState<number | null>(null);

  // Cursor for change feed polling
  const changeCursor = useRef<string | null>(null);
  // Set of seen applied artwork media_item_ids
  const seenApplied = useRef<Set<string>>(new Set());
  // ISO timestamp of last seen indexed item
  const lastIndexedAt = useRef<string | null>(null);

  const isConfigured = Boolean(url);

  const pollHealth = useCallback(async () => {
    if (!url) return false;
    try {
      const r = await fetch(`${url}/v1/health`, { signal: AbortSignal.timeout(4000) });
      return r.ok;
    } catch {
      return false;
    }
  }, [url]);

  const pollInfo = useCallback(async () => {
    if (!url) return;
    try {
      const [infoRes, descRes, nodesRes] = await Promise.allSettled([
        fetch(`${url}/v1/node`, { signal: AbortSignal.timeout(4000) }),
        fetch(`${url}/.well-known/openposter-node`, { signal: AbortSignal.timeout(4000) }),
        fetch(`${url}/v1/nodes`, { signal: AbortSignal.timeout(4000) }),
      ]);
      if (infoRes.status === "fulfilled" && infoRes.value.ok) {
        const j = await infoRes.value.json() as { node: NodeInfo };
        setNodeInfo(j.node);
      }
      if (descRes.status === "fulfilled" && descRes.value.ok) {
        const j = await descRes.value.json() as Descriptor;
        setDescriptor(j);
      }
      if (nodesRes.status === "fulfilled" && nodesRes.value.ok) {
        const j = await nodesRes.value.json() as { nodes: unknown[] };
        setPeerCount(j.nodes.length);
      }
      if (adminToken) {
        try {
          const r = await fetch(`${url}/v1/admin/whoami`, {
            headers: { Authorization: `Bearer ${adminToken}` },
            signal: AbortSignal.timeout(4000),
          });
          setAdminOk(r.ok);
        } catch {
          setAdminOk(false);
        }
      }
    } catch {
      // ignore
    }
  }, [url, adminToken]);

  const pollEvents = useCallback(async () => {
    if (!url || !adminToken) return;
    const newEvents: DiagEvent[] = [];

    // Upload events from /v1/changes
    try {
      const u = new URL(`${url}/v1/changes`);
      u.searchParams.set("limit", "50");
      if (changeCursor.current) u.searchParams.set("since", changeCursor.current);
      const r = await fetch(u.toString(), { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const j = await r.json() as { changes: Array<{ poster_id: string; kind: string; changed_at: string }>; next_since: string | null };
        if (j.next_since) changeCursor.current = j.next_since;
        for (const c of j.changes) {
          const type = c.kind === "delete" ? "delete" : "upload";
          newEvents.push({
            id: makeEventId(type, label, c.poster_id, c.changed_at),
            type,
            service: label,
            posterId: c.poster_id,
            title: null,
            detail: null,
            at: c.changed_at,
          });
        }
      }
    } catch {
      // ignore
    }

    // Applied events from /v1/admin/artwork/tracked
    try {
      const r = await fetch(`${url}/v1/admin/artwork/tracked`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        signal: AbortSignal.timeout(4000),
      });
      if (r.ok) {
        const j = await r.json() as { items: Array<{ media_item_id: string; poster_id: string; applied_at: string; media_type: string }> };
        for (const item of j.items) {
          if (!seenApplied.current.has(item.media_item_id)) {
            seenApplied.current.add(item.media_item_id);
            // Only emit as an event if we've been running for a bit (skip initial load)
            if (lastIndexedAt.current !== null) {
              newEvents.push({
                id: makeEventId("applied", label, item.poster_id, item.applied_at),
                type: "applied",
                service: label,
                posterId: item.poster_id,
                title: null,
                detail: `Applied to ${item.media_type} item`,
                at: item.applied_at,
              });
            }
          }
        }
        // Mark that we've completed at least one full load
        if (lastIndexedAt.current === null) lastIndexedAt.current = new Date().toISOString();
      }
    } catch {
      // ignore
    }

    if (newEvents.length > 0) onEvent(newEvents);
  }, [url, adminToken, label, onEvent]);

  // Health + info polling
  useEffect(() => {
    if (!isConfigured) return;
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
  }, [isConfigured, pollHealth, pollInfo]);

  // Event polling (separate, faster interval)
  useEffect(() => {
    if (!isConfigured || !adminToken) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (!active) return;
      await pollEvents();
      if (active) timer = setTimeout(poll, EVENT_POLL);
    }

    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [isConfigured, adminToken, pollEvents]);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{label}</Typography>
          <StatusChip status={isConfigured ? status : "checking"} />
          <Typography variant="caption" color="text.disabled" sx={{ ml: "auto", wordBreak: "break-all" }}>
            {url || "not configured"}
          </Typography>
        </Stack>

        {!isConfigured ? (
          <Typography variant="body2" color="text.secondary">Not configured — enter a URL in settings.</Typography>
        ) : (
          <Table size="small" sx={{ "& td": { verticalAlign: "top" } }}>
            <TableBody>
              {nodeInfo && <>
                <Row label="Node ID" value={<code style={{ fontSize: "0.72rem" }}>{nodeInfo.node_id}</code>} />
                <Row label="Name" value={nodeInfo.name || "—"} />
                <Row label="Operator" value={`${nodeInfo.operator?.name || "—"}${nodeInfo.operator?.contact ? ` (${nodeInfo.operator.contact})` : ""}`} />
                <Row label="Base URL" value={nodeInfo.base_url || "—"} />
              </>}
              {adminToken && (
                <Row label="Admin auth" value={
                  adminOk === null ? "—" :
                  adminOk ? <span style={{ color: "#4caf50", fontWeight: 700 }}>✓ Authenticated</span> :
                  <span style={{ color: "#f44336", fontWeight: 700 }}>✗ Token invalid</span>
                } />
              )}
              {peerCount !== null && <Row label="Known peers" value={peerCount} />}
              {descriptor?.signing_keys?.[0] && (
                <Row label="Signing key" value={<code style={{ fontSize: "0.72rem" }}>{descriptor.signing_keys[0].key_id} ({descriptor.signing_keys[0].alg})</code>} />
              )}
            </TableBody>
          </Table>
        )}

        {descriptor?.features && (
          <>
            <Divider />
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {Object.entries(descriptor.features).map(([k, v]) => (
                <Chip key={k} label={k.replace(/_/g, " ")} size="small"
                  color={v ? "default" : "default"}
                  sx={{ fontSize: "0.65rem", opacity: v ? 1 : 0.35, textTransform: "uppercase", letterSpacing: "0.05em" }}
                />
              ))}
            </Box>
          </>
        )}
      </Stack>
    </Paper>
  );
}
