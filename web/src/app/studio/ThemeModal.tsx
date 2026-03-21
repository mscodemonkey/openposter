"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";

import { adminCreateTheme, adminUpdateTheme, adminUploadThemeCover } from "@/lib/themes";
import type { CreatorTheme } from "@/lib/types";

interface ThemeModalProps {
  open: boolean;
  theme: CreatorTheme | null; // null = create new
  nodeUrl: string;
  adminToken: string;
  creatorId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function ThemeModal({ open, theme, nodeUrl, adminToken, creatorId, onClose, onSaved }: ThemeModalProps) {
  const t = useTranslations("studio");
  const tc = useTranslations("common");

  const [name, setName] = useState(theme?.name ?? "");
  const [description, setDescription] = useState(theme?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(theme?.cover_url ?? null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(theme?.name ?? "");
    setDescription(theme?.description ?? "");
    setCoverPreview(theme?.cover_url ?? null);
    setCoverFile(null);
    setError(null);
  }, [theme, open]);

  function handleCoverPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    setError(null);
    try {
      let savedThemeId = theme?.theme_id;
      if (theme) {
        await adminUpdateTheme(nodeUrl, adminToken, creatorId, theme.theme_id, { name: name.trim(), description: description.trim() || undefined });
      } else {
        const created = await adminCreateTheme(nodeUrl, adminToken, creatorId, name.trim(), description.trim() || undefined);
        savedThemeId = created.theme_id;
      }
      // Upload cover if a new file was picked
      if (coverFile && savedThemeId) {
        setUploadingCover(true);
        await adminUploadThemeCover(nodeUrl, adminToken, creatorId, savedThemeId, coverFile).catch(() => undefined);
        setUploadingCover(false);
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
      setUploadingCover(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{theme ? t("editTheme") : t("createTheme")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={t("themeName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            fullWidth
          />
          <TextField
            label={t("themeDescription")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            rows={2}
            fullWidth
          />
          {/* Cover image */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
              {t("themeCover")}
            </Typography>
            <Box
              sx={{
                aspectRatio: "2 / 3",
                width: 100,
                bgcolor: "action.hover",
                borderRadius: 1,
                overflow: "hidden",
                border: "1px dashed",
                borderColor: "divider",
                position: "relative",
                cursor: "pointer",
              }}
              onClick={() => coverInputRef.current?.click()}
            >
              {coverPreview ? (
                <Box component="img" src={coverPreview} alt="cover" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                  <FileUploadOutlinedIcon sx={{ color: "text.disabled", fontSize: "1.5rem" }} />
                </Box>
              )}
            </Box>
            <input ref={coverInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleCoverPick} />
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: "block" }}>
              {t("themeCoverHint")}
            </Typography>
          </Box>
          {error && <Typography color="error" variant="caption">{error}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tc("cancel")}</Button>
        <Button onClick={() => void handleSave()} disabled={saving}>
          {uploadingCover ? t("uploadingCover") : saving ? tc("loading") : tc("save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
