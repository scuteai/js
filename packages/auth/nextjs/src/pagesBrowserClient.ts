import { createClientComponentClient } from "./clientComponentClient";

export const createPagesBrowserClient: typeof createClientComponentClient = (
  config
) => {
  const handlersPrefix = !config?.handlersPrefix?.startsWith("api")
    ? `api/${config?.handlersPrefix ?? ""}`
    : config.handlersPrefix;

  return createClientComponentClient({
    ...config,
    handlersPrefix,
  });
};
