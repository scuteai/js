import {
  type ScuteClient,
  InvalidAuthTokenError,
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
      throw new InvalidAuthTokenError();
    }
  }

  const { data, error } = await scuteClient.getUser(token);

  if (error) {
    if (error instanceof InvalidAuthTokenError) {
      throw error;
    } else {
      throw new Error("Unknown authenticate error");
    }
  }

  return data.user;
};
