"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";

import { clearCreatorConnection, loadCreatorConnection } from "@/lib/storage";

export default function Nav() {
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
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <AppBar position="sticky" color="transparent" elevation={0}>
      <Toolbar sx={{ gap: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
            OpenPoster
          </Link>
        </Typography>

        <Button component={Link} href="/browse" color="inherit">
          Posters
        </Button>
        <Button component={Link} href="/creators" color="inherit">
          Creators
        </Button>
        <Button component={Link} href="/upload" color="inherit">
          Upload
        </Button>
        <Button component={Link} href="/library" color="inherit">
          My library
        </Button>
        <Button component={Link} href="/onboarding" color="inherit">
          Onboarding
        </Button>
        <Button component={Link} href="/settings" color="inherit">
          Settings
        </Button>

        <Box sx={{ flex: 1 }} />

        {connected ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Connected: <code>{nodeUrl}</code>
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                clearCreatorConnection();
                refresh();
              }}
            >
              Disconnect
            </Button>
          </Box>
        ) : hasNodeUrlOnly ? (
          <Typography variant="body2" color="text.secondary">
            Token missing (open Settings)
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Not connected
          </Typography>
        )}
      </Toolbar>
    </AppBar>
  );
}
