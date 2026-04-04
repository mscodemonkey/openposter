"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

import NodePanel from "@/components/NodePanel";
import IndexerPanel from "@/components/IndexerPanel";
import IssuerPanel from "@/components/IssuerPanel";
import ActivityFeed from "@/components/ActivityFeed";
import ConfigDrawer from "@/components/ConfigDrawer";

import { type DiagConfig, loadConfig, saveConfig } from "@/lib/config";
import { type DiagEvent, mergeEvents } from "@/lib/events";

type Event = DiagEvent;

export default function DiagnosticsPage() {
  const [config, setConfig] = useState<DiagConfig | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);

  // Load config from localStorage on mount (client-only)
  useEffect(() => {
    setConfig(loadConfig());
  }, []);

  const handleEvent = useCallback((incoming: Event[]) => {
    setEvents((prev) => mergeEvents(prev, incoming));
  }, []);

  function handleSaveConfig(cfg: DiagConfig) {
    saveConfig(cfg);
    setConfig(cfg);
  }

  if (!config) return null; // SSR guard — config only available client-side

  return (
    <Container maxWidth="xl" sx={{ py: 3, height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: "-0.02em", flex: 1 }}>
          OpenPoster Diagnostics
        </Typography>
        <Tooltip title="Configure services">
          <IconButton onClick={() => setDrawerOpen(true)} size="small">
            <SettingsOutlinedIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Main layout: panels left, feed right */}
      <Box sx={{ flex: 1, display: "grid", gridTemplateColumns: "380px 1fr", gap: 2, minHeight: 0 }}>
        {/* Left: service panels */}
        <Stack spacing={2} sx={{ overflow: "auto" }}>
          {config.nodes.map((node, i) => (
            <NodePanel key={`${node.url}:${i}`} config={node} onEvent={handleEvent} />
          ))}
          <IndexerPanel url={config.indexerUrl} onEvent={handleEvent} />
          <IssuerPanel url={config.issuerUrl} />
        </Stack>

        {/* Right: activity feed */}
        <Box sx={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <ActivityFeed events={events} />
        </Box>
      </Box>

      <ConfigDrawer
        open={drawerOpen}
        config={config}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSaveConfig}
      />
    </Container>
  );
}
