import { serialize as serializeCookie } from "cookie";
import { randomBytes } from "../utils";
import { CSRF_TOKEN_KEY } from "./constants";

export const createCsrfToken = () => {
  const token = randomBytes(64).toString("hex");
  return token;
};

export const setCsrfToken = (token: string, response: Response) => {
  const cookieStr = serializeCookie(CSRF_TOKEN_KEY, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  response.headers.append("set-cookie", cookieStr);
  response.headers.append("cookie", cookieStr);
};

export const deleteCsrfToken = (response: Response) => {
  const cookieStr = serializeCookie(CSRF_TOKEN_KEY, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
  response.headers.append("set-cookie", cookieStr);
  response.headers.append("cookie", cookieStr);
};

export const isCsrfTokenValid = ({
  cookies,
  headers,
}: {
  cookies: Record<string, string | null>;
  headers: Headers;
}) => {
  const csrfTokenCookie = cookies[CSRF_TOKEN_KEY];
  const csrfTokenHeader = headers.get(CSRF_TOKEN_KEY);

  if (
    csrfTokenCookie &&
    csrfTokenCookie.trim().length !== 0 &&
    csrfTokenHeader &&
    csrfTokenHeader.trim().length !== 0 &&
    csrfTokenCookie === csrfTokenHeader
  ) {
    return true;
  } else {
    return false;
  }
};

export const getCsrfErrorResponse = () => {
  return new Response("CSRF error", {
    status: 401,
  });
};
