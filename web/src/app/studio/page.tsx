import { redirect } from "next/navigation";
import StudioWorkspace from "./StudioWorkspace";

// The studio page is a client-driven workspace — no server-side data fetch needed.
// Auth check (node connection) is handled client-side in StudioWorkspace.
export default function StudioPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string; theme?: string; media?: string }>;
}) {
  void searchParams; // used client-side only via URL state
  return <StudioWorkspace />;
}
