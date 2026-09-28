// DX-08 item 1: the app's config, as the browser SDK and the backend read it.

import { describe, expect, it } from "vitest";
import type { LiveContext } from "../lib/context";
import { ok } from "../lib/check";

export function appSuite(get: () => LiveContext) {
  describe("1. app", () => {
    it("reads the app's config (ScuteClient.getAppData)", async () => {
      const ctx = get();
      const app = ok(await ctx.newClient().getAppData(true), "getAppData");
      expect(app.id).toBe(ctx.env.appId);
      expect(app.email_auth_type, "sdk_live:setup makes OTP apps").toBe("otp");
      expect((app as { test_identities?: boolean }).test_identities, "test identities must be on for this app").toBe(true);
    });

    it("reads the same config from the backend (ScuteAdminApi.getAppData)", async () => {
      const ctx = get();
      const app = ok(await ctx.admin.getAppData(), "admin.getAppData");
      expect(app.id).toBe(ctx.env.appId);
      expect(typeof app.name).toBe("string");
      expect(app.email_auth_type).toBe("otp");
    });
  });
}
