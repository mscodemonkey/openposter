"use client";

import { useCallback, useEffect, useState } from "react";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import StatusChip, { type ServiceStatus } from "./StatusChip";

const POLL_IDLE = 15_000;
const POLL_FAST = 5_000;

type RegisteredNode = {
  node_id: string;
  public_urls: string[];
};

type Props = { url: string };

export default function IssuerPanel({ url }: Props) {
  const [status, setStatus] = useState<ServiceStatus>("checking");
  const [nodes, setNodes] = useState<RegisteredNode[]>([]);

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
      const r = await fetch(`${url}/v1/nodes`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const j = await r.json() as { nodes: RegisteredNode[] };
        setNodes(j.nodes);
      }
    } catch {
      // ignore
    }
  }, [url]);

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

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Issuer / Directory</Typography>
          <StatusChip status={status} />
          <Typography variant="caption" color="text.disabled" sx={{ ml: "auto" }}>{url}</Typography>
        </Stack>

        <Stack direction="row" spacing={3}>
          <Stack>
            <Typography variant="overline" sx={{ lineHeight: 1.2, color: "text.secondary" }}>Registered nodes</Typography>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{nodes.length}</Typography>
          </Stack>
        </Stack>

        {nodes.length > 0 && (
          <Table size="small">
            <TableBody>
              {nodes.map((n) => (
                <TableRow key={n.node_id}>
                  <TableCell sx={{ fontSize: "0.72rem", pl: 0, border: 0, color: "text.secondary", whiteSpace: "nowrap", width: 100 }}>
                    <code>{n.node_id.slice(0, 12)}…</code>
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.72rem", border: 0 }}>
                    {n.public_urls.length > 0
                      ? n.public_urls.join(", ")
                      : <span style={{ opacity: 0.4 }}>no public URL</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {nodes.length === 0 && status === "up" && (
          <Typography variant="body2" color="text.secondary">No nodes registered.</Typography>
        )}
      </Stack>
    </Paper>
  );
}
