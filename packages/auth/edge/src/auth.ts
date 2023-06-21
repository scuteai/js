import type { ScuteClient } from "@scute/auth-core";

export const authenticateRequest = async (
  request: Request,
  scuteClient: ScuteClient
) => {
  const token = request.headers.get("Authorization");
  if (!token) {
    // TODO: meaningful error
    return { data: null, error: true };
  }

  return scuteClient.getUser(token);
};
