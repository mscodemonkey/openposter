"use client";

import Nav from "./nav";
import NodeConnectionGate from "@/components/NodeConnectionGate";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <NodeConnectionGate>
      <Nav />
      {children}
    </NodeConnectionGate>
  );
}
