import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const SNAPSHOT_ROOT = path.join(
  os.tmpdir(),
  `openposter-e2e-state-${createHash("sha1").update(ROOT).digest("hex").slice(0, 12)}`,
);
const SNAPSHOT_META = path.join(SNAPSHOT_ROOT, "snapshot.json");
const ISOLATED_E2E = /^(1|true|yes)$/i.test(process.env.OPENPOSTER_E2E_ISOLATED ?? "");

const STATEFUL_SERVICES = ["directory", "node-a", "node-b", "indexer", "issuer"];

const STATE_DIRS = [
  { name: "directory", dir: path.join(ROOT, "reference-node/data-directory") },
  { name: "node-a", dir: path.join(ROOT, "reference-node/data-a") },
  { name: "node-b", dir: path.join(ROOT, "reference-node/data-b") },
  { name: "indexer", dir: path.join(ROOT, "indexer/data") },
  { name: "issuer", dir: path.join(ROOT, "issuer/data") },
] as const;

function toResetUrl(url: string): string {
  if (url.includes("/dev/reset")) return url;
  return `${url.replace(/\/+$/, "")}/dev/reset?token=${encodeURIComponent(process.env.OPENPOSTER_TEST_RESET_TOKEN ?? "dev-reset")}`;
}

const RESET_URLS = [
  process.env.OPENPOSTER_TEST_DIRECTORY_URL ?? "http://localhost:8084",
  process.env.OPENPOSTER_TEST_NODE_URL ?? "http://localhost:8081",
  process.env.OPENPOSTER_TEST_NODE_B_URL ?? "http://localhost:8082",
  process.env.OPENPOSTER_INDEXER_BASE_URL ?? "http://localhost:8090",
  process.env.OPENPOSTER_ISSUER_BASE_URL ?? "http://localhost:8085",
  process.env.OPENPOSTER_TEST_PLEX_URL ?? "http://localhost:32401",
].map(toResetUrl);

const HEALTH_URLS = [
  process.env.OPENPOSTER_DIRECTORY_URL ?? "http://localhost:8084/v1/health",
  process.env.OPENPOSTER_NODE_A_URL ?? "http://localhost:8081/v1/health",
  process.env.OPENPOSTER_NODE_B_URL ?? "http://localhost:8082/v1/health",
  process.env.OPENPOSTER_INDEXER_URL ?? "http://localhost:8090/v1/health",
  process.env.OPENPOSTER_ISSUER_URL ?? "http://localhost:8085/v1/health",
];

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

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

function dockerCompose(args: string[]): void {
  execFileSync("docker", ["compose", ...args], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

async function waitForStatefulServices(): Promise<void> {
  for (const url of HEALTH_URLS) {
    await waitForOk(url, 60_000);
  }
}

async function copyStateDirs(destinationRoot: string): Promise<void> {
  await mkdir(destinationRoot, { recursive: true });
  for (const entry of STATE_DIRS) {
    const dest = path.join(destinationRoot, entry.name);
    await rm(dest, { recursive: true, force: true });
    await cp(entry.dir, dest, { recursive: true, force: true });
  }
}

async function restoreStateDirs(sourceRoot: string): Promise<void> {
  for (const entry of STATE_DIRS) {
    const source = path.join(sourceRoot, entry.name);
    await rm(entry.dir, { recursive: true, force: true });
    await cp(source, entry.dir, { recursive: true, force: true });
  }
}

async function resetForTests(): Promise<void> {
  for (const url of RESET_URLS) {
    let success = false;
    let lastStatus: number | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await fetch(url);
      if (response.ok) {
        success = true;
        break;
      }
      lastStatus = response.status;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
    if (!success) {
      throw new Error(`Reset failed for ${url}: ${lastStatus ?? "unknown"}`);
    }
  }
}

export async function restorePreservedStateIfNeeded(): Promise<void> {
  if (ISOLATED_E2E) return;
  if (!(await pathExists(SNAPSHOT_META))) return;

  const meta = JSON.parse(await readFile(SNAPSHOT_META, "utf8")) as { snapshotDir: string };
  dockerCompose(["stop", ...STATEFUL_SERVICES]);
  await restoreStateDirs(meta.snapshotDir);
  dockerCompose(["up", "-d", ...STATEFUL_SERVICES]);
  await waitForStatefulServices();
  await rm(SNAPSHOT_ROOT, { recursive: true, force: true });
}

export async function prepareIsolatedE2EState(): Promise<void> {
  if (ISOLATED_E2E) {
    await waitForStatefulServices();
    await resetForTests();
    return;
  }
  await restorePreservedStateIfNeeded();

  const snapshotDir = path.join(SNAPSHOT_ROOT, "original");
  await rm(SNAPSHOT_ROOT, { recursive: true, force: true });
  await mkdir(SNAPSHOT_ROOT, { recursive: true });

  dockerCompose(["stop", ...STATEFUL_SERVICES]);
  await copyStateDirs(snapshotDir);
  await writeFile(SNAPSHOT_META, JSON.stringify({ snapshotDir }), "utf8");
  dockerCompose(["up", "-d", ...STATEFUL_SERVICES]);
  await waitForStatefulServices();
  await resetForTests();
}

export async function restorePreservedState(): Promise<void> {
  if (ISOLATED_E2E) return;
  if (!(await pathExists(SNAPSHOT_META))) return;

  const meta = JSON.parse(await readFile(SNAPSHOT_META, "utf8")) as { snapshotDir: string };
  dockerCompose(["stop", ...STATEFUL_SERVICES]);
  await restoreStateDirs(meta.snapshotDir);
  dockerCompose(["up", "-d", ...STATEFUL_SERVICES]);
  await waitForStatefulServices();
  await rm(SNAPSHOT_ROOT, { recursive: true, force: true });
}

export async function waitForAppPages(): Promise<void> {
  const pageUrls = [
    process.env.OPENPOSTER_WEB_BASE_URL ?? "http://localhost:3000",
    process.env.OPENPOSTER_DIAG_BASE_URL ?? "http://localhost:3001",
  ];
  for (const url of pageUrls) {
    await waitForOk(url, 60_000);
  }
}
