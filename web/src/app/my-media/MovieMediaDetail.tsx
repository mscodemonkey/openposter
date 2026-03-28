"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import ReplayIcon from "@mui/icons-material/Replay";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import UploadIcon from "@mui/icons-material/Upload";

import AltArtworkDrawer from "@/components/AltArtworkDrawer";
import ArtworkSourceBadge from "@/components/ArtworkSourceBadge";
import MediaCard, { CardChip, MediaCardOverlay, ToolbarButton } from "@/components/MediaCard";
import type { PosterEntry } from "@/lib/types";
import { getSubscriptions, getCreatorSubscriptions, subscribeCreator, unsubscribeCreator } from "@/lib/subscriptions";
import { applyToPlexPoster } from "@/lib/plex";
import { getArtworkSettings, getTrackedArtwork, fetchPosterFromNode, untrackArtwork } from "@/lib/artwork-tracking";
import type { TrackedArtwork } from "@/lib/artwork-tracking";
import { thumbUrl, artUrl, logoUrl, squareUrl } from "@/lib/media-server";
import type { MediaItem } from "@/lib/media-server";
import { POSTER_GRID_COLS, BACKDROP_GRID_COLS, CHIP_HEIGHT } from "@/lib/grid-sizes";

// ─── MovieMediaDetail ─────────────────────────────────────────────────────────

interface MovieMediaDetailProps {
  item: MediaItem;
  conn: { nodeUrl: string; adminToken: string };
  onBack: () => void;
  collections: MediaItem[];
  onNavigateToCollection: (id: string, title: string) => void;
  fromCollectionTitle?: string;
  serverName?: string;
}

export default function MovieMediaDetail({ item, conn, onBack, collections, onNavigateToCollection, fromCollectionTitle, serverName }: MovieMediaDetailProps) {
  const t = useTranslations("myMedia");

  // ── Drawer ────────────────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"poster" | "backdrop" | "square" | "logo">("poster");
  const [drawerPosters, setDrawerPosters] = useState<PosterEntry[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // ── Apply ─────────────────────────────────────────────────────────────────
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [appliedPreviews, setAppliedPreviews] = useState<Map<string, string>>(new Map());
  const [opAppliedKeys, setOpAppliedKeys] = useState<Set<string>>(new Set());
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const [resettingIds, setResettingIds] = useState<Set<string>>(new Set());

  // ── Tracking ──────────────────────────────────────────────────────────────
  const [trackedArtwork, setTrackedArtwork] = useState<Map<string, TrackedArtwork>>(new Map());

  // ── Failures ──────────────────────────────────────────────────────────────
  const [failedThumb, setFailedThumb] = useState(false);
  const [failedShowBg, setFailedShowBg] = useState(false);
  const [failedSquare, setFailedSquare] = useState(false);
  const [failedLogo, setFailedLogo] = useState(false);

  // ── Card selection ────────────────────────────────────────────────────────
  const [posterSelected, setPosterSelected] = useState(false);
  const [backdropSelected, setBackdropSelected] = useState(false);
  const [squareSelected, setSquareSelected] = useState(false);
  const [logoSelected, setLogoSelected] = useState(false);

  // ── Collection membership menu (for movies in multiple collections) ────────
  const [collMenuAnchor, setCollMenuAnchor] = useState<HTMLElement | null>(null);

  // ── Subscriptions ─────────────────────────────────────────────────────────
  const [creatorSubs, setCreatorSubs] = useState<Set<string>>(
    () => new Set(getCreatorSubscriptions().map((s) => s.creatorId)),
  );

  // ── Snackbar ──────────────────────────────────────────────────────────────
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  // ── TMDB data (for reset) ─────────────────────────────────────────────────
  const [tmdbData, setTmdbData] = useState<{ poster_path?: string; backdrop_path?: string } | null>(null);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    getArtworkSettings(conn.nodeUrl, conn.adminToken)
      .then((s) => setAutoUpdateEnabled(s.auto_update_artwork));
  }, [conn.nodeUrl, conn.adminToken]);

  useEffect(() => {
    getTrackedArtwork(conn.nodeUrl, conn.adminToken).then((all) => {
      const map = new Map<string, TrackedArtwork>();
      for (const r of all) {
        if (r.media_item_id === item.id || r.media_item_id === item.id + ":bg" || r.media_item_id === item.id + ":square" || r.media_item_id === item.id + ":logo") {
          map.set(r.media_item_id, r);
        }
      }
      // Backfill missing creator display names
      for (const [key, found] of map) {
        if (!found.creator_display_name && found.node_base && found.poster_id) {
          fetchPosterFromNode(found.node_base, found.poster_id).then((p) => {
            if (p) setTrackedArtwork((prev) => new Map(prev).set(key, { ...found, creator_display_name: p.creator.display_name }));
          });
        }
      }
      setTrackedArtwork(map);
    });
  }, [item.id, conn.nodeUrl, conn.adminToken]);

  useEffect(() => {
    if (!item.tmdb_id) return;
    fetch(`/api/tmdb/movie/${item.tmdb_id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { poster_path?: string; backdrop_path?: string } | null) => setTmdbData(d))
      .catch(() => {});
  }, [item.tmdb_id]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const subs = useMemo(() => getSubscriptions(), []);

  const memberCollections = useMemo(() => {
    if (!item.collection_ids?.length) return [];
    return item.collection_ids
      .map((id) => collections.find((c) => c.id === id))
      .filter((c): c is MediaItem => c != null);
  }, [item.collection_ids, collections]);

  const trackedItem = trackedArtwork.get(item.id) ?? null;
  const trackedBackdrop = trackedArtwork.get(item.id + ":bg") ?? null;
  const trackedSquare = trackedArtwork.get(item.id + ":square") ?? null;
  const trackedLogo = trackedArtwork.get(item.id + ":logo") ?? null;

  const isPosterCreatorSubscribed = !!(trackedItem?.creator_id && creatorSubs.has(trackedItem.creator_id));
  const isBackdropCreatorSubscribed = !!(trackedBackdrop?.creator_id && creatorSubs.has(trackedBackdrop.creator_id));

  const isPosterResetting = resettingIds.has(item.id);
  const isBackdropResetting = resettingIds.has(item.id + ":bg");
  const isSquareResetting = resettingIds.has(item.id + ":square");
  const isLogoResetting = resettingIds.has(item.id + ":logo");

  const heroBackdropUrl = failedShowBg
    ? null
    : (appliedPreviews.get(item.id + ":bg") ?? artUrl(conn.nodeUrl, conn.adminToken, item.id));

  const drawerAppliedPosterId =
    drawerMode === "backdrop" ? (trackedBackdrop?.poster_id ?? null)
    : drawerMode === "square" ? (trackedSquare?.poster_id ?? null)
    : drawerMode === "logo" ? (trackedLogo?.poster_id ?? null)
    : (trackedItem?.poster_id ?? null);

  const visibleDrawerPosters = useMemo(
    () => drawerPosters.filter((p) => p.poster_id !== drawerAppliedPosterId),
    [drawerPosters, drawerAppliedPosterId],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openDrawer(mode: "poster" | "backdrop" | "square" | "logo") {
    setDrawerMode(mode);
    setDrawerPosters([]);
    setDrawerOpen(true);
    if (!item.tmdb_id) return;
    setDrawerLoading(true);
    const params = mode === "backdrop"
      ? `tmdb_id=${item.tmdb_id}&type=backdrop`
      : mode === "square"
        ? `tmdb_id=${item.tmdb_id}&type=movie&kind=square`
        : mode === "logo"
          ? `tmdb_id=${item.tmdb_id}&type=movie&kind=logo`
          : `tmdb_id=${item.tmdb_id}&type=movie`;
    fetch(`/api/search?${params}&limit=200`)
      .then((r) => r.json())
      .then((d: { results: PosterEntry[] }) =>
        setDrawerPosters(
          d.results.filter(
            (p) => typeof p.assets?.preview?.url === "string" && p.assets.preview.url.length > 0,
          ),
        ),
      )
      .catch(() => setDrawerPosters([]))
      .finally(() => setDrawerLoading(false));
  }

  async function handleApply(poster: PosterEntry) {
    setApplyingId(poster.poster_id);
    const key = drawerMode === "backdrop" ? item.id + ":bg" : drawerMode === "square" ? item.id + ":square" : drawerMode === "logo" ? item.id + ":logo" : item.id;
    try {
      await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
        imageUrl: poster.assets.full.url,
        tmdbId: item.tmdb_id ?? undefined,
        plexRatingKey: item.id,
        mediaType: "movie",
        isBackdrop: drawerMode === "backdrop",
        isSquare: drawerMode === "square",
        isLogo: drawerMode === "logo",
        posterId: poster.poster_id,
        assetHash: poster.assets.full.hash,
        creatorId: poster.creator.creator_id,
        creatorDisplayName: poster.creator.display_name,
        themeId: poster.media.theme_id ?? undefined,
        nodeBase: poster.creator.home_node,
        autoUpdate: autoUpdateEnabled,
      });
      setAppliedIds((prev) => new Set([...prev, poster.poster_id]));
      setAppliedPreviews((prev) => new Map(prev).set(key, poster.assets.preview.url));
      setOpAppliedKeys((prev) => new Set([...prev, key]));
      setTrackedArtwork((prev) =>
        new Map(prev).set(key, {
          media_item_id: key,
          tmdb_id: item.tmdb_id,
          media_type: "movie",
          poster_id: poster.poster_id,
          asset_hash: poster.assets.full.hash,
          creator_id: poster.creator.creator_id,
          creator_display_name: poster.creator.display_name,
          theme_id: poster.media.theme_id ?? null,
          node_base: poster.creator.home_node,
          applied_at: new Date().toISOString(),
          auto_update: autoUpdateEnabled,
          plex_label: null,
        }),
      );
      setSnack({ open: true, message: t("applySuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("applyError"), severity: "error" });
    } finally {
      setApplyingId(null);
    }
  }

  async function handleReset() {
    setResettingIds((prev) => new Set([...prev, item.id]));
    let newPreviewUrl: string | null = null;
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, item.id);
      setTrackedArtwork((prev) => { const m = new Map(prev); m.delete(item.id); return m; });
      setAppliedPreviews((prev) => { const m = new Map(prev); m.delete(item.id); return m; });
      setOpAppliedKeys((prev) => { const s = new Set(prev); s.delete(item.id); return s; });
      setAppliedIds(new Set());
      if (tmdbData?.poster_path) {
        await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
          imageUrl: `https://image.tmdb.org/t/p/original${tmdbData.poster_path}`,
          plexRatingKey: item.id,
          mediaType: "movie",
        });
        newPreviewUrl = `https://image.tmdb.org/t/p/w780${tmdbData.poster_path}`;
      }
      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    } finally {
      setResettingIds((prev) => { const s = new Set(prev); s.delete(item.id); return s; });
      if (newPreviewUrl) {
        setAppliedPreviews((prev) => new Map(prev).set(item.id, newPreviewUrl!));
      } else {
        const bustUrl = `${thumbUrl(conn.nodeUrl, conn.adminToken, item.id)}&v=${Date.now()}`;
        setAppliedPreviews((prev) => new Map(prev).set(item.id, bustUrl));
      }
    }
  }

  async function handleResetBackdrop() {
    const bgKey = item.id + ":bg";
    setResettingIds((prev) => new Set([...prev, bgKey]));
    let newPreviewUrl: string | null = null;
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, bgKey).catch(() => {});
      setTrackedArtwork((prev) => { const m = new Map(prev); m.delete(bgKey); return m; });
      setAppliedPreviews((prev) => { const m = new Map(prev); m.delete(bgKey); return m; });
      setOpAppliedKeys((prev) => { const s = new Set(prev); s.delete(bgKey); return s; });
      setAppliedIds(new Set());
      if (tmdbData?.backdrop_path) {
        await applyToPlexPoster(conn.nodeUrl, conn.adminToken, {
          imageUrl: `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}`,
          plexRatingKey: item.id,
          mediaType: "movie",
          isBackdrop: true,
        });
        newPreviewUrl = `https://image.tmdb.org/t/p/w780${tmdbData.backdrop_path}`;
      }
      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    } finally {
      setResettingIds((prev) => { const s = new Set(prev); s.delete(bgKey); return s; });
      if (newPreviewUrl) {
        setAppliedPreviews((prev) => new Map(prev).set(bgKey, newPreviewUrl!));
      } else {
        const bustUrl = `${artUrl(conn.nodeUrl, conn.adminToken, item.id)}&v=${Date.now()}`;
        setAppliedPreviews((prev) => new Map(prev).set(bgKey, bustUrl));
      }
    }
  }

  async function handleResetSquare() {
    const squareKey = item.id + ":square";
    setResettingIds((prev) => new Set([...prev, squareKey]));
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, squareKey).catch(() => {});
      await fetch(
        `${conn.nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/square/${encodeURIComponent(item.id)}/cache`,
        { method: "DELETE", headers: { Authorization: `Bearer ${conn.adminToken}` } },
      ).catch(() => {});
      setTrackedArtwork((prev) => { const m = new Map(prev); m.delete(squareKey); return m; });
      setAppliedPreviews((prev) => { const m = new Map(prev); m.delete(squareKey); return m; });
      setOpAppliedKeys((prev) => { const s = new Set(prev); s.delete(squareKey); return s; });
      setAppliedIds(new Set());
      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    } finally {
      setResettingIds((prev) => { const s = new Set(prev); s.delete(squareKey); return s; });
      const bustUrl = `${squareUrl(conn.nodeUrl, conn.adminToken, item.id)}&v=${Date.now()}`;
      setAppliedPreviews((prev) => new Map(prev).set(squareKey, bustUrl));
    }
  }

  async function handleResetLogo() {
    const logoKey = item.id + ":logo";
    setResettingIds((prev) => new Set([...prev, logoKey]));
    try {
      await untrackArtwork(conn.nodeUrl, conn.adminToken, logoKey).catch(() => {});
      // Bust the logo cache on the node so Plex's default clearLogo is re-fetched
      await fetch(
        `${conn.nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/logo/${encodeURIComponent(item.id)}/cache`,
        { method: "DELETE", headers: { Authorization: `Bearer ${conn.adminToken}` } },
      ).catch(() => {});
      setTrackedArtwork((prev) => { const m = new Map(prev); m.delete(logoKey); return m; });
      setAppliedPreviews((prev) => { const m = new Map(prev); m.delete(logoKey); return m; });
      setOpAppliedKeys((prev) => { const s = new Set(prev); s.delete(logoKey); return s; });
      setAppliedIds(new Set());
      setSnack({ open: true, message: t("resetSuccess"), severity: "success" });
    } catch (e) {
      setSnack({ open: true, message: e instanceof Error ? e.message : t("resetError"), severity: "error" });
    } finally {
      setResettingIds((prev) => { const s = new Set(prev); s.delete(logoKey); return s; });
      // Cache-bust the logo preview
      const bustUrl = `${logoUrl(conn.nodeUrl, conn.adminToken, item.id)}&v=${Date.now()}`;
      setAppliedPreviews((prev) => new Map(prev).set(logoKey, bustUrl));
    }
  }

  function handlePosterCreatorSubscribe() {
    const cid = trackedItem?.creator_id;
    if (!cid) return;
    if (isPosterCreatorSubscribed) {
      unsubscribeCreator(cid);
      setCreatorSubs((prev) => { const s = new Set(prev); s.delete(cid); return s; });
    } else {
      subscribeCreator({ creatorId: cid, creatorDisplayName: trackedItem?.creator_display_name ?? cid, nodeBase: trackedItem?.node_base ?? "" });
      setCreatorSubs((prev) => new Set([...prev, cid]));
    }
  }

  function handleBackdropCreatorSubscribe() {
    const cid = trackedBackdrop?.creator_id;
    if (!cid) return;
    if (isBackdropCreatorSubscribed) {
      unsubscribeCreator(cid);
      setCreatorSubs((prev) => { const s = new Set(prev); s.delete(cid); return s; });
    } else {
      subscribeCreator({ creatorId: cid, creatorDisplayName: trackedBackdrop?.creator_display_name ?? cid, nodeBase: trackedBackdrop?.node_base ?? "" });
      setCreatorSubs((prev) => new Set([...prev, cid]));
    }
  }

  // ── Image sources ─────────────────────────────────────────────────────────

  const posterSrc = appliedPreviews.get(item.id) ?? thumbUrl(conn.nodeUrl, conn.adminToken, item.id);
  const backdropSrc = appliedPreviews.get(item.id + ":bg") ?? artUrl(conn.nodeUrl, conn.adminToken, item.id);
  const squareSrc = appliedPreviews.get(item.id + ":square") ?? squareUrl(conn.nodeUrl, conn.adminToken, item.id);
  const logoSrc = appliedPreviews.get(item.id + ":logo") ?? logoUrl(conn.nodeUrl, conn.adminToken, item.id);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Hero backdrop */}
      {heroBackdropUrl && (
        <Box sx={{ position: "fixed", top: 64, left: 0, right: 0, height: "75vh", zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
          <Box
            component="img"
            src={heroBackdropUrl}
            alt=""
            sx={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", opacity: 0.2, filter: "grayscale(0.75)" }}
            onError={() => setFailedShowBg(true)}
          />
          <Box sx={{ position: "absolute", inset: 0, background: (theme) => `linear-gradient(to bottom, transparent 40%, ${theme.palette.background.default} 95%)` }} />
        </Box>
      )}

      {/* Page content above hero */}
      <Box sx={{ position: "relative", zIndex: 1 }}>

        {/* Back button */}
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 2 }}>
          <IconButton size="small" onClick={onBack} aria-label={fromCollectionTitle ?? t("backToMovies")}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography variant="body2" color="text.secondary" sx={{ cursor: "pointer" }} onClick={onBack}>
            {fromCollectionTitle ?? t("backToMovies")}
          </Typography>
        </Stack>

        {/* Title */}
        <Typography variant="h5" gutterBottom>
          {item.title}{item.year ? ` (${item.year})` : ""}
        </Typography>

        {/* Collection membership subtitle */}
        {memberCollections.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ letterSpacing: "0.05em", textTransform: "uppercase", mb: 3, display: "block" }}>
            {t("movieNotAMember")}
          </Typography>
        ) : memberCollections.length === 1 ? (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {t("movieMemberOf", { title: memberCollections[0].title })}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              sx={{ fontSize: "0.6rem", py: 0.25, lineHeight: 1.5 }}
              onClick={() => onNavigateToCollection(memberCollections[0].id, memberCollections[0].title)}
            >
              {fromCollectionTitle ? t("movieBackToCollection") : t("movieViewCollection")}
            </Button>
          </Stack>
        ) : (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {t("movieMemberOfMany", { n: memberCollections.length })}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              endIcon={<ArrowDropDownIcon />}
              sx={{ fontSize: "0.6rem", py: 0.25, lineHeight: 1.5 }}
              onClick={(e) => setCollMenuAnchor(e.currentTarget)}
            >
              {fromCollectionTitle ? t("movieBackToCollection") : t("movieViewCollection")}
            </Button>
            <Menu anchorEl={collMenuAnchor} open={Boolean(collMenuAnchor)} onClose={() => setCollMenuAnchor(null)}>
              {memberCollections.map((c) => (
                <MenuItem key={c.id} dense onClick={() => { setCollMenuAnchor(null); onNavigateToCollection(c.id, c.title); }}>
                  {c.title}
                </MenuItem>
              ))}
            </Menu>
          </Stack>
        )}

        {/* ── Posters section ──────────────────────────────────────────── */}
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t("poster")}
        </Typography>

        <Box sx={{ width: "var(--op-backdrop-width, 340px)", mb: 5 }}>
          <MediaCard
            image={failedThumb ? null : posterSrc}
            alt={item.title}
            aspectRatio="2 / 3"
            selected={posterSelected}
            resetting={isPosterResetting}
            imageFailed={failedThumb}
            onImageError={() => setFailedThumb(true)}
            onClick={() => { setPosterSelected(true); setBackdropSelected(false); }}
            onClose={() => setPosterSelected(false)}
            tooltip="View alternate artwork and other options"
            creatorName={trackedItem?.creator_display_name}
            badge={<ArtworkSourceBadge source={trackedItem ? "openposter" : failedThumb ? null : "plex"} creatorName={trackedItem?.creator_display_name} mediaServer={serverName} />}
            chip={<CardChip label="MOVIE" color="success" />}
            overlayChip={<CardChip label="POSTER" color="warning" />}
            overlay={
              <MediaCardOverlay title={item.title} subtitle={item.year ? String(item.year) : ""}>
                <ToolbarButton
                  icon={isPosterCreatorSubscribed ? <StarIcon sx={{ fontSize: "1.1rem" }} /> : <StarBorderIcon sx={{ fontSize: "1.1rem" }} />}
                  disabled={!trackedItem}
                  active={isPosterCreatorSubscribed}
                  tooltip={isPosterCreatorSubscribed ? "Subscribed" : "Subscribe to creator"}
                  menuItems={trackedItem?.creator_id ? [
                    {
                      label: isPosterCreatorSubscribed ? "Unsubscribe" : "Subscribe",
                      onClick: () => { handlePosterCreatorSubscribe(); setTimeout(() => setPosterSelected(false), 500); },
                    },
                  ] : undefined}
                />
                <ToolbarButton
                  icon={<ReplayIcon sx={{ fontSize: "1.1rem" }} />}
                  disabled={!trackedItem}
                  tooltip="Reset to default"
                  onClick={(e) => { e.stopPropagation(); setPosterSelected(false); handleReset(); }}
                />
                <ToolbarButton
                  icon={<UploadIcon fontSize="small" />}
                  tooltip="Upload your own poster"
                  onClick={(e) => { e.stopPropagation(); setPosterSelected(false); }}
                />
                <ToolbarButton
                  icon={<PhotoLibraryIcon fontSize="small" />}
                  tooltip="Select a new poster from an OpenPoster creator"
                  onClick={(e) => { e.stopPropagation(); setPosterSelected(false); openDrawer("poster"); }}
                />
              </MediaCardOverlay>
            }
          />
        </Box>

        {/* ── Backdrops section ─────────────────────────────────────────── */}
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t("backdrop")}
        </Typography>

        <Box sx={{ width: "var(--op-backdrop-width, 340px)", mb: 4 }}>
          <MediaCard
            image={failedShowBg ? null : backdropSrc}
            alt={`${item.title} backdrop`}
            aspectRatio="16 / 9"
            selected={backdropSelected}
            resetting={isBackdropResetting}
            imageFailed={failedShowBg}
            onImageError={() => setFailedShowBg(true)}
            onClick={() => { setBackdropSelected(true); setPosterSelected(false); }}
            onClose={() => setBackdropSelected(false)}
            tooltip="View alternate backdrops and other options"
            creatorName={trackedBackdrop?.creator_display_name}
            badge={<ArtworkSourceBadge source={(trackedBackdrop || opAppliedKeys.has(item.id + ":bg")) ? "openposter" : failedShowBg ? null : "plex"} creatorName={trackedBackdrop?.creator_display_name} mediaServer={serverName} />}
            chip={<CardChip label="MOVIE" color="success" />}
            overlayChip={<CardChip label="BACKDROP" color="warning" />}
            overlay={
              <MediaCardOverlay title={item.title} subtitle={item.year ? String(item.year) : ""}>
                <ToolbarButton
                  icon={isBackdropCreatorSubscribed ? <StarIcon sx={{ fontSize: "1.1rem" }} /> : <StarBorderIcon sx={{ fontSize: "1.1rem" }} />}
                  disabled={!trackedBackdrop}
                  active={isBackdropCreatorSubscribed}
                  tooltip={isBackdropCreatorSubscribed ? "Subscribed" : "Subscribe to creator"}
                  menuItems={trackedBackdrop?.creator_id ? [{ label: isBackdropCreatorSubscribed ? "Unsubscribe" : "Subscribe", onClick: () => { handleBackdropCreatorSubscribe(); setBackdropSelected(false); } }] : undefined}
                />
                <ToolbarButton
                  icon={<ReplayIcon sx={{ fontSize: "1.1rem" }} />}
                  disabled={!trackedBackdrop}
                  tooltip="Reset to default backdrop"
                  onClick={(e) => { e.stopPropagation(); setBackdropSelected(false); handleResetBackdrop(); }}
                />
                <ToolbarButton icon={<UploadIcon sx={{ fontSize: "1.1rem" }} />} tooltip="Upload your own backdrop" onClick={(e) => { e.stopPropagation(); setBackdropSelected(false); }} />
                <ToolbarButton
                  icon={<PhotoLibraryIcon sx={{ fontSize: "1.1rem" }} />}
                  tooltip="Select a backdrop from an OpenPoster creator"
                  onClick={(e) => { e.stopPropagation(); setBackdropSelected(false); openDrawer("backdrop"); }}
                />
              </MediaCardOverlay>
            }
          />
        </Box>

        {/* ── Square section ────────────────────────────────────────────── */}
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t("squareArtwork")}
        </Typography>

        <Box sx={{ width: "var(--op-backdrop-width, 340px)", mb: 4 }}>
          <MediaCard
            image={failedSquare ? null : squareSrc}
            alt={`${item.title} square`}
            aspectRatio="1 / 1"
            selected={squareSelected}
            resetting={isSquareResetting}
            imageFailed={failedSquare}
            onImageError={() => setFailedSquare(true)}
            onClick={() => { setSquareSelected(true); setPosterSelected(false); setBackdropSelected(false); setLogoSelected(false); }}
            onClose={() => setSquareSelected(false)}
            tooltip="View alternate square artwork and other options"
            imageBackground="repeating-conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%) 0 0 / 20px 20px"
            creatorName={trackedSquare?.creator_display_name}
            badge={<ArtworkSourceBadge source={(trackedSquare || opAppliedKeys.has(item.id + ":square")) ? "openposter" : failedSquare ? null : "plex"} creatorName={trackedSquare?.creator_display_name} mediaServer={serverName} />}
            chip={<CardChip label="MOVIE" color="success" />}
            overlayChip={<CardChip label="SQUARE" color="warning" />}
            overlay={
              <MediaCardOverlay title={item.title} subtitle={item.year ? String(item.year) : ""}>
                <ToolbarButton
                  icon={<ReplayIcon sx={{ fontSize: "1.1rem" }} />}
                  disabled={!trackedSquare}
                  tooltip="Reset to default square artwork"
                  onClick={(e) => { e.stopPropagation(); setSquareSelected(false); handleResetSquare(); }}
                />
                <ToolbarButton icon={<UploadIcon sx={{ fontSize: "1.1rem" }} />} tooltip="Upload your own square artwork" onClick={(e) => { e.stopPropagation(); setSquareSelected(false); }} />
                <ToolbarButton
                  icon={<PhotoLibraryIcon sx={{ fontSize: "1.1rem" }} />}
                  tooltip="Select square artwork from an OpenPoster creator"
                  onClick={(e) => { e.stopPropagation(); setSquareSelected(false); openDrawer("square"); }}
                />
              </MediaCardOverlay>
            }
          />
        </Box>

        {/* ── Logo section ──────────────────────────────────────────────── */}
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t("logo")}
        </Typography>

        <Box sx={{ width: "var(--op-backdrop-width, 340px)", mb: 4 }}>
          <MediaCard
            image={failedLogo ? null : logoSrc}
            alt={`${item.title} logo`}
            aspectRatio="16 / 9"
            selected={logoSelected}
            resetting={isLogoResetting}
            imageFailed={failedLogo}
            onImageError={() => setFailedLogo(true)}
            onClick={() => { setLogoSelected(true); setPosterSelected(false); setBackdropSelected(false); setSquareSelected(false); }}
            onClose={() => setLogoSelected(false)}
            tooltip="View alternate logos and other options"
            imageBackground="repeating-conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%) 0 0 / 20px 20px"
            creatorName={trackedLogo?.creator_display_name}
            badge={<ArtworkSourceBadge source={(trackedLogo || opAppliedKeys.has(item.id + ":logo")) ? "openposter" : failedLogo ? null : "plex"} creatorName={trackedLogo?.creator_display_name} mediaServer={serverName} />}
            chip={<CardChip label="MOVIE" color="success" />}
            overlayChip={<CardChip label="LOGO" color="warning" />}
            overlay={
              <MediaCardOverlay title={item.title} subtitle={item.year ? String(item.year) : ""}>
                <ToolbarButton
                  icon={<ReplayIcon sx={{ fontSize: "1.1rem" }} />}
                  disabled={!trackedLogo}
                  tooltip="Reset to default logo"
                  onClick={(e) => { e.stopPropagation(); setLogoSelected(false); handleResetLogo(); }}
                />
                <ToolbarButton icon={<UploadIcon sx={{ fontSize: "1.1rem" }} />} tooltip="Upload your own logo" onClick={(e) => { e.stopPropagation(); setLogoSelected(false); }} />
                <ToolbarButton
                  icon={<PhotoLibraryIcon sx={{ fontSize: "1.1rem" }} />}
                  tooltip="Select a logo from an OpenPoster creator"
                  onClick={(e) => { e.stopPropagation(); setLogoSelected(false); openDrawer("logo"); }}
                />
              </MediaCardOverlay>
            }
          />
        </Box>

      </Box>

      {/* ── Drawer ───────────────────────────────────────────────────────── */}
      <AltArtworkDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={item.title}
        subtitle={drawerMode === "backdrop" ? t("backdrops").toUpperCase() : drawerMode === "square" ? t("squares").toUpperCase() : drawerMode === "logo" ? t("logos").toUpperCase() : t("posters").toUpperCase()}
        posters={visibleDrawerPosters}
        loading={drawerLoading}
        hasTmdbId={!!item.tmdb_id}
        isBackdrop={drawerMode === "backdrop"}
        aspectRatio={drawerMode === "square" || drawerMode === "logo" ? "16 / 9" : undefined}
        gridCols={drawerMode === "poster" ? POSTER_GRID_COLS : BACKDROP_GRID_COLS}
        chip={{ label: "MOVIE", color: "success" }}
        subs={subs}
        appliedIds={appliedIds}
        applyingId={applyingId}
        othersLabel={drawerMode === "backdrop" ? "Other backdrops for this movie" : drawerMode === "square" ? "Other square artwork for this movie" : drawerMode === "logo" ? "Other logos for this movie" : "Other posters for this movie"}
        onApply={handleApply}
      />

      {/* ── Snackbar ─────────────────────────────────────────────────────── */}
      <Snackbar
        open={snack.open}
        autoHideDuration={snack.severity === "success" ? 4000 : null}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack((prev) => ({ ...prev, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
