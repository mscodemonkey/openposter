"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { issuerLogin, issuerSignup, type LoginResponse, type SignupResponse } from "@/lib/issuer";

type AuthMode = "login" | "signup";

export default function IssuerAuthCard({
  title,
  subtitle,
  body,
  initialMode = "login",
  submitLabelLogin,
  submitLabelSignup,
  onSuccess,
  onError,
}: {
  title: string;
  subtitle?: string;
  body?: string;
  initialMode?: AuthMode;
  submitLabelLogin?: string;
  submitLabelSignup?: string;
  onSuccess: (result: LoginResponse | SignupResponse) => void | Promise<void>;
  onError?: (message: string) => void;
}) {
  const t = useTranslations("onboarding");
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const result = mode === "login"
        ? await issuerLogin({ email, password })
        : await issuerSignup({ email, password, display_name: displayName || undefined });
      await onSuccess(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (mode === "signup" && msg.toLowerCase().includes("already registered")) {
        onError?.(t("alreadyRegistered"));
        setMode("login");
      } else {
        onError?.(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h4" sx={{ fontWeight: 900 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {subtitle}
          </Typography>
        )}
        {body && (
          <Typography color="text.secondary">
            {body}
          </Typography>
        )}

        <Typography sx={{ fontWeight: 800, mt: 1 }}>
          {t("haveAccountQuestion")}
        </Typography>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button variant={mode === "login" ? "contained" : "outlined"} onClick={() => setMode("login")}>
            {t("haveAccountLogin")}
          </Button>
          <Button variant={mode === "signup" ? "contained" : "outlined"} onClick={() => setMode("signup")}>
            {t("newSignup")}
          </Button>
        </Stack>

        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {mode === "signup" && (
            <TextField
              label={t("displayName")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              helperText={t("displayNameHint")}
            />
          )}

          <TextField label={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <TextField
            label={t("password")}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />

          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {mode === "login" ? (submitLabelLogin ?? t("logMeIn")) : (submitLabelSignup ?? t("signMeUp"))}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
