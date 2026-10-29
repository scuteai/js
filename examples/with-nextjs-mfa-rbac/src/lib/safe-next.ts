/**
 * Where to go after signing in. Only a path on this site: "/account" yes,
 * "https://evil.example" or "//evil.example" no (an open redirect).
 */
export function safeNext(next: string | undefined, fallback = "/account") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
