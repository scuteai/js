import { describe, expect, it } from "vitest";
import { ScuteBaseHttp } from "../ScuteBaseHttp";
import {
  BaseHttpError,
  SsoRequiredError,
  getMeaningfulError,
  isSsoRequiredError,
} from "../errors";

// The v2 API answers sign-in for a domain that enforces SAML with:
// 403 { error, error_code: "sso_required", details: { sso_login_url, domain } }
const ssoBody = {
  error: "This account must sign in with SSO.",
  error_code: "sso_required",
  details: {
    sso_login_url: "https://api.scute.io/v1/auth/app_123/saml/login",
    domain: "acme.com",
  },
};

// ScuteBaseHttp is abstract; a bare subclass is enough to reach the mapper.
class TestHttp extends ScuteBaseHttp {}

const toError = (status: number, json: Record<string, any>) =>
  (new TestHttp(false, "https://api.test") as any)._getErrorObject({
    status,
    json,
    message: JSON.stringify(json),
    response: { statusText: "Forbidden" },
  });

describe("SsoRequiredError", () => {
  it("is what a 403 sso_required becomes, carrying where to send the user", () => {
    const err = toError(403, ssoBody);

    expect(err).toBeInstanceOf(SsoRequiredError);
    expect(err).toBeInstanceOf(BaseHttpError); // existing instanceof checks keep working
    expect(isSsoRequiredError(err)).toBe(true);
    expect(err.code).toBe(403);
    expect(err.slug).toBe("sso_required");
    expect(err.ssoLoginUrl).toBe(ssoBody.details.sso_login_url);
    expect(err.domain).toBe("acme.com");
  });

  it("leaves every other 403 a plain BaseHttpError", () => {
    const err = toError(403, { error: "Forbidden", error_code: "workspace_access_denied" });
    expect(err).toBeInstanceOf(BaseHttpError);
    expect(isSsoRequiredError(err)).toBe(false);
  });

  it("isn't reported to the UI as a fatal failure", () => {
    const { isFatal, message } = getMeaningfulError(toError(403, ssoBody));
    expect(isFatal).toBe(false);
    expect(message).toBe("This account must sign in with SSO.");
  });

  it("copes with a body that has no details", () => {
    const err = toError(403, { error: "x", error_code: "sso_required" });
    expect(err).toBeInstanceOf(SsoRequiredError);
    expect(err.ssoLoginUrl).toBeUndefined();
  });
});
