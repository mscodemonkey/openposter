"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ISSUER_BASE_URL } from "@/lib/issuer";
import { saveIssuerSession } from "@/lib/issuer_storage";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { alpha, useTheme } from "@mui/material/styles";

import { loadCreatorConnection } from "@/lib/storage";

export default function RegisterPage() {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/onboarding";
  const issuer = useMemo(() => ISSUER_BASE_URL, []);
  const paired = typeof window !== "undefined" ? loadCreatorConnection() : null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = params.get("issuer_token");
    const rawUser = params.get("issuer_user");
    if (token && rawUser) {
      try {
        saveIssuerSession(token, JSON.parse(rawUser));
        router.replace(paired ? next : "/");
        return;
      } catch {
        // fall through to issuer auth
      }
    }
    const returnTo = `${window.location.origin}/register?next=${encodeURIComponent(next)}`;
    window.location.replace(`${issuer.replace(/\/+$/, "")}/auth?return_to=${encodeURIComponent(returnTo)}`);
  }, [issuer, next, paired, router]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: theme.palette.mode === "dark"
          ? `linear-gradient(180deg, ${theme.palette.grey[900]} 0%, ${theme.palette.background.default} 42%, ${alpha(theme.palette.common.black, 0.94)} 100%)`
          : `linear-gradient(180deg, ${theme.palette.grey[100]} 0%, #f8f5ee 32%, ${theme.palette.background.default} 100%)`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    </Box>
  );
}
