/**
 * Per-app namespacing for browser-side storage keys + the BroadcastChannel
 * name. Two Scute apps loaded on the same origin used to silently overwrite
 * each other's session because every key was a global constant. This helper
 * suffixes the canonical key with `:<appId>` so multi-app coexistence works.
 *
 * Legacy unsuffixed keys are kept exported so the v0.7 read-through can
 * migrate live users forward without signing them out.
 *
 * See tickets/25-sdk-change-multi-app-session-isolation.md for the rollout.
 */

const LEGACY = {
  access: "sc-access-token",
  refresh: "sc-refresh-token",
  cred: "sct_cred_data",
  lastLogin: "sct_last_login",
  remember: "sc-remember-me",
} as const;

export type StorageKeyKind = keyof typeof LEGACY;

/**
 * Namespaced storage key: `<base>:<appId>`. Used for every read after v0.7
 * and every write.
 */
export const scopedKey = (
  kind: StorageKeyKind,
  appId: string | number,
): string => {
  if (appId === undefined || appId === null || appId === "") {
    // Defensive: a missing appId would collapse two different apps onto the
    // same key. ScuteClient's constructor already throws on a missing appId
    // so we shouldn't reach here in practice; the throw makes it loud if
    // something does.
    throw new Error("scopedKey called without an appId");
  }
  return `${LEGACY[kind]}${SEPARATOR}${appId}`;
};

/**
 * Separator between the canonical key prefix and the appId. Picked as `__`
 * (double underscore) so the resulting cookie name stays inside RFC 6265's
 * `token` grammar — `:`, while accepted by mainstream parsers, is a
 * separator per the spec and could be mangled by a strict intermediary.
 */
const SEPARATOR = "__";

/**
 * The original (unsuffixed) key. Only consumed by the legacy read-through
 * during v0.7. Removed from the read path in v0.8.
 */
export const legacyKey = (kind: StorageKeyKind): string => LEGACY[kind];

/**
 * The BroadcastChannel used to coordinate multi-tab sign-in/sign-out events
 * within the same app. Different apps get different channels so two apps
 * on the same origin don't cross-talk.
 */
export const scopedChannel = (appId: string | number): string => {
  if (appId === undefined || appId === null || appId === "") {
    throw new Error("scopedChannel called without an appId");
  }
  return `sct_broadcast${SEPARATOR}${appId}`;
};

/** Original BroadcastChannel name. Same legacy-only purpose as legacyKey. */
export const LEGACY_BROADCAST_CHANNEL = "sct_broadcast";
