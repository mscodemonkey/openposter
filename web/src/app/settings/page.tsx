"use client";

import Link from "next/link";
import { useState } from "react";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { ISSUER_BASE_URL } from "@/lib/issuer";
import { clearIssuerSession, loadIssuerUser } from "@/lib/issuer_storage";
import { clearCreatorConnection, loadCreatorConnection, saveCreatorConnection } from "@/lib/storage";

export default function SettingsPage() {
  const existing = loadCreatorConnection();
  const issuerUser = loadIssuerUser();

  const [nodeUrl, setNodeUrl] = useState(existing?.nodeUrl || "http://localhost:8081");
  const [adminToken, setAdminToken] = useState(existing?.adminToken || "");
  const [connStatus, setConnStatus] = useState<string | null>(null);

  async function testConnection() {
    setConnStatus("Testing...");
    try {
      const base = nodeUrl.replace(/\/+$/, "");
      const r = await fetch(base + "/v1/health");
      if (!r.ok) throw new Error(`Health failed: ${r.status}`);
      setConnStatus("OK: node reachable");
    } catch (e: unknown) {
      setConnStatus(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Settings
          </Typography>
        </Box>

        <Paper sx={{ p: 3 }}>
          <Stack spacing={1.25}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Account
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Issuer: <code>{ISSUER_BASE_URL}</code>
            </Typography>

            {issuerUser ? (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                  Logged in as <strong>{issuerUser.email}</strong>
                </Typography>
                <Button
                  variant="outlined"
                  onClick={() => {
                    clearIssuerSession();
                    window.location.href = "/onboarding";
                  }}
                >
                  Log out
                </Button>
              </Stack>
            ) : (
              <Alert severity="info">
                Not logged in. Go to <Link href="/onboarding">Onboarding</Link>.
              </Alert>
            )}
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Stack spacing={1.5}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Node admin session
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Used for uploading and managing posters on your node. The recommended way to set this up is via{" "}
              <Link href="/onboarding">Onboarding</Link>.
            </Typography>

            <TextField
              label="Local URL"
              value={nodeUrl}
              onChange={(e) => setNodeUrl(e.target.value)}
              placeholder="http://192.168.1.10:8080"
            />

            <TextField
              label="Node admin token"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              placeholder="(created during onboarding)"
              type="password"
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                onClick={() => {
                  saveCreatorConnection({ nodeUrl: nodeUrl.replace(/\/+$/, ""), adminToken });
                  setConnStatus("Saved.");
                }}
              >
                Save
              </Button>
              <Button variant="outlined" onClick={() => void testConnection()}>
                Test
              </Button>
              <Button
                color="error"
                variant="outlined"
                onClick={() => {
                  clearCreatorConnection();
                  setAdminToken("");
                  setConnStatus("Disconnected.");
                }}
              >
                Disconnect
              </Button>
            </Stack>

            {connStatus && <Alert severity={connStatus.startsWith("OK") ? "success" : "info"}>{connStatus}</Alert>}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
