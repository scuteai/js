import { NextRequest, NextResponse } from "next/server";
import { createMiddlewareClient } from "@scute/nextjs";
import { PATHS } from "./app/routes";

export const config = {
  matcher: ["/apps/:path*", "/profile", "/"],
};

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const scuteClient = createMiddlewareClient({ req, res });

  const {
    data: { session },
  } = await scuteClient.getSession();

  if (session?.status === "authenticated") {
    if (req.nextUrl.pathname === PATHS.HOME) {
      return NextResponse.redirect(new URL(PATHS.APPS, req.nextUrl), {
        headers: res.headers,
      });
    }
  } else {
    if (
      req.nextUrl.pathname.startsWith(PATHS.APPS) ||
      req.nextUrl.pathname === PATHS.PROFILE
    ) {
      return NextResponse.redirect(new URL(PATHS.HOME, req.nextUrl), {
        headers: res.headers,
      });
    }
  }

  return res;
}
