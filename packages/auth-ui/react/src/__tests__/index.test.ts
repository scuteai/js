import { describe, expect, it } from "vitest";
import * as pkg from "../index";
import { useScuteAuthFlow } from "../useScuteAuthFlow";
import { useUserProfile } from "../useUserProfile";
import { useSessions } from "../useSessions";
import { useAlternatePhones } from "../useAlternatePhones";
import { useSecureAccount } from "../useSecureAccount";
import { ScuteAuthGate } from "../ScuteAuthGate";
import { useElementAccessRequests, useElementDecisionLog, useElementUserRoles } from "../useAuthzElements";

describe("@scute/auth-ui-react public surface", () => {
  it("exports exactly the headless hooks and the gate component", () => {
    expect(Object.keys(pkg).sort()).toEqual(
      [
        "ScuteAuthGate",
        "useAlternatePhones",
        "useElementAccessRequests",
        "useElementDecisionLog",
        "useElementUserRoles",
        "useScuteAuthFlow",
        "useSecureAccount",
        "useSessions",
        "useUserProfile",
      ].sort()
    );
  });

  it("re-exports the module bindings unchanged", () => {
    expect(pkg.useScuteAuthFlow).toBe(useScuteAuthFlow);
    expect(pkg.useUserProfile).toBe(useUserProfile);
    expect(pkg.useSessions).toBe(useSessions);
    expect(pkg.useAlternatePhones).toBe(useAlternatePhones);
    expect(pkg.useSecureAccount).toBe(useSecureAccount);
    expect(pkg.ScuteAuthGate).toBe(ScuteAuthGate);
    expect(pkg.useElementUserRoles).toBe(useElementUserRoles);
    expect(pkg.useElementAccessRequests).toBe(useElementAccessRequests);
    expect(pkg.useElementDecisionLog).toBe(useElementDecisionLog);
  });
});
