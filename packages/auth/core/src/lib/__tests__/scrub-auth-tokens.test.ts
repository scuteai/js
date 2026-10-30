import { describe, expect, it } from "vitest";
import { scrubAuthTokensFromUrl } from "../helpers";

describe("scrubAuthTokensFromUrl", () => {
  it("removes the magic-link token", () => {
    expect(scrubAuthTokensFromUrl("https://app.test/login?sct_magic=abc")).toBe("https://app.test/login");
  });

  it("removes the OAuth/SAML handoff token and the skip flag (SAML ACS lands with both)", () => {
    expect(scrubAuthTokensFromUrl("https://app.test/login?sct_oauth=tok&sct_sk=true"))
      .toBe("https://app.test/login");
  });

  it("removes the sign-in-as-user hand-off code", () => {
    expect(scrubAuthTokensFromUrl("https://app.test/login?sct_imp=c0de&next=%2F"))
      .toBe("https://app.test/login?next=%2F");
  });

  it("keeps the app's own query params and the hash", () => {
    expect(scrubAuthTokensFromUrl("https://app.test/login?next=%2Fhome&sct_oauth=tok#top"))
      .toBe("https://app.test/login?next=%2Fhome#top");
  });

  it("leaves a URL without tokens unchanged", () => {
    expect(scrubAuthTokensFromUrl("https://app.test/a?b=1")).toBe("https://app.test/a?b=1");
  });
});
