import { ScuteClient, ScuteTokenPayload } from "@scute/js-core";
import {
  createCsrfToken,
  deleteCsrfToken,
  getCsrfErrorResponse,
  isCsrfTokenValid,
  setCsrfToken,
} from "./csrf";
import { getHandlerPath } from "./handlerHelpers";
import {
  CSRF_HANDLER,
  CSRF_TOKEN_KEY,
  REFRESH_HANDLER,
  SIGN_IN_HANDLER,
  SIGN_OUT_HANDLER,
} from "./constants";

// 30 seconds
const SIGN_IN_MAX_DELAY_MS = 30 * 1000;

const internalHandler = async (
  scute: ScuteClient,
  {
    url,
    method,
    query,
    body,
    cookies,
    headers,
  }: {
    url: URL;
    method: string;
    query: Record<string, string>;
    body: Record<string, any> | undefined;
    cookies: Record<string, string>;
    headers: Headers;
  }
): Promise<Response> => {  
  if (isSignInRequest(url, method)) {
    if (!isCsrfTokenValid({ cookies, headers })) {
      const response = getCsrfErrorResponse();
      return response;
    }

    await scute["setSession"]({
      access: headers.get("Authorization")?.split("Bearer ")?.[1],
    });

    // sets refresh token http-only
    const { data: session, error } = await scute.refreshSession();
    const { data: appData } = await scute.getAppData();

    if (
      error ||
      !session?.access ||
      !appData ||
      // if more than `SIGN_IN_MAX_DELAY_MS` passed after sign in
      // it may be an attack, so do not allow
      session.accessExpiresAt.getTime() -
        (new Date().getTime() + appData.access_expiration * 1000) >
        SIGN_IN_MAX_DELAY_MS
    ) {
      await scute.signOut();

      return new Response(null, {
        status: 401,
      });
    }

    return new Response(null, {
      status: 200,
    });
  } else if (isSignOutRequest(url, method)) {
    if (!isCsrfTokenValid({ cookies, headers })) {
      const response = getCsrfErrorResponse();
      return response;
    }

    const response = new Response(null, {
      status: 200,
    });

    deleteCsrfToken(response);

    await scute.signOut();

    return response;
  } else if (isCsrfRequest(url, method)) {
    const token = cookies[CSRF_TOKEN_KEY]
      ? cookies[CSRF_TOKEN_KEY]
      : createCsrfToken();

    const response = new Response(token, {
      status: 200,
    });

    setCsrfToken(token, response);

    return response;
  } else if (isRefreshRequest(url, method)) {
    if (!isCsrfTokenValid({ cookies, headers })) {
      const response = getCsrfErrorResponse();
      return response;
    }

    const { data, error } = await scute.refreshSession();

    if (error) {
      return new Response(null, {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    return new Response(
      JSON.stringify({
        access: data.access,
        access_expires_at: data.accessExpiresAt?.toString(),
      } as Partial<ScuteTokenPayload>),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } else {
    return new Response("Bad Request", {
      status: 400,
    });
  }
};

const isSignInRequest = (url: URL, method: string) =>
  method === "POST" && url.pathname.endsWith(getHandlerPath(SIGN_IN_HANDLER));

const isSignOutRequest = (url: URL, method: string) =>
  method === "POST" && url.pathname.endsWith(getHandlerPath(SIGN_OUT_HANDLER));

const isCsrfRequest = (url: URL, method: string) =>
  method === "GET" && url.pathname.endsWith(getHandlerPath(CSRF_HANDLER));

const isRefreshRequest = (url: URL, method: string) =>
  method === "POST" && url.pathname.endsWith(getHandlerPath(REFRESH_HANDLER));

export default internalHandler;
