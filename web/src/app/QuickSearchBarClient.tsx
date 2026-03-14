"use client";

import dynamic from "next/dynamic";

const QuickSearchBar = dynamic(() => import("./QuickSearchBar"), { ssr: false });

export default function QuickSearchBarClient() {
  return <QuickSearchBar />;
}
