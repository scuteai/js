import {
  type ScuteClient,
  SCUTE_ACCESS_STORAGE_KEY,
  ScuteUserData,
  InvalidAuthTokenError,
} from "@scute/core";
import type * as express from "express";
import type { IncomingMessage } from "http";
import { parse as parseCookies } from "cookie";

export interface AuthenticatedRequest extends express.Request {
  user: ScuteUserData;
}

export const authenticateRequest = async (
  req: IncomingMessage,
  scuteClient: ScuteClient
) => {
  let token = req.headers["authorization"];

  if (!token) {
    const cookies = parseCookies(req.headers["cookie"] ?? "");
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

export const scuteAuthMiddleware = (scuteClient: ScuteClient) => {
  const middleware = async function (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const user = await authenticateRequest(req, scuteClient);
      (req as AuthenticatedRequest).user = user;
      next();
    } catch (e) {
      // failed to authenticate
      next(e);
    }
  };

  return middleware;
};
