/**
 * Characterization of src/lib/errors.ts: the error class hierarchy, the
 * WebAuthn error identification helpers and getMeaningfulError (what the UI
 * shows). SsoRequiredError is covered in sso-required-error.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BaseHttpError,
  CustomScuteError,
  getMeaningfulError,
  IdentifierAlreadyExistsError,
  IdentifierInvalidError,
  IdentifierNotRecognizedError,
  identifyAuthenticationError,
  identifyRegistrationError,
  InvalidAuthTokenError,
  InvalidMagicLinkError,
  LoginRequiredError,
  NETWORK_ERROR_CODES,
  NewDeviceError,
  ScuteError,
  TechnicalError,
  UnknownSignInError,
  WebAuthnError,
} from "../errors";

afterEach(() => {
  vi.unstubAllGlobals();
});

const namedError = (name: string, message = `${name} happened`) =>
  Object.assign(new Error(message), { name });

describe("ScuteError", () => {
  it("defaults name to 'Error' and carries code, slug and cause", () => {
    const cause = new TypeError("inner");
    const err = new ScuteError({ message: "m", code: "c", slug: "s", cause });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("m");
    expect(err.code).toBe("c");
    expect(err.slug).toBe("s");
    expect(err.cause).toBe(cause);
    // name falls back to the cause's name when not given
    expect(err.name).toBe("TypeError");
    expect(new ScuteError({ message: "m" }).name).toBe("Error");
  });
});

describe("BaseHttpError", () => {
  it("keeps the numeric status as code and the parsed body as json", () => {
    const err = new BaseHttpError({
      message: "Bad Request",
      code: 400,
      json: { error: "bad" },
    });
    expect(err).toBeInstanceOf(ScuteError);
    expect(err.code).toBe(400);
    expect(err.json).toEqual({ error: "bad" });
    expect(err.slug).toBeUndefined();
  });

  it("reads slug from json.error.slug (only when error is an object)", () => {
    expect(
      new BaseHttpError({ message: "", code: 422, json: { error: { slug: "taken" } } })
        .slug
    ).toBe("taken");
    expect(
      new BaseHttpError({ message: "", code: 422, json: { error: "taken" } }).slug
    ).toBeUndefined();
  });
});

describe("custom client errors", () => {
  it.each([
    [IdentifierNotRecognizedError, "Identifier is not recognized.", "identifier-not-recognized", "identifier_not_recognized"],
    [IdentifierAlreadyExistsError, "User with this identifier already exists.", "identifier-already-exists", "identifier_already_exists"],
    [IdentifierInvalidError, "Identifier is invalid.", "identifier-invalid", "identifier_invalid"],
    [NewDeviceError, "New Device.", "new-device", "new_device"],
    [LoginRequiredError, "Login Required.", "login-required", "login_required"],
    [InvalidAuthTokenError, "Invalid auth token.", "invalid-auth-token", "invalid_auth_token"],
    [UnknownSignInError, "Unknown sign in error.", "unknown-sign-in", "unknown_sign_in"],
    [InvalidMagicLinkError, "Invalid magic link.", "invalid-magic-link", "invalid_magic_link"],
  ] as const)("%o has a stable message, code and slug", (Cls, message, code, slug) => {
    const err = new (Cls as any)();
    expect(err).toBeInstanceOf(Cls);
    expect(err).toBeInstanceOf(CustomScuteError);
    expect(err).toBeInstanceOf(ScuteError);
    expect(err).not.toBeInstanceOf(BaseHttpError);
    expect(err.message).toBe(message);
    expect(err.code).toBe(code);
    expect(err.slug).toBe(slug);
  });

  it("TechnicalError has a fixed message and slug and is not a CustomScuteError", () => {
    const err = new TechnicalError();
    expect(err.message).toBe("Technical Error");
    expect(err.slug).toBe("technical_error");
    expect(err).not.toBeInstanceOf(CustomScuteError);
  });

  it("NETWORK_ERROR_CODES (the retried statuses) are 502, 503, 504", () => {
    expect(NETWORK_ERROR_CODES).toEqual([502, 503, 504]);
  });
});

describe("WebAuthnError", () => {
  // CURRENT BEHAVIOR (suspected bug): WebAuthnError calls
  // `super(message, { cause })` but ScuteError's constructor takes a single
  // options object. The string is destructured as an object, so the message
  // and cause are lost: every WebAuthnError has message "" and cause
  // undefined. ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY therefore points at a
  // cause that is never there, and the UI falls back to a generic message.
  it("loses its message and cause (only name and code survive)", () => {
    const inner = namedError("NotAllowedError", "The user cancelled");
    const err = new WebAuthnError({
      message: "The user cancelled",
      code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
      cause: inner,
    });
    expect(err).toBeInstanceOf(WebAuthnError);
    expect(err.name).toBe("NotAllowedError");
    expect(err.code).toBe("ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY");
    expect(err.message).toBe("");
    expect(err.cause).toBeUndefined();
  });
});

describe("identifyAuthenticationError", () => {
  const options = { publicKey: { challenge: "c", rpId: "app.test" } } as any;

  it("maps NotAllowedError to a passthrough WebAuthnError", () => {
    const err = identifyAuthenticationError({
      error: namedError("NotAllowedError"),
      options,
    });
    expect(err).toBeInstanceOf(WebAuthnError);
    expect((err as WebAuthnError).code).toBe("ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY");
  });

  it("maps AbortError to ERROR_CEREMONY_ABORTED only when an AbortSignal was passed", () => {
    const withSignal = identifyAuthenticationError({
      error: namedError("AbortError"),
      options: { ...options, signal: new AbortController().signal },
    });
    expect((withSignal as WebAuthnError).code).toBe("ERROR_CEREMONY_ABORTED");

    const original = namedError("AbortError");
    expect(identifyAuthenticationError({ error: original, options })).toBe(original);
  });

  it("maps UnknownError to ERROR_AUTHENTICATOR_GENERAL_ERROR", () => {
    const err = identifyAuthenticationError({
      error: namedError("UnknownError"),
      options,
    });
    expect((err as WebAuthnError).code).toBe("ERROR_AUTHENTICATOR_GENERAL_ERROR");
  });

  it("maps SecurityError using window.location.hostname", () => {
    vi.stubGlobal("window", { location: { hostname: "evil.test" } });
    const wrongRp = identifyAuthenticationError({
      error: namedError("SecurityError"),
      options,
    });
    expect((wrongRp as WebAuthnError).code).toBe("ERROR_INVALID_RP_ID");

    vi.stubGlobal("window", { location: { hostname: "10.0.0.1" } });
    const badDomain = identifyAuthenticationError({
      error: namedError("SecurityError"),
      options,
    });
    expect((badDomain as WebAuthnError).code).toBe("ERROR_INVALID_DOMAIN");
  });

  it("returns unrecognized errors unchanged and throws without publicKey", () => {
    const original = namedError("SomethingElse");
    expect(identifyAuthenticationError({ error: original, options })).toBe(original);
    expect(() =>
      identifyAuthenticationError({ error: original, options: {} as any })
    ).toThrow(/publicKey/);
  });
});

describe("identifyRegistrationError", () => {
  const publicKey = {
    rp: { id: "app.test", name: "App" },
    user: { id: "user_1", name: "ada", displayName: "Ada" },
    challenge: "c",
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  };

  it("maps InvalidStateError to ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED", () => {
    const err = identifyRegistrationError({
      error: namedError("InvalidStateError"),
      options: { publicKey } as any,
    });
    expect((err as WebAuthnError).code).toBe("ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED");
  });

  it("maps NotSupportedError by inspecting pubKeyCredParams", () => {
    const malformed = identifyRegistrationError({
      error: namedError("NotSupportedError"),
      options: { publicKey: { ...publicKey, pubKeyCredParams: [] } } as any,
    });
    expect((malformed as WebAuthnError).code).toBe("ERROR_MALFORMED_PUBKEYCREDPARAMS");

    const noAlg = identifyRegistrationError({
      error: namedError("NotSupportedError"),
      options: { publicKey } as any,
    });
    expect((noAlg as WebAuthnError).code).toBe(
      "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG"
    );
  });

  it("maps ConstraintError according to authenticatorSelection", () => {
    const resident = identifyRegistrationError({
      error: namedError("ConstraintError"),
      options: {
        publicKey: { ...publicKey, authenticatorSelection: { requireResidentKey: true } },
      } as any,
    });
    expect((resident as WebAuthnError).code).toBe(
      "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT"
    );

    const uv = identifyRegistrationError({
      error: namedError("ConstraintError"),
      options: {
        publicKey: { ...publicKey, authenticatorSelection: { userVerification: "required" } },
      } as any,
    });
    expect((uv as WebAuthnError).code).toBe(
      "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT"
    );
  });

  it("maps TypeError with an out of range user id length", () => {
    const err = identifyRegistrationError({
      error: namedError("TypeError"),
      options: { publicKey: { ...publicKey, user: { ...publicKey.user, id: "" } } } as any,
    });
    expect((err as WebAuthnError).code).toBe("ERROR_INVALID_USER_ID_LENGTH");
  });
});

describe("getMeaningfulError (what the UI shows)", () => {
  it("TechnicalError is fatal with a generic message", () => {
    expect(getMeaningfulError(new TechnicalError())).toEqual({
      isFatal: true,
      message: "Something went wrong.",
    });
  });

  it("HTTP 500 is fatal with a generic message, hiding the server text", () => {
    const err = new BaseHttpError({ message: "x", code: 500, json: { error: "db down" } });
    expect(getMeaningfulError(err)).toEqual({
      isFatal: true,
      message: "Something went wrong.",
    });
  });

  it("other HTTP errors are fatal and surface json.error verbatim", () => {
    const err = new BaseHttpError({ message: "x", code: 422, json: { error: "Email is invalid" } });
    expect(getMeaningfulError(err)).toEqual({ isFatal: true, message: "Email is invalid" });
  });

  it("the expired magic link 404 is the one non-fatal HTTP error", () => {
    const err = new BaseHttpError({
      message: "x",
      code: 404,
      json: { error: "Magic link not found or expired" },
    });
    expect(getMeaningfulError(err)).toEqual({
      isFatal: false,
      message: "Magic link not found or expired",
    });
  });

  // CURRENT BEHAVIOR (suspected bug): an HTTP error without a JSON `error`
  // field (HTML error page, network failure) yields message undefined, so
  // the UI renders an empty error.
  it("an HTTP error without json.error yields an undefined message", () => {
    const noJson = new BaseHttpError({ message: "Bad Gateway", code: 502 });
    expect(getMeaningfulError(noJson)).toEqual({ isFatal: true, message: undefined });

    const network = new BaseHttpError({ message: undefined as any, code: undefined as any });
    expect(getMeaningfulError(network)).toEqual({ isFatal: true, message: undefined });
  });

  it("custom client errors are non-fatal with their own message", () => {
    expect(getMeaningfulError(new IdentifierNotRecognizedError())).toEqual({
      isFatal: false,
      message: "Identifier is not recognized.",
    });
  });

  it("WebAuthn ceremony aborts are non-fatal, other WebAuthn errors are fatal", () => {
    const aborted = new WebAuthnError({
      message: "x",
      code: "ERROR_CEREMONY_ABORTED",
      cause: namedError("AbortError"),
    });
    const rp = new WebAuthnError({
      message: "x",
      code: "ERROR_INVALID_RP_ID",
      cause: namedError("SecurityError"),
    });
    // message is the generic fallback because WebAuthnError drops its message
    expect(getMeaningfulError(aborted)).toEqual({
      isFatal: false,
      message: "Something went wrong.",
    });
    expect(getMeaningfulError(rp).isFatal).toBe(true);
  });

  it("plain errors are non-fatal and keep their message", () => {
    expect(getMeaningfulError(new Error("boom"))).toEqual({ isFatal: false, message: "boom" });
    expect(getMeaningfulError(new Error(""))).toEqual({
      isFatal: false,
      message: "Something went wrong.",
    });
  });
});
