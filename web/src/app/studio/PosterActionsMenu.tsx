"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PublishOutlinedIcon from "@mui/icons-material/PublishOutlined";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import UnpublishedOutlinedIcon from "@mui/icons-material/UnpublishedOutlined";

import type { CreatorTheme, PosterEntry } from "@/lib/types";

interface PosterActionsMenuProps {
  /** When omitted, only "Upload artwork" is shown. */
  poster?: PosterEntry;
  themes?: CreatorTheme[];
  onUpload?: () => void;
  onMove?: (themeId: string | null) => void;
  onDelete?: () => void;
  onTogglePublished?: () => void;
}

export default function PosterActionsMenu({ poster, themes = [], onUpload, onMove, onDelete, onTogglePublished }: PosterActionsMenuProps) {
  const t = useTranslations("studio");
  const tc = useTranslations("common");

  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  const currentThemeId = poster?.media.theme_id ?? null;
  const otherThemes = themes.filter((th) => th.theme_id !== currentThemeId);
  const published = poster?.published !== false;

  const close = () => { setAnchor(null); setMoveOpen(false); };

  return (
    <>
      <IconButton
        size="small"
        sx={{ bgcolor: "rgba(0,0,0,0.6)", color: "white", "&:hover": { bgcolor: "rgba(0,0,0,0.8)" } }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAnchor(e.currentTarget); }}
      >
        <MoreVertIcon sx={{ fontSize: "0.85rem" }} />
      </IconButton>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        {moveOpen
          ? [
              currentThemeId ? (
                <MenuItem key="remove" onClick={() => { onMove?.(null); close(); }}>
                  <ListItemIcon><RemoveCircleOutlineIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary={t("removeFromTheme")} />
                </MenuItem>
              ) : null,
              ...otherThemes.map((th) => (
                <MenuItem key={th.theme_id} onClick={() => { onMove?.(th.theme_id); close(); }}>
                  <ListItemText inset primary={th.name} />
                </MenuItem>
              )),
            ]
          : [
              onUpload ? (
                <MenuItem key="upload" onClick={() => { onUpload(); close(); }}>
                  <ListItemIcon><FileUploadOutlinedIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary={t("uploadArtwork")} />
                </MenuItem>
              ) : null,
              onTogglePublished ? (
                <MenuItem key="publish" onClick={() => { onTogglePublished(); close(); }}>
                  <ListItemIcon>
                    {published
                      ? <UnpublishedOutlinedIcon fontSize="small" />
                      : <PublishOutlinedIcon fontSize="small" />}
                  </ListItemIcon>
                  <ListItemText primary={published ? t("setDraft") : t("publish")} />
                </MenuItem>
              ) : null,
              onMove ? (
                <MenuItem key="move" onClick={() => setMoveOpen(true)}>
                  <ListItemIcon><DriveFileMoveOutlinedIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary={t("moveToTheme")} />
                </MenuItem>
              ) : null,
              onDelete ? (
                <MenuItem
                  key="delete"
                  onClick={() => { if (confirm(t("deleteConfirm"))) { onDelete(); } close(); }}
                  sx={{ color: "error.main" }}
                >
                  <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
                  <ListItemText primary={tc("delete")} />
                </MenuItem>
              ) : null,
            ]}
      </Menu>
    </>
  );
}
