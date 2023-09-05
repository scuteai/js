import { ScuteClient, ScuteTokenPayload } from "@scute/core";
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
    headers: Record<string, string>;
  }
): Promise<Response> => {
  if (isSignInRequest(url, method)) {
    if (!isCsrfTokenValid({ cookies, headers })) {
      const response = getCsrfErrorResponse();
      return response;
    }

    const {
      data: { session },
      error,
    } = await scute.getSession();

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
      return new Response(null, {
        status: 401,
      });
    }

    // sets refresh token http-only
    await scute.refreshSession();

    const response = new Response(null, {
      status: 200,
    });

    return response;
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
    const token = cookies[CSRF_TOKEN_KEY] ?? createCsrfToken();

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

    return new Response(
      JSON.stringify({
        access: data?.access,
        access_expires_at: data?.accessExpiresAt,
      } as Partial<ScuteTokenPayload>),
      {
        status: !data?.access || error ? 403 : 200,
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
