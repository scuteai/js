import { Layer, LayerContext } from "./types";

/**
 * args rung: cap a numeric argument (e.g. refund amount <= 500). Not-applicable
 * (missing/non-numeric arg) passes; tighten with requireArgs if you need it set.
 */
export function maxAmount(field: string, limit: number): Layer {
  return ({ args }: LayerContext) => {
    const v = Number(args?.[field]);
    if (!isFinite(v)) return { ok: true };
    return v <= limit
      ? { ok: true }
      : { ok: false, reason: `${field} ${v} exceeds limit ${limit}` };
  };
}

/** args rung: an argument must be one of an allowlist. */
export function argAllowlist(field: string, allowed: string[]): Layer {
  const set = new Set(allowed);
  return ({ args }: LayerContext) => {
    const v = args?.[field];
    if (v === undefined || v === null) return { ok: true };
    return set.has(String(v))
      ? { ok: true }
      : { ok: false, reason: `${field}=${v} is not allowed` };
  };
}

/** args rung: required arguments must be present. */
export function requireArgs(...fields: string[]): Layer {
  return ({ args }: LayerContext) => {
    const missing = fields.filter((f) => args?.[f] === undefined || args?.[f] === null);
    return missing.length === 0
      ? { ok: true }
      : { ok: false, reason: `missing required args: ${missing.join(", ")}` };
  };
}

/** Counts hits within a sliding window, keyed by an arbitrary string. */
export interface VelocityStore {
  hit(key: string, windowMs: number): number | Promise<number>;
}

/** In-memory velocity store (per-process). Production uses Redis (api side). */
export class MemoryVelocityStore implements VelocityStore {
  private hits = new Map<string, number[]>();
  constructor(private now: () => number = () => Date.now()) {}

  hit(key: string, windowMs: number): number {
    const t = this.now();
    const arr = (this.hits.get(key) || []).filter((ts) => ts > t - windowMs);
    arr.push(t);
    this.hits.set(key, arr);
    return arr.length;
  }
}

export interface VelocityOptions {
  max: number;
  windowMs: number;
  store: VelocityStore;
  /** key the rate limit by; defaults to action + actor id/kind */
  keyBy?: (ctx: LayerContext) => string;
}

/** velocity rung: at most `max` calls per `windowMs` per key. */
export function velocity(opts: VelocityOptions): Layer {
  return async (ctx: LayerContext) => {
    const key = opts.keyBy
      ? opts.keyBy(ctx)
      : `${ctx.action}:${ctx.identity.id ?? ctx.identity.kind}`;
    const count = await opts.store.hit(key, opts.windowMs);
    return count <= opts.max
      ? { ok: true }
      : { ok: false, reason: `rate limit ${opts.max}/${opts.windowMs}ms exceeded` };
  };
}
