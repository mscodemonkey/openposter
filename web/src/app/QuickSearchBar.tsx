"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import TextField from "@mui/material/TextField";

export default function QuickSearchBar() {
  const t = useTranslations("quickSearch");
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [q, setQ] = useState("");

  // Keep the box in sync with the current URL.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQ(sp.get("q") || "");
    } catch {
      // ignore
    }
  }, [sp]);

  const onBrowse = pathname === "/browse";

  return (
    <Box sx={{ borderBottom: 1, borderColor: "divider", py: 1.5, backgroundColor: "background.default" }}>
      <Container maxWidth="lg">
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = q.trim();
            if (!trimmed) {
              router.push("/browse");
              return;
            }
            router.push(`/browse?q=${encodeURIComponent(trimmed)}`);
          }}
          sx={{ display: "flex", gap: 1.5, alignItems: "center" }}
        >
          <TextField
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("placeholder")}
            size="small"
            fullWidth
            inputProps={{ "aria-label": t("ariaLabel") }}
          />
          <Button type="submit">{t("search")}</Button>
          {onBrowse && q.trim() !== "" && (
            <Button
              type="button"
              variant="outlined"
              onClick={() => {
                setQ("");
                router.push("/browse");
              }}
            >
              {t("clear")}
            </Button>
          )}
        </Box>
      </Container>
    </Box>
  );
}
