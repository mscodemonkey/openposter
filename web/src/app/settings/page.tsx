"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";

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
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";

import { clearCreatorConnection, loadCreatorConnection, saveCreatorConnection, loadShowPosterDetails, saveShowPosterDetails } from "@/lib/storage";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const existing = loadCreatorConnection();
  const issuerUser = loadIssuerUser();

  const [nodeUrl, setNodeUrl] = useState(existing?.nodeUrl || "http://localhost:8081");
  const [adminToken, setAdminToken] = useState(existing?.adminToken || "");
  const [connStatus, setConnStatus] = useState<string | null>(null);
  const [showPosterDetails, setShowPosterDetails] = useState(loadShowPosterDetails());

  async function testConnection() {
    setConnStatus(t("testing"));
    try {
      const base = nodeUrl.replace(/\/+$/, "");
      const r = await fetch(base + "/v1/health");
      if (!r.ok) throw new Error(`Health failed: ${r.status}`);
      setConnStatus(t("testOk"));
    } catch (e: unknown) {
      setConnStatus(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("title")}
          </Typography>
        </Box>

        <Paper sx={{ p: 3 }}>
          <Stack spacing={1.25}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {t("account")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {tc("issuerLabel", { url: ISSUER_BASE_URL })}
            </Typography>

            {issuerUser ? (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                  {t("loggedInAs", { email: issuerUser.email })}
                </Typography>
                <Button
                  variant="outlined"
                  onClick={() => {
                    clearIssuerSession();
                    window.location.href = "/onboarding";
                  }}
                >
                  {t("logOut")}
                </Button>
              </Stack>
            ) : (
              <Alert severity="info">
                {t("notLoggedIn")} <Link href="/onboarding">{tn("onboarding")}</Link>.
              </Alert>
            )}
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Stack spacing={1.5}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {t("display")}
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={showPosterDetails}
                  onChange={(e) => {
                    setShowPosterDetails(e.target.checked);
                    saveShowPosterDetails(e.target.checked);
                  }}
                />
              }
              label={t("showPosterDetails")}
            />
            <Typography variant="body2" color="text.secondary">
              {t("showPosterDetailsHint")}
            </Typography>
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Stack spacing={1.5}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {t("nodeAdminSession")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("nodeAdminDesc")} <Link href="/onboarding">{tn("onboarding")}</Link>.
            </Typography>

            <TextField
              label={t("localUrl")}
              value={nodeUrl}
              onChange={(e) => setNodeUrl(e.target.value)}
              placeholder="http://192.168.1.10:8080"
            />

            <TextField
              label={t("nodeAdminToken")}
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              placeholder={t("nodeAdminTokenPlaceholder")}
              type="password"
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                onClick={() => {
                  saveCreatorConnection({ nodeUrl: nodeUrl.replace(/\/+$/, ""), adminToken });
                  setConnStatus(t("saved"));
                }}
              >
                {tc("save")}
              </Button>
              <Button variant="outlined" onClick={() => void testConnection()}>
                {t("test")}
              </Button>
              <Button
                color="error"
                variant="outlined"
                onClick={() => {
                  clearCreatorConnection();
                  setAdminToken("");
                  setConnStatus(t("disconnected"));
                }}
              >
                {tn("disconnect")}
              </Button>
            </Stack>

            {connStatus && <Alert severity={connStatus.startsWith("OK") ? "success" : "info"}>{connStatus}</Alert>}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
