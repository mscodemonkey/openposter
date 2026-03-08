import type { IssuerUser } from "@/lib/issuer";

const KEY_TOKEN = "openposter.issuer.token.v1";
const KEY_USER = "openposter.issuer.user.v1";

export function loadIssuerToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY_TOKEN);
  } catch {
    return null;
  }
}

export function saveIssuerSession(token: string, user: IssuerUser): void {
  window.localStorage.setItem(KEY_TOKEN, token);
  window.localStorage.setItem(KEY_USER, JSON.stringify(user));
}

export function clearIssuerSession(): void {
  window.localStorage.removeItem(KEY_TOKEN);
  window.localStorage.removeItem(KEY_USER);
}

export function loadIssuerUser(): IssuerUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY_USER);
    if (!raw) return null;
    return JSON.parse(raw) as IssuerUser;
  } catch {
    return null;
  }
}
