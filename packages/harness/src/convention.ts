import type { Args, Resource, Tier, ToolConfig, ToolsConfig, ToolSpec } from "./types";

const words = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const camel = (snake: string) => snake.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

const isKey = (v: unknown): v is string | number =>
  (typeof v === "string" && v.length > 0) || (typeof v === "number" && Number.isFinite(v));

/**
 * The permission a tool needs, by convention: the first word is the action,
 * the rest is the resource. refund_invoice -> "invoice:refund",
 * resetUserMfa -> "user_mfa:reset", search -> "search".
 */
export function toolPermission(name: string): string {
  const w = words(name);
  // A name with no letters or digits still gets checked (and denied as unknown), never skipped.
  if (!w.length) return name || "unnamed_tool";
  if (w.length < 2) return w[0];
  return `${w.slice(1).join("_")}:${w[0]}`;
}

export function toolSpec(name: string, tools: ToolsConfig | undefined, defaultTier: Tier): ToolSpec {
  const raw = tools?.[name];
  const config: ToolConfig = raw === false ? { permission: false } : raw ?? {};
  const permission = config.permission === false ? null : config.permission ?? toolPermission(name);
  let action: string | null = permission;
  let resourceType: string | undefined;
  if (permission && permission.includes(":")) {
    const at = permission.indexOf(":");
    resourceType = permission.slice(0, at);
    action = permission.slice(at + 1);
  }

  return {
    name,
    permission,
    action,
    resourceType,
    tier: config.tier ?? defaultTier,
    resource(args: Args): Resource | undefined {
      if (config.resource) return config.resource(args);
      if (!resourceType) return undefined;
      const keyArg = config.key ?? [`${resourceType}_id`, `${camel(resourceType)}Id`, "id"].find((k) => isKey(args?.[k]));
      const key = keyArg !== undefined && isKey(args?.[keyArg]) ? String(args[keyArg]) : undefined;
      const attributes = config.attributes?.(args);
      const resource: Resource = { type: resourceType };
      if (key) resource.key = key;
      if (attributes && Object.keys(attributes).length) resource.attributes = attributes;
      return resource;
    },
  };
}

/** "invoice:42", or "invoice" without a key: how Scute names one object. */
export const resourceRef = (resource?: Resource) =>
  resource ? (resource.key ? `${resource.type}:${resource.key}` : resource.type) : "";
