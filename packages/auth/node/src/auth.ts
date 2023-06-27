import {
  type ScuteClient,
  ScuteError,
  SCUTE_ACCESS_STORAGE_KEY,
} from "@scute/core";
import type { IncomingMessage } from "http";
import type { RequestHandler } from "express";
import { parse as parseCookies } from "cookie";

export const authenticateRequest = async (
  req: IncomingMessage,
  scuteClient: ScuteClient
) => {
  let token = req.headers["authorization"];

  if (!token) {
    const cookies = parseCookies(req.headers["cookie"] ?? "");
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

export const scuteAuthMiddleware = (scuteClient: ScuteClient) => {
  const middleware: RequestHandler = async (req, res, next) => {
    const { data: user, error } = await authenticateRequest(req, scuteClient);
    if (!error) {
      // user authenticated
      (req as any).user = user;
    }
    next(error ? error : undefined);
  };

  return middleware;
};
