"use client";

import Chip from "@mui/material/Chip";

export type ServiceStatus = "up" | "down" | "checking";

export default function StatusChip({ status }: { status: ServiceStatus }) {
  if (status === "checking") {
    return <Chip label="CHECKING…" size="small" sx={{ fontSize: "0.65rem", fontWeight: 700 }} />;
  }
  return (
    <Chip
      label={status === "up" ? "UP" : "DOWN"}
      size="small"
      color={status === "up" ? "success" : "error"}
      sx={{ fontSize: "0.65rem", fontWeight: 700 }}
    />
  );
}
