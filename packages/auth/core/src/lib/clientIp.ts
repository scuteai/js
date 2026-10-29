import { ScuteError } from "./errors";

/**
 * The header a server sends the signing-in person's IP address in. Scute
 * reads it only on calls made with the app's secret key (from your server),
 * checks the address against the workspace's IP rules and records it as the
 * person's address. Without it, a sign-in your server starts isn't checked
 * against IP rules.
 */
export const SCUTE_CLIENT_IP_HEADER = "X-Scute-Client-IP";

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HEXTET = /^[0-9a-f]{1,4}$/i;

const isIPv6 = (value: string) => {
  if (!value.includes(":")) return false;

  // An embedded IPv4 address (::ffff:203.0.113.24) stands for two groups.
  let hex = value;
  const lastColon = value.lastIndexOf(":");
  const last = value.slice(lastColon + 1);
  if (last.includes(".")) {
    if (!IPV4.test(last)) return false;
    hex = `${value.slice(0, lastColon + 1)}0:0`;
  }

  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  const halves = hex.split("::");
  if (halves.length > 2) return false;
  if (halves.length === 1) {
    const all = groups(hex);
    return all.length === 8 && all.every((g) => HEXTET.test(g));
  }
  // "::" stands for at least one group of zeros.
  const named = [...groups(halves[0]), ...groups(halves[1])];
  return named.length <= 7 && named.every((g) => HEXTET.test(g));
};

/** true when `value` is one IPv4 or IPv6 address (not a range or a list). */
export const isClientIp = (value: string) => IPV4.test(value) || isIPv6(value);

/**
 * The address to send, trimmed; undefined when there is none or it isn't one
 * address. For values read from a request, where a bad value should just not
 * be sent.
 */
export const normalizeClientIp = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && isClientIp(trimmed) ? trimmed : undefined;
};

/**
 * Like normalizeClientIp, for a value the developer passed: null or undefined
 * (or an empty string) means none, anything else must be one address. A list
 * (a raw X-Forwarded-For) or a range throws, since Scute would refuse it.
 */
export const requireClientIp = (value: string | null | undefined): string | undefined => {
  if (value === null || value === undefined || value.trim() === "") return undefined;
  const ip = normalizeClientIp(value);
  if (!ip) {
    throw new ScuteError({
      message: `[Scute] clientIp must be one IP address, got ${JSON.stringify(value)}. Pass the person's address, not a list (like a raw X-Forwarded-For) or a range.`,
    });
  }
  return ip;
};
