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
 * Performs a standard fetch after requesting a CSRF token and adding it to the headers
 */
export async function fetchWithCsrf(
  handler: string,
  init?: RequestInit,
  prefix?: string
): Promise<Response> {
  let token = "";
  try {
    token = await (await fetch(getHandlerPath(CSRF_HANDLER, prefix))).text();
  } catch {}

  init = {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "Content-Type": "application/json",
      [CSRF_TOKEN_KEY]: token,
    },
  };

  return fetch(getHandlerPath(handler, prefix), init);
}
