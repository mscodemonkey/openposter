"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import { type DiagConfig, type NodeConfig } from "@/lib/config";

type Props = {
  open: boolean;
  config: DiagConfig;
  onClose: () => void;
  onSave: (cfg: DiagConfig) => void;
};

export default function ConfigDrawer({ open, config, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<DiagConfig>(config);

  useEffect(() => {
    setDraft(config);
  }, [config, open]);

  function updateNode(i: number, patch: Partial<NodeConfig>) {
    setDraft((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n, idx) => idx === i ? { ...n, ...patch } : n),
    }));
  }

  function addNode() {
    setDraft((prev) => ({
      ...prev,
      nodes: [...prev.nodes, { label: `Node ${String.fromCharCode(65 + prev.nodes.length)}`, url: "", adminToken: "" }],
    }));
  }

  function removeNode(i: number) {
    setDraft((prev) => ({ ...prev, nodes: prev.nodes.filter((_, idx) => idx !== i) }));
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 400, p: 3 } }}>
      <Stack spacing={2} sx={{ height: "100%", overflow: "auto" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Configure Services</Typography>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Stack>

        <Divider />

        {/* Nodes */}
        <Typography variant="overline" color="text.secondary">Nodes</Typography>
        {draft.nodes.map((node, i) => (
          <Box key={i} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
            <Stack spacing={1}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <TextField
                  label="Label"
                  value={node.label}
                  onChange={(e) => updateNode(i, { label: e.target.value })}
                  size="small"
                  sx={{ flex: 1 }}
                />
                {draft.nodes.length > 1 && (
                  <Tooltip title="Remove node">
                    <IconButton onClick={() => removeNode(i)} size="small" sx={{ ml: 1 }}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
              <TextField
                label="URL"
                value={node.url}
                onChange={(e) => updateNode(i, { url: e.target.value.trim() })}
                size="small"
                placeholder="http://localhost:8081"
                fullWidth
              />
              <TextField
                label="Admin token"
                value={node.adminToken}
                onChange={(e) => updateNode(i, { adminToken: e.target.value.trim() })}
                size="small"
                type="password"
                placeholder="your-admin-token"
                fullWidth
              />
            </Stack>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={addNode} size="small" variant="outlined">
          Add node
        </Button>

        <Divider />

        {/* Indexer */}
        <Typography variant="overline" color="text.secondary">Indexer</Typography>
        <TextField
          label="Indexer URL"
          value={draft.indexerUrl}
          onChange={(e) => setDraft((p) => ({ ...p, indexerUrl: e.target.value.trim() }))}
          size="small"
          placeholder="http://localhost:8090"
          fullWidth
        />

        <Divider />

        {/* Issuer */}
        <Typography variant="overline" color="text.secondary">Issuer / Directory</Typography>
        <TextField
          label="Issuer URL"
          value={draft.issuerUrl}
          onChange={(e) => setDraft((p) => ({ ...p, issuerUrl: e.target.value.trim() }))}
          size="small"
          placeholder="http://localhost:8085"
          fullWidth
        />

        <Box sx={{ flex: 1 }} />

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={onClose} variant="outlined">Cancel</Button>
          <Button onClick={handleSave} variant="contained">Apply</Button>
        </Stack>
      </Stack>
    </Drawer>
  );
}
