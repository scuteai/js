import { describe, expect, it } from "vitest";
import * as pkg from "../index";
import * as main from "../main";

describe("@scute/react-hooks public surface", () => {
  it("exports the provider and context hooks", () => {
    expect(typeof pkg.AuthContextProvider).toBe("function");
    expect(typeof pkg.useAuth).toBe("function");
    expect(typeof pkg.useScuteClient).toBe("function");
  });

  it("exports every MFA hook", () => {
    expect(typeof pkg.useEnrollMfa).toBe("function");
    expect(typeof pkg.useMfaVerify).toBe("function");
    expect(typeof pkg.useFactorList).toBe("function");
    expect(typeof pkg.useBackupCodes).toBe("function");
  });

  it("main re-exports the same bindings as index", () => {
    for (const key of Object.keys(main)) {
      expect((pkg as Record<string, unknown>)[key]).toBe((main as Record<string, unknown>)[key]);
    }
  });

  it("re-exports @scute/js-core so consumers need a single import", () => {
    expect(pkg.AUTH_CHANGE_EVENTS.SIGNED_IN).toBe("signed_in");
    expect(pkg.AUTH_CHANGE_EVENTS.MFA_REQUIRED).toBe("mfa_required");
    expect(typeof pkg.createClient).toBe("function");
    expect(typeof pkg.ScuteClient).toBe("function");
    expect(typeof pkg.scrubAuthTokensFromUrl).toBe("function");
    expect(pkg.sessionLoadingState().status).toBe("loading");
  });
});
