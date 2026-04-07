import { prepareIsolatedE2EState, waitForAppPages } from "./test-state";

export default async function globalSetup(): Promise<void> {
  await prepareIsolatedE2EState();
  await waitForAppPages();
}
