import {
  type ScuteClient,
  ScuteError,
  SCUTE_ACCESS_STORAGE_KEY,
} from "@scute/core";
import { parse as parseCookies } from "cookie";

export const authenticateRequest = async (
  request: Request,
  scuteClient: ScuteClient
) => {
  let token = request.headers.get("Authorization");
  if (!token) {
    const cookies = parseCookies(request.headers.get("cookie") ?? "");
    token = cookies[SCUTE_ACCESS_STORAGE_KEY];

    if (!token) {
      return {
        data: null,
        error: new ScuteError({ message: "Token not found" }),
      };
    }
  }

  return scuteClient.getUser(token);
};
