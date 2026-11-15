// "Last used" on the sign-in: the way this browser last finished signing
// in, kept in localStorage (nothing goes to the API, and it says nothing
// about anyone until they sign in here). A method is noted as "pending"
// when the visitor starts it, and becomes the last used one only once a
// session arrives: a link opened in another tab, an OAuth or SSO round
// trip, a passkey or a code all land on the same rule.

/**
 * How a sign-in was finished: "email" (a link or a code), "phone" (a code
 * by text), "passkey", "sso", or an OAuth provider like "google".
 */
export type LastUsedMethod = "email" | "phone" | "passkey" | "sso" | (string & {});

const LAST_KEY = "scute_last_auth_method";
const PENDING_KEY = "scute_last_auth_pending";
// A start older than this didn't lead to the session that arrives now.
const PENDING_TTL_MS = 60 * 60 * 1000;

const store = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

/** The way this browser last signed in, or null. */
export function getLastUsedMethod(): LastUsedMethod | null {
  try {
    return store()?.getItem(LAST_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Note the way a sign-in was started; it becomes the last used one when
 * the session arrives (commitLastUsedMethod). For a sign-in your page
 * starts itself, like SSO: markLastUsedMethod("sso") before leaving.
 */
export function markLastUsedMethod(method: LastUsedMethod): void {
  try {
    store()?.setItem(PENDING_KEY, JSON.stringify({ method, at: Date.now() }));
  } catch {}
}

/** The started method, if one is pending and recent. */
export function pendingLastUsedMethod(): LastUsedMethod | null {
  try {
    const raw = store()?.getItem(PENDING_KEY);
    if (!raw) return null;
    const { method, at } = JSON.parse(raw) as { method?: unknown; at?: unknown };
    if (typeof method !== "string" || !method || typeof at !== "number" || Date.now() - at > PENDING_TTL_MS) return null;
    return method;
  } catch {
    return null;
  }
}

/** A session arrived: the pending method becomes the last used one. Returns it. */
export function commitLastUsedMethod(): LastUsedMethod | null {
  const method = pendingLastUsedMethod();
  try {
    const s = store();
    s?.removeItem(PENDING_KEY);
    if (method) s?.setItem(LAST_KEY, method);
  } catch {}
  return method;
}

/** Ways that start from the email (or phone) field and its Continue button. */
export const FIELD_METHODS: readonly string[] = ["email", "phone", "passkey", "sso"];
