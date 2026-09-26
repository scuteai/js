import * as pkg from "../index";
import * as main from "../main";
import * as core from "@scute/js-core";

describe("package exports", () => {
  it("exposes every Next.js client factory and ScuteHandler", () => {
    for (const name of [
      "createClientComponentClient",
      "createMiddlewareClient",
      "createPagesBrowserClient",
      "createPagesServerClient",
      "createPagesEdgeRuntimeClient",
      "createRouteHandlerClient",
      "createServerActionClient",
      "createServerComponentClient",
      "ScuteHandler",
    ]) {
      expect(typeof (main as any)[name]).toBe("function");
      expect((pkg as any)[name]).toBe((main as any)[name]);
    }
  });

  it("does not export internal handler plumbing from the package root", () => {
    for (const name of ["internalHandler", "fetchWithCsrf", "isCsrfTokenValid", "createCsrfToken", "createScuteClient"]) {
      expect((pkg as any)[name]).toBeUndefined();
    }
  });

  it("re-exports @scute/js-core from the package root", () => {
    expect(pkg.ScuteClient).toBe(core.ScuteClient);
    expect(pkg.ScuteCookieStorage).toBe(core.ScuteCookieStorage);
    expect(pkg.AUTH_CHANGE_EVENTS).toBe(core.AUTH_CHANGE_EVENTS);
  });
});
