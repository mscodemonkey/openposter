"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function QuickSearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [q, setQ] = useState("");

  // Keep the box in sync with the current URL (so it feels predictable).
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
    <div className="op-quick-search">
      <form
        className="op-row"
        style={{ width: "100%", gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = q.trim();
          if (!trimmed) {
            // If the user clears it, take them back to the main posters page.
            router.push("/browse");
            return;
          }
          router.push(`/browse?q=${encodeURIComponent(trimmed)}`);
        }}
      >
        <input
          className="op-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Quick search posters…"
          aria-label="Quick search posters"
          style={{ flex: 1, minWidth: 220 }}
        />
        <button type="submit" className="op-btn">
          Search
        </button>
        {onBrowse && q.trim() !== "" && (
          <button
            type="button"
            className="op-btn"
            onClick={() => {
              setQ("");
              router.push("/browse");
            }}
          >
            Clear
          </button>
        )}
      </form>
    </div>
  );
}
