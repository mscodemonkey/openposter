"use client";

import { useEffect, useMemo, useState } from "react";

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

    const t = setTimeout(() => {
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

    return () => clearTimeout(t);
  }, [base, initialOptions, q]);

  return (
    <div>
      <div className="op-label-hint">{label}</div>
      <input
        className="op-input"
        value={q}
        onChange={(e) => {
          const next = e.target.value;
          setQ(next);
          onQueryChange?.(next);
        }}
        placeholder="Search creators…"
      />
      <select
        className="op-select op-mt-8"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">(any)</option>
        {options.map((c) => (
          <option key={c.creator_id} value={c.creator_id}>
            {c.display_name || c.creator_id}
            {typeof c.count === "number" ? ` (${c.count})` : ""}
          </option>
        ))}
      </select>
      <div className="op-subtle op-text-sm op-mt-6">
        {loading ? "Searching…" : "Tip: leave blank to show top creators."}
      </div>
    </div>
  );
}
