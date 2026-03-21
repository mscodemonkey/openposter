"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import SnackbarContent from "@mui/material/SnackbarContent";
import Tooltip from "@mui/material/Tooltip";

import { applyToPlexPoster, getPlexStatus, type PlexApplyRequest, type PlexStatus } from "@/lib/plex";
import { loadCreatorConnection } from "@/lib/storage";
import PlexLogo from "./PlexLogo";

interface PlexApplyButtonProps {
  items: PlexApplyRequest[];
}

type ApplyState =
  | { status: "idle" }
  | { status: "applying"; done: number; total: number }
  | { status: "done"; applied: number; skipped: number }
  | { status: "error"; message: string };

export default function PlexApplyButton({ items }: PlexApplyButtonProps) {
  const t = useTranslations("plex");
  const [plexStatus, setPlexStatus] = useState<PlexStatus | null>(null);
  const [applyState, setApplyState] = useState<ApplyState>({ status: "idle" });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const conn = loadCreatorConnection();
    if (!conn) { setPlexStatus({ connected: false }); return; }
    getPlexStatus(conn.nodeUrl, conn.adminToken)
      .then(setPlexStatus)
      .catch(() => setPlexStatus({ connected: false }));
  }, []);

  if (!plexStatus?.connected) return null;

  const isApplying = applyState.status === "applying";
  const tooltip = items.length === 1 ? t("addToPlex") : t("addAllToPlex", { count: items.length });

  function dismiss() {
    setOpen(false);
    setApplyState({ status: "idle" });
  }

  async function handleClick() {
    if (isApplying) return;
    setOpen(true);
    setApplyState({ status: "applying", done: 0, total: items.length });

    const conn = loadCreatorConnection();
    if (!conn) {
      setApplyState({ status: "error", message: t("noNodeConnected") });
      return;
    }

    let applied = 0;
    let skipped = 0;
    for (const item of items) {
      try {
        await applyToPlexPoster(conn.nodeUrl, conn.adminToken, item);
        applied++;
      } catch {
        skipped++;
      }
      setApplyState({ status: "applying", done: applied + skipped, total: items.length });
    }

    setApplyState({ status: "done", applied, skipped });
  }

  const isDone = applyState.status === "done";
  const isError = applyState.status === "error";

  const doneSeverity = isDone
    ? applyState.skipped === 0 ? "success" : applyState.applied === 0 ? "error" : "warning"
    : "error";

  const doneMessage = isDone
    ? applyState.skipped === 0
      ? t("appliedAll", { count: applyState.applied })
      : t("appliedPartial", { applied: applyState.applied, skipped: applyState.skipped })
    : isError ? applyState.message : "";

  // Success auto-dismisses; warning and error persist until closed.
  const autoHide = isDone && applyState.skipped === 0 && applyState.applied > 0 ? 4000 : null;

  return (
    <>
      <Tooltip title={tooltip} arrow>
        <span>
          <IconButton
            size="small"
            onClick={() => void handleClick()}
            disabled={isApplying}
            aria-label={tooltip}
            sx={{ p: 0.5 }}
          >
            {isApplying
              ? <CircularProgress size={20} sx={{ color: "#e5a00d" }} />
              : <PlexLogo height={18} />}
          </IconButton>
        </span>
      </Tooltip>

      <Snackbar
        open={open}
        autoHideDuration={autoHide}
        onClose={(_, reason) => { if (reason !== "clickaway") dismiss(); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {isDone || isError ? (
          <Alert severity={doneSeverity} variant="filled" onClose={dismiss}>
            {doneMessage}
          </Alert>
        ) : (
          <SnackbarContent
            message={t("applying", { done: isApplying ? applyState.done : 0, total: items.length })}
            action={<CircularProgress size={16} sx={{ color: "inherit" }} />}
          />
        )}
      </Snackbar>
    </>
  );
}
