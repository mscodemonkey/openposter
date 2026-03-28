import { Suspense } from "react";
import StudioWorkspace from "./StudioWorkspace";

// The studio page is a client-driven workspace — no server-side data fetch needed.
// Auth check (node connection) is handled client-side in StudioWorkspace.
export default function StudioPage() {
  return (
    <Suspense>
      <StudioWorkspace />
    </Suspense>
  );
}
