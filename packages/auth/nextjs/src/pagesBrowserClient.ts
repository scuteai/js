import { createClientComponentClient } from "./clientComponentClient";

export const createPagesBrowserClient: typeof createClientComponentClient = (
  config
) => {
  // Pages Router API routes live under /api: make sure the prefix starts
  // with an `api` path segment, adding it only when it is missing.
  const segments = (config?.handlersPrefix ?? "")
    .split("/")
    .filter((segment) => !!segment);
  if (segments[0] !== "api") {
    segments.unshift("api");
  }
  const handlersPrefix = segments.join("/");

  return createClientComponentClient({
    ...config,
    handlersPrefix,
  });
};
