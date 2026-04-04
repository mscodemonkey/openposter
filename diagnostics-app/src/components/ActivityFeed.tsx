"use client";

import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { DiagEvent, DiagEventType } from "@/lib/events";

const TYPE_COLOUR: Record<DiagEventType, string> = {
  upload:  "#4caf50",
  delete:  "#f44336",
  indexed: "#2196f3",
  applied: "#9c27b0",
};

const TYPE_ICON: Record<DiagEventType, string> = {
  upload:  "🟢",
  delete:  "🔴",
  indexed: "🔵",
  applied: "🟣",
};

const TYPE_LABEL: Record<DiagEventType, string> = {
  upload:  "uploaded",
  delete:  "deleted",
  indexed: "indexed",
  applied: "applied",
};

function shortId(id: string): string {
  const parts = id.split(":");
  const posterId = parts[parts.length - 2] ?? id;
  return posterId.length > 16 ? `${posterId.slice(0, 8)}…${posterId.slice(-6)}` : posterId;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

type Props = { events: DiagEvent[] };

export default function ActivityFeed({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Scroll to top when new events arrive
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (events.length > prevCountRef.current) {
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      prevCountRef.current = events.length;
    }
  }, [events.length]);

  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column" }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Activity Feed</Typography>

      {events.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Waiting for events… (upload a poster, or ensure nodes + admin tokens are configured)
        </Typography>
      ) : (
        <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          <div ref={topRef} />
          <Stack divider={<Divider flexItem />} spacing={0}>
            {events.map((e) => (
              <Box key={e.id} sx={{ py: 1, display: "grid", gridTemplateColumns: "1.5rem 1fr", gap: 1, alignItems: "start" }}>
                <span style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>{TYPE_ICON[e.type]}</span>
                <Stack spacing={0.2}>
                  <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
                    <Typography variant="caption" sx={{ fontWeight: 700, color: TYPE_COLOUR[e.type] }}>
                      [{e.service}]
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {TYPE_LABEL[e.type]}
                    </Typography>
                    {e.title && (
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {e.title}
                      </Typography>
                    )}
                    {e.detail && (
                      <Typography variant="caption" color="text.secondary">
                        — {e.detail}
                      </Typography>
                    )}
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="caption" color="text.disabled" sx={{ fontFamily: "monospace", fontSize: "0.68rem" }}>
                      {formatTime(e.at)}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ fontFamily: "monospace", fontSize: "0.68rem" }}>
                      {shortId(e.posterId)}
                    </Typography>
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Stack>
          <div ref={bottomRef} />
        </Box>
      )}
    </Paper>
  );
}
