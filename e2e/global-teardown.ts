import { restorePreservedState } from "./test-state";

export default async function globalTeardown(): Promise<void> {
  await restorePreservedState();
}
