const HEALTH_URLS = [
  process.env.OPENPOSTER_NODE_A_URL ?? "http://localhost:8081/v1/health",
  process.env.OPENPOSTER_NODE_B_URL ?? "http://localhost:8082/v1/health",
  process.env.OPENPOSTER_INDEXER_URL ?? "http://localhost:8090/v1/health",
  process.env.OPENPOSTER_ISSUER_URL ?? "http://localhost:8085/v1/health",
];

const PAGE_URLS = [
  process.env.OPENPOSTER_WEB_BASE_URL ?? "http://localhost:3000",
  process.env.OPENPOSTER_DIAG_BASE_URL ?? "http://localhost:3001",
];

async function waitForOk(url: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  let lastError = "timed out";

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

export default async function globalSetup(): Promise<void> {
  for (const url of HEALTH_URLS) {
    await waitForOk(url, 60_000);
  }
  for (const url of PAGE_URLS) {
    await waitForOk(url, 60_000);
  }
}
