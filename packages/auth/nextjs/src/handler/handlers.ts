import internalHandler from "./internalHandler";
import { createPagesEdgeRuntimeClient } from "../pagesEdgeRuntimeClient";
import { createPagesServerClient } from "../pagesServerClient";
import { createRouteHandlerClient } from "../routeHandlerClient";
import { getBody, getInitUrl } from "../utils";

import { splitCookiesString } from "set-cookie-parser";
import type { NextApiRequest, NextApiResponse } from "next";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import type { NextFetchEvent, NextRequest } from "next/server";
import { BaseNextResponse } from "next/dist/server/base-http";

type RouteHandlerContext = {
  cookies: () => ReadonlyRequestCookies;
  headers: () => Headers;
};

async function ScuteRouteHandler(
  req: NextRequest,
  context: RouteHandlerContext
) {
  const url = req.nextUrl;
  const method = req.method;
  const query = Object.fromEntries(url.searchParams);
  const body = await getBody(req);
  const cookies = Object.fromEntries(
    (await context.cookies()).getAll().map((c) => [c.name, c.value])
  );
  const headers = await context.headers();

  const scute = createRouteHandlerClient({ cookies: context.cookies });
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

async function ScuteNodeApiHandler(req: NextApiRequest, res: NextApiResponse) {
  const url = getInitUrl(req);
  const method = req.method ?? "GET";
  const query = req.query as Record<string, string>;
  const body = req.body;
  const cookies = req.cookies as Record<string, string>;
  const headers = new Headers(req.headers as Record<string, string>);

  const scute = createPagesServerClient({ req, res });
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

async function ScuteEdgeApiHandler(req: NextRequest) {
  const url = req.nextUrl;
  const method = req.method;
  const query = Object.fromEntries(url.searchParams);
  const body = await getBody(req);
  const cookies = Object.fromEntries(
    req.cookies.getAll().map((c) => [c.name, c.value])
  );
  const headers = req.headers;

  const scute = createPagesEdgeRuntimeClient({ request: req });
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

export function ScuteHandler(context: {
  cookies: () => ReadonlyRequestCookies;
  headers: () => Headers;
}): (req: NextRequest) => ReturnType<typeof ScuteRouteHandler>;
export function ScuteHandler(
  req: NextRequest
): ReturnType<typeof ScuteEdgeApiHandler>;
export function ScuteHandler(
  req: NextApiRequest,
  res: NextApiResponse
): ReturnType<typeof ScuteNodeApiHandler>;
export function ScuteHandler(
  ...args:
    | [RouteHandlerContext]
    | [NextRequest]
    | [NextApiRequest, NextApiResponse]
) {
  if (args.length === 1) {
    if (typeof (args[0] as NextRequest).nextUrl !== "undefined") {
      return ScuteEdgeApiHandler(args[0] as NextRequest);
    } else {
      return (req: NextRequest) =>
        ScuteRouteHandler(req, args[0] as RouteHandlerContext);
    }
  } else if (args.length > 1) {
    if ((args[1] as unknown as NextFetchEvent).waitUntil) {
      // pages api (edge)
      return ScuteEdgeApiHandler(args[0] as unknown as NextRequest);
    }
    // pages api (node)
    return ScuteNodeApiHandler(...args);
  }
}
