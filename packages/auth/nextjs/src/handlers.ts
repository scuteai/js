import { createPagesEdgeRuntimeClient } from "./pagesEdgeRuntimeClient";
import { createPagesServerClient } from "./pagesServerClient";
import { createRouteHandlerClient } from "./routeHandlerClient";
import { getBody } from "./utils";

import type { ScuteClient, ScuteTokenPayload } from "@scute/core";
import type { NextApiRequest, NextApiResponse } from "next";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import type { NextRequest, NextResponse } from "next/server";

type RouteHandlerContext = {
  cookies: () => ReadonlyRequestCookies;
  headers: () => Headers;
};

async function ScuteRouteHandler(
  req: NextRequest,
  context: RouteHandlerContext
) {
  const url = req.nextUrl;
  const query = Object.fromEntries(url.searchParams);
  const body = await getBody(req);
  const cookies = Object.fromEntries(
    context
      .cookies()
      .getAll()
      .map((c) => [c.name, c.value])
  );
  const headers = Object.fromEntries(context.headers() as any);
  const method = req.method;

  const scute = createRouteHandlerClient({ cookies: context.cookies });
  const response = await internalHandler(scute);

  return new Response(JSON.stringify(response), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function ScuteNodeApiHandler(req: NextApiRequest, res: NextApiResponse) {
  const nextInitUrl =
    //@ts-ignore
    req[
      Reflect.ownKeys(req).find(
        (key) => key.toString() === "Symbol(NextRequestMeta)"
      )!
    ].__NEXT_INIT_URL;


  const url = new URL(nextInitUrl);
  const query = req.query;
  const body = req.body;
  const cookies = req.cookies;
  const headers = req.headers;
  const method = req.method;

  const scute = createPagesServerClient({ req, res });
  const response = await internalHandler(scute);

  res.status(200).json(response);
}

async function ScuteEdgeApiHandler(req: NextRequest) {
  const url = req.nextUrl;
  const query = Object.fromEntries(url.searchParams);
  const body = await getBody(req);
  const cookies = Object.fromEntries(
    req.cookies.getAll().map((c) => [c.name, c.value])
  );
  const headers = Object.fromEntries(req.headers as any);
  const method = req.method;

  const scute = createPagesEdgeRuntimeClient({ request: req });
  const response = await internalHandler(scute);

  return new Response(JSON.stringify(response), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}

const internalHandler = async (scute: ScuteClient) => {
  const { data, error } = await scute.refreshSession();

  return {
    access: data?.access,
    access_expires_at: data?.accessExpiresAt,
  } as Partial<ScuteTokenPayload>;
};

export function ScuteHandler(context: {
  cookies: () => ReadonlyRequestCookies;
  headers: () => Headers;
}): (req: NextRequest) => Promise<NextResponse<Partial<ScuteTokenPayload>>>;
export function ScuteHandler(
  req: NextRequest
): Promise<NextResponse<Partial<ScuteTokenPayload>>>;
export function ScuteHandler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void>;
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
    // pages api (node)
    return ScuteNodeApiHandler(...args);
  }
}

export const getRefreshHandlerPath = (prefix?: string) => {
  return `${prefix?.startsWith("/") ? "" : "/"}${prefix ?? ""}${
    prefix?.endsWith("/") ? "" : "/"
  }auth/refresh` as `/${string}/auth/refresh`;
};
