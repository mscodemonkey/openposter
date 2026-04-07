"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";

import { loadIssuerToken } from "@/lib/issuer_storage";
import { onCreatorConnectionChanged, saveCreatorConnection, validateCreatorConnection } from "@/lib/storage";

type NodeDescriptor = {
  protocol: string;
  api_versions: string[];
  node_id: string;
  name: string;
  base_url: string;
  operator?: {
    display_name?: string | null;
  };
};

type PairResponse = {
  admin: {
    token: string;
    expires_at: string;
    node_id: string;
  };
};

function CodeDigitInput({
  value,
  onChange,
  onBackspace,
  onArrowLeft,
  onArrowRight,
  onPaste,
  inputRef,
  autoFocus,
  backgroundColor,
}: {
  value: string;
  onChange: (value: string) => void;
  onBackspace: () => void;
  onArrowLeft: () => void;
  onArrowRight: () => void;
  onPaste: (text: string) => void;
  inputRef: (element: HTMLInputElement | null) => void;
  autoFocus?: boolean;
  backgroundColor: string;
}) {
  return (
    <TextField
      inputRef={inputRef}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(-1))}
      onKeyDown={(e) => {
        if (e.key === "Backspace" && !value) onBackspace();
        if (e.key === "ArrowLeft") onArrowLeft();
        if (e.key === "ArrowRight") onArrowRight();
      }}
      onPaste={(e) => {
        e.preventDefault();
        onPaste(e.clipboardData.getData("text"));
      }}
      inputProps={{
        inputMode: "numeric",
        pattern: "[0-9]*",
        maxLength: 1,
        style: {
          textAlign: "center",
          fontSize: "2rem",
          fontWeight: 800,
          padding: "18px 0",
        },
        "aria-label": "Pairing code digit",
      }}
      sx={{
        width: { xs: 44, sm: 56 },
        "& .MuiOutlinedInput-root": {
          borderRadius: 3,
          backgroundColor,
        },
      }}
    />
  );
}

export default function NodeConnectionGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("connectFlow");
  const tc = useTranslations("common");
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [step, setStep] = useState<"node" | "pair">("node");
  const [nodeUrl, setNodeUrl] = useState("http://localhost:8081");
  const [resolvedUrl, setResolvedUrl] = useState("");
  const [descriptor, setDescriptor] = useState<NodeDescriptor | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);

  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    let active = true;

    async function boot() {
      const conn = await validateCreatorConnection();
      if (!active) return;
      setConnected(Boolean(conn));
      if (!conn) {
        setStep("node");
        setResolvedUrl("");
        setDescriptor(null);
        setStatus(null);
        setSubmitting(false);
        setChecking(false);
        setDigits(["", "", "", "", "", ""]);
      }
      setReady(true);
    }

    void boot();
    const unsubscribe = onCreatorConnectionChanged(() => {
      void boot();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const pairCode = useMemo(() => digits.join(""), [digits]);
  const logoCardBg = alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.72 : 0.68);
  const shellBg = theme.palette.mode === "dark"
    ? `linear-gradient(180deg, ${theme.palette.grey[900]} 0%, ${theme.palette.background.default} 38%, ${alpha(theme.palette.common.black, 0.92)} 100%)`
    : `linear-gradient(180deg, ${theme.palette.grey[100]} 0%, #f8f5ee 30%, ${theme.palette.background.default} 100%)`;
  const shellGlow = theme.palette.mode === "dark"
    ? `radial-gradient(circle at top left, ${alpha(theme.palette.error.main, 0.22)}, transparent 30%), radial-gradient(circle at bottom right, ${alpha(theme.palette.success.main, 0.18)}, transparent 28%)`
    : "radial-gradient(circle at top left, rgba(219,93,45,0.22), transparent 30%), radial-gradient(circle at bottom right, rgba(11,83,69,0.18), transparent 28%)";
  const panelBg = alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.8 : 0.82);
  const panelBorder = alpha(theme.palette.divider, theme.palette.mode === "dark" ? 0.4 : 0.8);
  const panelShadow = theme.palette.mode === "dark"
    ? "0 24px 80px rgba(0,0,0,0.38)"
    : "0 24px 80px rgba(42,31,18,0.10)";
  const digitBg = alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.9 : 0.82);
  const nodeMetaBg = alpha(theme.palette.background.default, theme.palette.mode === "dark" ? 0.9 : 0.7);

  function focusDigit(index: number) {
    digitRefs.current[Math.max(0, Math.min(index, 5))]?.focus();
  }

  function setDigit(index: number, value: string) {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    if (value && index < 5) focusDigit(index + 1);
  }

  function handleBackspace(index: number) {
    if (digits[index]) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }
    focusDigit(index - 1);
  }

  function pasteDigits(text: string) {
    const chars = text.replace(/\D/g, "").slice(0, 6).split("");
    if (chars.length === 0) return;
    setDigits((prev) => prev.map((_, idx) => chars[idx] ?? ""));
    focusDigit(Math.min(chars.length, 5));
  }

  async function findNode() {
    setChecking(true);
    setStatus(null);
    setDescriptor(null);

    try {
      const base = nodeUrl.trim().replace(/\/+$/, "");
      const r = await fetch(`${base}/.well-known/openposter-node`);
      if (!r.ok) throw new Error(t("errors.notReachable", { status: r.status }));

      const json = (await r.json()) as Partial<NodeDescriptor>;
      if (json.protocol !== "openposter") throw new Error(t("errors.notOpenPoster"));
      if (!Array.isArray(json.api_versions) || !json.api_versions.includes("v1")) {
        throw new Error(t("errors.unsupported"));
      }
      if (!json.base_url || !json.node_id || !json.name) {
        throw new Error(t("errors.invalidDescriptor"));
      }

      const normalized = base;
      setResolvedUrl(normalized);
      setDescriptor(json as NodeDescriptor);
      setDigits(["", "", "", "", "", ""]);
      setStep("pair");
      setStatus(null);
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setChecking(false);
    }
  }

  async function pairNode() {
    if (pairCode.length !== 6) {
      setStatus(t("errors.codeLength"));
      return;
    }

    setSubmitting(true);
    setStatus(null);
    try {
      const r = await fetch(`${resolvedUrl}/v1/admin/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pair_code: pairCode }),
      });
      if (!r.ok) {
        if (r.status === 403) throw new Error(t("errors.badCode"));
        throw new Error(t("errors.pairFailed", { status: r.status }));
      }

      const json = (await r.json()) as PairResponse;
      saveCreatorConnection({
        nodeUrl: resolvedUrl,
        adminToken: json.admin.token,
        creatorId: "",
      });
      setConnected(true);
      setStatus(null);
      if (!loadIssuerToken() && pathname !== "/register") {
        router.push("/register?next=/onboarding");
      }
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (connected) return <>{children}</>;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: shellBg,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: shellGlow,
          pointerEvents: "none",
        }}
      />
      <Container maxWidth="md" sx={{ position: "relative", py: { xs: 5, md: 8 } }}>
        <Stack spacing={3.5} alignItems="center">
          <Stack spacing={1.5} alignItems="center" textAlign="center" sx={{ maxWidth: 700 }}>
            <Box
              sx={{
                width: 88,
                height: 88,
                borderRadius: "28px",
                background: logoCardBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: panelShadow,
                backdropFilter: "blur(10px)",
                border: `1px solid ${panelBorder}`,
              }}
            >
              <Box
                component="img"
                src="/op-logo-small.svg"
                alt="OpenPoster"
                sx={{ width: 50, height: 50, display: "block" }}
              />
            </Box>
            <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: -1.2 }}>
              {t("title")}
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 500 }}>
              {step === "node" ? t("subtitleNode") : t("subtitlePair")}
            </Typography>
          </Stack>

          <Paper
            elevation={0}
            sx={{
              width: "100%",
              maxWidth: 920,
              p: { xs: 2.5, md: 4 },
              borderRadius: 6,
              border: `1px solid ${panelBorder}`,
              background: panelBg,
              backdropFilter: "blur(14px)",
              boxShadow: panelShadow,
            }}
          >
            <Stack spacing={3}>
              {step === "node" && (
                <Stack spacing={2.5}>
                  <Box>
                    <Typography variant="overline" sx={{ letterSpacing: "0.18em", color: "text.secondary" }}>
                      {t("stepOne")}
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 850 }}>
                      {t("findTitle")}
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                      {t("findBody")}
                    </Typography>
                  </Box>

                  <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
                    <TextField
                      fullWidth
                      label={t("nodeUrlLabel")}
                      value={nodeUrl}
                      onChange={(e) => setNodeUrl(e.target.value)}
                      placeholder="http://localhost:8081"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void findNode();
                      }}
                    />
                    <Button
                      variant="contained"
                      size="large"
                      onClick={() => void findNode()}
                      disabled={checking || !nodeUrl.trim()}
                      sx={{ minWidth: 170 }}
                    >
                      {checking ? tc("loading") : t("findButton")}
                    </Button>
                  </Stack>

                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    {t("findHint")}
                  </Alert>
                </Stack>
              )}

              {step === "pair" && descriptor && (
                <Stack spacing={2.5}>
                  <Stack spacing={0.75}>
                    <Typography variant="overline" sx={{ letterSpacing: "0.18em", color: "text.secondary" }}>
                      {t("stepTwo")}
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 850 }}>
                      {t("pairTitle")}
                    </Typography>
                    <Typography color="text.secondary">
                      {t("pairBody", { nodeName: descriptor.name })}
                    </Typography>
                  </Stack>

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.2fr) minmax(320px, 0.9fr)" },
                      gap: 2,
                    }}
                  >
                    <Paper
                      variant="outlined"
                      sx={{
                        overflow: "hidden",
                        borderRadius: 4,
                        minHeight: 420,
                        backgroundColor: theme.palette.mode === "dark" ? alpha(theme.palette.common.black, 0.72) : "#111",
                      }}
                    >
                      <Box
                        component="iframe"
                        title={t("iframeTitle")}
                        src={`${resolvedUrl}/admin/pair`}
                        sx={{ width: "100%", height: 420, border: 0, display: "block", backgroundColor: "#111" }}
                      />
                    </Paper>

                    <Stack spacing={2} justifyContent="space-between">
                      <Paper
                        variant="outlined"
                        sx={{ p: 2, borderRadius: 4, backgroundColor: nodeMetaBg }}
                      >
                        <Stack spacing={1}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                            {descriptor.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {t("nodeMeta", {
                              baseUrl: descriptor.base_url,
                              operator: descriptor.operator?.display_name || t("unknownOperator"),
                            })}
                          </Typography>
                        </Stack>
                      </Paper>

                      <Stack spacing={1.25}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                          {t("codeLabel")}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {t("codeHint")}
                        </Typography>
                        <Stack direction="row" spacing={1} justifyContent="center">
                          {digits.map((digit, idx) => (
                            <CodeDigitInput
                              key={idx}
                              value={digit}
                              backgroundColor={digitBg}
                              inputRef={(element) => {
                                digitRefs.current[idx] = element;
                              }}
                              autoFocus={idx === 0}
                              onChange={(value) => setDigit(idx, value)}
                              onBackspace={() => handleBackspace(idx)}
                              onArrowLeft={() => focusDigit(idx - 1)}
                              onArrowRight={() => focusDigit(idx + 1)}
                              onPaste={pasteDigits}
                            />
                          ))}
                        </Stack>
                      </Stack>

                      <Stack spacing={1.25}>
                        <Button
                          variant="contained"
                          size="large"
                          onClick={() => void pairNode()}
                          disabled={submitting || pairCode.length !== 6}
                        >
                          {submitting ? tc("loading") : t("connectButton")}
                        </Button>
                        <Button
                          variant="text"
                          onClick={() => {
                            setStep("node");
                            setStatus(null);
                          }}
                        >
                          {t("changeNode")}
                        </Button>
                        <Button
                          variant="text"
                          href={`${resolvedUrl}/admin/pair`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("openNewTab")}
                        </Button>
                      </Stack>
                    </Stack>
                  </Box>
                </Stack>
              )}

              {status && (
                <Alert severity="error" sx={{ borderRadius: 3 }}>
                  {status}
                </Alert>
              )}
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}
