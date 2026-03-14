"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";

import { clearCreatorConnection, loadCreatorConnection } from "@/lib/storage";

export default function Nav() {
  const t = useTranslations("nav");
  const [connected, setConnected] = useState(false);
  const [nodeUrl, setNodeUrl] = useState<string | null>(null);
  const [hasNodeUrlOnly, setHasNodeUrlOnly] = useState(false);

  function refresh() {
    const conn = loadCreatorConnection();
    setConnected(Boolean(conn));
    setNodeUrl(conn?.nodeUrl || null);

    try {
      const savedNode = window.localStorage.getItem("openposter.creatorConnection.nodeUrl.v1");
      setHasNodeUrlOnly(Boolean(savedNode) && !conn);
    } catch {
      setHasNodeUrlOnly(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <AppBar position="sticky" color="transparent" elevation={0}>
      <Toolbar sx={{ gap: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
            {t("openPoster")}
          </Link>
        </Typography>

        <Button component={Link} href="/browse" color="inherit">
          {t("posters")}
        </Button>
        <Button component={Link} href="/creators" color="inherit">
          {t("creators")}
        </Button>
        <Button component={Link} href="/upload" color="inherit">
          {t("upload")}
        </Button>
        <Button component={Link} href="/library" color="inherit">
          {t("myLibrary")}
        </Button>
        <Button component={Link} href="/onboarding" color="inherit">
          {t("onboarding")}
        </Button>
        <Button component={Link} href="/settings" color="inherit">
          {t("settings")}
        </Button>

        <Box sx={{ flex: 1 }} />

        {connected ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t("connected", { url: nodeUrl ?? "" })}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                clearCreatorConnection();
                refresh();
              }}
            >
              {t("disconnect")}
            </Button>
          </Box>
        ) : hasNodeUrlOnly ? (
          <Typography variant="body2" color="text.secondary">
            {t("tokenMissing")}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t("notConnected")}
          </Typography>
        )}
      </Toolbar>
    </AppBar>
  );
}
