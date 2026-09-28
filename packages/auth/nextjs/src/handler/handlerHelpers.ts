import { CSRF_HANDLER, CSRF_TOKEN_KEY, internalPrefix } from "./constants";

export const getHandlerPath = <T extends string>(
  handler: T,
  prefix?: string
) => {
  const trimmedPrefix = prefix
    ? prefix
        .split("/")
        .filter((x) => x)
        .join("/")
    : null;

  const base = trimmedPrefix ? `/${trimmedPrefix}` : "";

  return `${base}/${internalPrefix}/${handler}` as `/${typeof trimmedPrefix}/${typeof internalPrefix}/${T}`;
};

/**
 * Performs a standard fetch after requesting a CSRF token and adding it to the headers.
 *
 * The request is never sent without a token: if the CSRF endpoint answers
 * with an error (or an empty token) a non-ok Response describing that is
 * returned instead, and if the CSRF request itself fails the returned
 * promise rejects.
 */
export async function fetchWithCsrf(
  handler: string,
  init?: RequestInit,
  prefix?: string
): Promise<Response> {
  const csrfPath = getHandlerPath(CSRF_HANDLER, prefix);

  let csrfResponse: Response;
  try {
    csrfResponse = await fetch(csrfPath);
  } catch (cause) {
    const error = new Error(`[Scute] Could not fetch a CSRF token from ${csrfPath}`);
    (error as Error & { cause?: unknown }).cause = cause;
    throw error;
  }

  const token = csrfResponse.ok ? await csrfResponse.text() : "";

  if (!token) {
    const status =
      csrfResponse.status >= 400 && csrfResponse.status <= 599
        ? csrfResponse.status
        : 500;
    return new Response(
      `[Scute] Could not get a CSRF token from ${csrfPath} (status ${csrfResponse.status})`,
      { status, statusText: "CSRF token unavailable" }
    );
  }

  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set(CSRF_TOKEN_KEY, token);

  return fetch(getHandlerPath(handler, prefix), { ...init, headers });
}
