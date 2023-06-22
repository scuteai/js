import type { ScuteClient } from "@scute/core";
//import { authenticateRequest as _authenticateRequest } from "@scute/edge";
import type { IncomingMessage } from "http";

export const authenticateRequest = async (
  req: IncomingMessage,
  scuteClient: ScuteClient
) => {
  // TODO: cookie fallback
  const token = req.headers["authorization"];
  if (!token) {
    // TODO: meaningful error
    return { data: null, error: true };
  }

  return scuteClient.getUser(token);
};
