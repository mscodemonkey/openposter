export type NodeConfig = {
  label: string;
  url: string;
  adminToken: string;
};

export type DiagConfig = {
  nodes: NodeConfig[];
  indexerUrl: string;
  issuerUrl: string;
};

const STORAGE_KEY = "op-diag-config";

export const DEFAULT_CONFIG: DiagConfig = {
  nodes: [
    { label: "Node A", url: "http://localhost:8081", adminToken: "" },
  ],
  indexerUrl: "http://localhost:8090",
  issuerUrl: "http://localhost:8085",
};

export function loadConfig(): DiagConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) } as DiagConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(cfg: DiagConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}
