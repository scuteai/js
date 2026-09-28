import { BaseNextResponse } from "next/dist/server/base-http";
import type { NextApiRequest, NextApiResponse } from "next";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import type { NextFetchEvent, NextRequest } from "next/server";
import { splitCookiesString } from "set-cookie-parser";

import internalHandler from "./internalHandler";
import { createPagesEdgeRuntimeClient } from "../pagesEdgeRuntimeClient";
import { createPagesServerClient } from "../pagesServerClient";
import { createRouteHandlerClient } from "../routeHandlerClient";
import { getBody, getInitUrl, type Promisable } from "../utils";
import type { ScuteNextjsClientConfig } from "../shared";

type RouteHandlerContext = {
  cookies: () => Promisable<ReadonlyRequestCookies>;
  headers: () => Promisable<Headers>;
};

async function ScuteRouteHandler(
  req: NextRequest,
  context: RouteHandlerContext,
  config?: ScuteNextjsClientConfig
) {
  const url = req.nextUrl;
  const method = req.method;
  const query = Object.fromEntries(url.searchParams);
  const body = await getBody(req);

  const cookies = Object.fromEntries(
    (await context.cookies()).getAll().map((c) => [c.name, c.value])
  );

  const headers = await context.headers();

  const scute = createRouteHandlerClient(
    {
      cookies: context.cookies,
    },
    config
  );

  const response = await internalHandler(scute, {
    url,
    method,
    query,
    body,
    cookies,
    headers,
  });

  return response;
}

async function ScuteNodeApiHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  config?: ScuteNextjsClientConfig
) {
  const url = getInitUrl(req);
  const method = req.method ?? "GET";
  const query = req.query as Record<string, string>;
  const body = req.body;
  const cookies = req.cookies as Record<string, string>;
  const headers = new Headers(req.headers as Record<string, string>);

  const scute = createPagesServerClient({ req, res }, config);
  const response = await internalHandler(scute, {
    url,
    method,
    query,
    body,
    cookies,
    headers,
  });

  res.statusCode = response.status;
  res.statusMessage = response.statusText;

  response.headers.forEach((value, key) => {
    // The append handling is special cased for `set-cookie`.
    if (key.toLowerCase() === "set-cookie") {
      for (const cookie of splitCookiesString(value)) {
        (res as unknown as BaseNextResponse).appendHeader(key, cookie);
      }
    } else {
      (res as unknown as BaseNextResponse).appendHeader(key, value);
    }
  });

  if (response.body && req.method !== "HEAD") {
    try {
      for await (const chunk of response.body as any) {
        res.write(chunk);
      }
    } finally {
      res.end();
    }
  } else {
    res.end();
  }
}

async function ScuteEdgeApiHandler(
  req: NextRequest,
  config?: ScuteNextjsClientConfig
) {
  const url = req.nextUrl;
  const method = req.method;
  const query = Object.fromEntries(url.searchParams);
  const body = await getBody(req);
  const cookies = Object.fromEntries(
    req.cookies.getAll().map((c) => [c.name, c.value])
  );
  const headers = req.headers;

  // Collects the session cookies the client writes; they are copied onto
  // the returned response below so they reach the browser.
  const cookieSink = { headers: new Headers() };
  const scute = createPagesEdgeRuntimeClient(
    { request: req, response: cookieSink },
    config
  );
  const response = await internalHandler(scute, {
    url,
    method,
    query,
    body,
    cookies,
    headers,
  });

  for (const cookie of splitCookiesString(
    cookieSink.headers.get("set-cookie") ?? ""
  )) {
    response.headers.append("set-cookie", cookie);
  }

  return response;
}

const isNodeResponse = (value: unknown): value is NextApiResponse =>
  !!value &&
  typeof (value as NextApiResponse).setHeader === "function" &&
  typeof (value as NextApiResponse).end === "function";

const isFetchEvent = (value: unknown): value is NextFetchEvent =>
  !!value && typeof (value as NextFetchEvent).waitUntil === "function";

const isNextRequest = (value: unknown): value is NextRequest =>
  !!value && typeof (value as NextRequest).nextUrl !== "undefined";

export function ScuteHandler(
  context: RouteHandlerContext,
  config?: ScuteNextjsClientConfig
): (req: NextRequest) => ReturnType<typeof ScuteRouteHandler>;
export function ScuteHandler(
  req: NextRequest,
  config?: ScuteNextjsClientConfig
): ReturnType<typeof ScuteEdgeApiHandler>;
export function ScuteHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  config?: ScuteNextjsClientConfig
): ReturnType<typeof ScuteNodeApiHandler>;
export function ScuteHandler(...args: any[]) {
  const [first, second, third] = args;

  if (isNodeResponse(second)) {
    // pages api (node): (req, res, config?)
    return ScuteNodeApiHandler(first, second, third);
  }

  if (isNextRequest(first)) {
    // pages api (edge): (req, config?) or (req, event, config?)
    return ScuteEdgeApiHandler(first, isFetchEvent(second) ? third : second);
  }

  // app router: (context, config?)
  return (req: NextRequest) => ScuteRouteHandler(req, first, second);
}
