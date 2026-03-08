export const ISSUER_BASE_URL =
  process.env.NEXT_PUBLIC_ISSUER_BASE_URL || "http://localhost:8085";

export type IssuerUser = {
  user_id: string;
  email: string;
  display_name: string | null;
};

export type SignupResponse = { user: IssuerUser; token: string };
export type LoginResponse = { user: IssuerUser; token: string };

export function issuerBase(): string {
  return ISSUER_BASE_URL.replace(/\/+$/, "");
}

async function readErrorMessage(r: Response, fallback: string): Promise<string> {
  const j = (await r.json().catch(() => null)) as unknown;
  const msg = (j as { error?: { message?: string } } | null)?.error?.message;
  return msg || fallback;
}

export async function issuerSignup(params: {
  email: string;
  password: string;
  display_name?: string;
}): Promise<SignupResponse> {
  const r = await fetch(`${issuerBase()}/v1/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: params.email,
      password: params.password,
      display_name: params.display_name || null,
    }),
  });
  if (!r.ok) {
    throw new Error(await readErrorMessage(r, `signup failed: ${r.status}`));
  }
  return (await r.json()) as SignupResponse;
}

export async function issuerLogin(params: {
  email: string;
  password: string;
}): Promise<LoginResponse> {
  const r = await fetch(`${issuerBase()}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: params.email, password: params.password }),
  });
  if (!r.ok) {
    throw new Error(await readErrorMessage(r, `login failed: ${r.status}`));
  }
  return (await r.json()) as LoginResponse;
}

export async function issuerMe(token: string): Promise<IssuerUser> {
  const r = await fetch(`${issuerBase()}/v1/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`me failed: ${r.status}`);
  const json = (await r.json()) as { user: IssuerUser };
  return json.user;
}

export async function issuerHandleAvailability(handle: string): Promise<boolean> {
  const u = new URL(`${issuerBase()}/v1/creator/availability`);
  u.searchParams.set("handle", handle);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`availability failed: ${r.status}`);
  const json = (await r.json()) as { available: boolean };
  return !!json.available;
}

export async function issuerClaimHandle(token: string, handle: string): Promise<void> {
  const r = await fetch(`${issuerBase()}/v1/creator/claim_handle`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ handle }),
  });
  if (!r.ok) {
    throw new Error(await readErrorMessage(r, `claim handle failed: ${r.status}`));
  }
}

export async function issuerClaimNode(
  token: string,
  params: { local_url: string; node_admin_token: string }
): Promise<unknown> {
  const r = await fetch(`${issuerBase()}/v1/nodes/claim`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  if (!r.ok) {
    throw new Error(await readErrorMessage(r, `claim node failed: ${r.status}`));
  }
  return (await r.json()) as unknown;
}

export async function issuerStartUrlClaim(token: string, public_url: string): Promise<unknown> {
  const r = await fetch(`${issuerBase()}/v1/url_claims/start`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ public_url }),
  });
  if (!r.ok) {
    throw new Error(await readErrorMessage(r, `start url claim failed: ${r.status}`));
  }
  return (await r.json()) as unknown;
}

export async function issuerVerifyUrlClaim(
  token: string,
  params: { public_url: string; method: "dns" | "http" }
): Promise<unknown> {
  const r = await fetch(`${issuerBase()}/v1/url_claims/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  if (!r.ok) {
    throw new Error(await readErrorMessage(r, `verify url claim failed: ${r.status}`));
  }
  return (await r.json()) as unknown;
}

export async function issuerAttachUrl(
  token: string,
  params: { node_id: string; public_url: string }
): Promise<unknown> {
  const r = await fetch(`${issuerBase()}/v1/nodes/attach_url`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  if (!r.ok) {
    throw new Error(await readErrorMessage(r, `attach url failed: ${r.status}`));
  }
  return (await r.json()) as unknown;
}
