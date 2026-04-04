"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import CloudDoneIcon from "@mui/icons-material/CloudDone";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import CloseIcon from "@mui/icons-material/Close";
import MenuIcon from "@mui/icons-material/Menu";
import SettingsIcon from "@mui/icons-material/Settings";

import { loadCreatorConnection } from "@/lib/storage";
import { fetchSyncStatus } from "@/lib/media-server";
import OPLogo from "@/components/OPLogo";

const NAV_ITEMS = [
  { key: "creators",  href: "/creators" },
  { key: "myMedia",   href: "/my-media" },
  { key: "studio",    href: "/studio" },
] as const;

export default function Nav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const [connected, setConnected] = useState(false);
  const [nodeUrl, setNodeUrl] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    function refresh() {
      const conn = loadCreatorConnection();
      setConnected(Boolean(conn));
      setNodeUrl(conn?.nodeUrl ?? null);
      if (!conn) setIsSyncing(false);
    }
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, []);

  // Poll Plex sync status — fast while syncing, slow at idle
  useEffect(() => {
    if (!connected) return;
    const conn = loadCreatorConnection();
    if (!conn) return;
    let active = true;
    let timerId: ReturnType<typeof setTimeout>;

    async function poll() {
      if (!active) return;
      try {
        const s = await fetchSyncStatus(conn!.nodeUrl, conn!.adminToken);
        if (active) setIsSyncing(s.is_syncing);
        timerId = setTimeout(poll, s.is_syncing ? 3000 : 15000);
      } catch {
        if (active) timerId = setTimeout(poll, 15000);
      }
    }

    void poll();
    return () => { active = false; clearTimeout(timerId); };
  }, [connected]);

  const connTooltip = connected
    ? t("connected", { url: nodeUrl ?? "" })
    : t("notConnected");

  return (
    <>
      <AppBar position="sticky">
        <Toolbar>

          {/* Mobile hamburger */}
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(true)}
            sx={{ mr: 1, display: { md: "none" } }}
            aria-label={t("openMenu")}
          >
            <MenuIcon />
          </IconButton>

          {/* Logo */}
          <Box component={Link} href="/" sx={{ display: "flex", alignItems: "center", gap: 1, textDecoration: "none", color: "inherit", flexShrink: 0, mr: 2 }}>
            <OPLogo size={28} />
            <Typography
              variant="h6"
              component="span"
              sx={{ fontWeight: 700, letterSpacing: "0.05em", fontFamily: "monospace" }}
            >
              OPEN<span style={{ opacity: 0.7 }}>POSTER</span>
            </Typography>
          </Box>

          {/* Desktop nav items */}
          <Box sx={{ display: { xs: "none", md: "flex" } }}>
            {NAV_ITEMS.map(({ key, href }) => (
              <Button key={key} component={Link} href={href} color="inherit">
                {t(key)}
              </Button>
            ))}
          </Box>

          <Box sx={{ flex: 1 }} />

          {/* Plex background sync indicator */}
          {isSyncing && (
            <Tooltip title={t("syncInProgress")} arrow>
              <CircularProgress
                size={16}
                thickness={5}
                sx={{ color: "inherit", opacity: 0.7, ml: 1, flexShrink: 0 }}
                aria-label={t("syncInProgress")}
              />
            </Tooltip>
          )}

          {/* Node connection status */}
          <Tooltip title={connTooltip} arrow>
            <IconButton
              component={Link}
              href="/settings"
              color="inherit"
              size="small"
              sx={{ ml: 1 }}
              aria-label={connTooltip}
            >
              {connected
                ? <CloudDoneIcon fontSize="small" />
                : <CloudOffIcon fontSize="small" sx={{ opacity: 0.5 }} />}
            </IconButton>
          </Tooltip>

          {/* Settings */}
          <Tooltip title={t("settings")} arrow>
            <IconButton
              component={Link}
              href="/settings"
              color="inherit"
              size="small"
              aria-label={t("settings")}
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>

        </Toolbar>
      </AppBar>

      {/* Mobile drawer */}
      <Drawer
        anchor="left"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        slotProps={{ paper: { sx: { width: 240 } } }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <OPLogo size={24} />
            <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: "0.05em", fontFamily: "monospace" }}>OPEN<span style={{ opacity: 0.7 }}>POSTER</span></Typography>
          </Box>
          <IconButton size="small" onClick={() => setMobileOpen(false)} aria-label={t("closeMenu")}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider />
        <List dense>
          {NAV_ITEMS.map(({ key, href }) => (
            <ListItem key={key} disablePadding>
              <ListItemButton
                component={Link}
                href={href}
                selected={pathname === href}
                onClick={() => setMobileOpen(false)}
              >
                <ListItemText primary={t(key)} />
              </ListItemButton>
            </ListItem>
          ))}
          <Divider sx={{ my: 1 }} />
          <ListItem disablePadding>
            <ListItemButton component={Link} href="/settings" onClick={() => setMobileOpen(false)}>
              <ListItemText primary={t("settings")} />
            </ListItemButton>
          </ListItem>
        </List>
      </Drawer>
    </>
  );
}
