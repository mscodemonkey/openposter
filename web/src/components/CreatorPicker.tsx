"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

export type CreatorOption = {
  creator_id: string;
  display_name: string | null;
  count?: number;
};

type CreatorsResponse = {
  results: Array<{
    creator_id: string;
    display_name: string | null;
    count: number;
  }>;
};

export default function CreatorPicker({
  indexerBaseUrl,
  value,
  onChange,
  initialOptions,
  label,
  query,
  onQueryChange,
}: {
  indexerBaseUrl: string;
  value: string;
  onChange: (creatorId: string) => void;
  initialOptions: CreatorOption[];
  label: string;
  query?: string;
  onQueryChange?: (q: string) => void;
}) {
  const t = useTranslations("creatorPicker");
  const id = useId();
  const inputId = `${id}-input`;
  const selectId = `${id}-select`;
  const base = useMemo(() => indexerBaseUrl.replace(/\/+$/, ""), [indexerBaseUrl]);

  const [q, setQ] = useState(query || "");
  const [options, setOptions] = useState<CreatorOption[]>(initialOptions);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // controlled query support (so parent can sync query to URL)
    if (typeof query === "string" && query !== q) setQ(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    // If initialOptions changes (facets refresh), keep options in sync when not actively searching.
    if (q.trim() === "") setOptions(initialOptions);
  }, [initialOptions, q]);

  useEffect(() => {
    const term = q.trim();
    if (term === "") {
      setOptions(initialOptions);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const u = new URL(base + "/v1/creators");
          u.searchParams.set("limit", "50");
          u.searchParams.set("q", term);
          const r = await fetch(u.toString());
          if (!r.ok) throw new Error(`creators failed: ${r.status}`);
          const json = (await r.json()) as CreatorsResponse;
          setOptions(json.results);
        } catch {
          // ignore; keep previous options
        } finally {
          setLoading(false);
        }
      })();
    }, 250);

    return () => clearTimeout(timer);
  }, [base, initialOptions, q]);

  return (
    <div>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        className="op-input"
        value={q}
        onChange={(e) => {
          const next = e.target.value;
          setQ(next);
          onQueryChange?.(next);
        }}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchAriaLabel")}
      />
      <select
        id={selectId}
        className="op-select op-mt-8"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("selectAriaLabel")}
      >
        <option value="">{t("anyOption")}</option>
        {options.map((c) => (
          <option key={c.creator_id} value={c.creator_id}>
            {c.display_name || c.creator_id}
            {typeof c.count === "number" ? ` (${c.count})` : ""}
          </option>
        ))}
      </select>
      <div className="op-subtle op-text-sm op-mt-6" aria-live="polite">
        {loading ? t("searching") : t("hint")}
      </div>
    </div>
  );
}
