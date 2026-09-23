import "server-only";

import { getSupabaseEnv } from "@/lib/supabase/env";

function resolveAuthRecoverUrl(projectUrl: string): URL {
  const base = projectUrl.endsWith("/") ? projectUrl : `${projectUrl}/`;
  return new URL("auth/v1/recover", base);
}

export async function sendGoTruePasswordRecoveryEmail(input: {
  email: string;
  redirectTo: string;
}): Promise<
  | { ok: true }
  | { ok: false; message: string; code?: string; status: number }
> {
  const { url: projectUrl, anonKey } = getSupabaseEnv();
  const recoverUrl = resolveAuthRecoverUrl(projectUrl);
  recoverUrl.searchParams.set("redirect_to", input.redirectTo);

  const response = await fetch(recoverUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      redirect_to: input.redirectTo,
    },
    body: JSON.stringify({
      email: input.email,
      gotrue_meta_security: {},
    }),
    cache: "no-store",
  });

  if (response.ok) {
    return { ok: true };
  }

  let payload: {
    msg?: string;
    message?: string;
    error?: string;
    code?: string;
  } = {};

  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // ignore non-JSON error bodies
  }

  return {
    ok: false,
    status: response.status,
    code: payload.code,
    message:
      payload.msg ??
      payload.message ??
      payload.error ??
      "Password recovery request failed.",
  };
}
