import { isValidDomain } from "./helpers";
import type webauthn from "./webauthn";

export const getMeaningfulError = (error: ScuteError | Error) => {
  const nonFatalWebauthn: WebAuthnErrorCode[] = [
    "ERROR_CEREMONY_ABORTED",
    "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
  ];

  let message = error.message ? error.message : "Something went wrong.";
  let isFatal = false;

  if (error instanceof TechnicalError) {
    isFatal = true;
    message = "Something went wrong.";
  } else if (
    error instanceof BaseHttpError &&
    !(error.code >= 200 && error.code < 300)
  ) {
    isFatal = true;
    const serverErrorMsg = error.json?.error?.message; // TODO
    message = serverErrorMsg;

    if (error.code === 500) {
      message = "Something went wrong.";
    } else if (
      error.code === 404 &&
      serverErrorMsg === "Magic link not found or expired"
    ) {
      // TODO: improve error message, error handling
      message = serverErrorMsg;
      isFatal = false;
    }
  } else if (
    error instanceof WebAuthnError &&
    !nonFatalWebauthn.includes(error.code)
  ) {
    isFatal = true;
  } else if (error instanceof CustomScuteError) {
    message = error.message;
    isFatal = false;
  }

  return {
    isFatal,
    message,
  };
};

export class ScuteError extends Error {
  code?: string | number;
  cause?: Error;
  slug?: string;

  constructor({
    message,
    code,
    cause,
    name,
    slug,
  }: {
    message: string;
    cause?: Error;
    code?: string | number;
    name?: string;
    slug?: string;
  }) {
    /**
     * `cause` is supported in evergreen browsers, but not IE10, so this ts-ignore is to
     * help Rollup complete the ES5 build.
     */
    // @ts-ignore
    super(message, { cause });
    this.name = name ?? cause?.name ?? "Error";
    this.code = code;
    this.cause = cause;
    this.slug = slug;
  }
}

export class BaseHttpError extends ScuteError {
  code: number;
  json?: Record<string, any>;

  constructor({
    message,
    code,
    cause,
    json,
  }: {
    message: ScuteError["message"];
    code: number;
    json?: Record<string, any>;
    cause?: ScuteError["cause"];
  }) {
    super({ message, cause, code, slug: json?.error?.slug });
    this.code = code;
    this.json = json;
    Object.setPrototypeOf(this, BaseHttpError.prototype);
  }
}

export class TechnicalError extends ScuteError {
  constructor(cause?: Error) {
    super({ message: "Technical Error", cause, slug: "technical_error" });
    Object.setPrototypeOf(this, TechnicalError.prototype);
  }
}

export const NETWORK_ERROR_CODES = [502, 503, 504];

// https://github.com/MasterKale/SimpleWebAuthn/blob/9757b8172d8d025eade46bd62be0e6c3c2216ea3/packages/browser/src/helpers/webAuthnError.ts
/**
 * A custom Error used to return a more nuanced error detailing _why_ one of the eight documented
 * errors in the spec was raised after calling `navigator.credentials.create()` or
 * `navigator.credentials.get()`:
 *
 * - `AbortError`
 * - `ConstraintError`
 * - `InvalidStateError`
 * - `NotAllowedError`
 * - `NotSupportedError`
 * - `SecurityError`
 * - `TypeError`
 * - `UnknownError`
 *
 * Error messages were determined through investigation of the spec to determine under which
 * scenarios a given error would be raised.
 */
export class WebAuthnError extends ScuteError {
  code: WebAuthnErrorCode;

  constructor({
    message,
    code,
    cause,
    name,
  }: {
    message: string;
    code: WebAuthnErrorCode;
    cause: Error;
    name?: string;
  }) {
    /**
     * `cause` is supported in evergreen browsers, but not IE10, so this ts-ignore is to
     * help Rollup complete the ES5 build.
     */
    // @ts-ignore
    super(message, { cause });
    this.name = name ?? cause.name;
    this.code = code;
  }
}

export type WebAuthnErrorCode =
  | "ERROR_CEREMONY_ABORTED"
  | "ERROR_INVALID_DOMAIN"
  | "ERROR_INVALID_RP_ID"
  | "ERROR_INVALID_USER_ID_LENGTH"
  | "ERROR_MALFORMED_PUBKEYCREDPARAMS"
  | "ERROR_AUTHENTICATOR_GENERAL_ERROR"
  | "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT"
  | "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT"
  | "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"
  | "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG"
  | "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY";

// https://github.com/MasterKale/SimpleWebAuthn/blob/9757b8172d8d025eade46bd62be0e6c3c2216ea3/packages/browser/src/helpers/identifyRegistrationError.ts
/**
 * Attempt to intuit _why_ an error was raised after calling `navigator.credentials.create()`
 */
export function identifyRegistrationError({
  error,
  options,
}: {
  error: Error;
  options: CredentialCreationOptions | webauthn.CredentialCreationOptionsJSON;
}): WebAuthnError | Error {
  const { publicKey } = options;

  if (!publicKey) {
    throw Error("options was missing required publicKey property");
  }

  if (error.name === "AbortError") {
    if (options.signal instanceof AbortSignal) {
      // https://www.w3.org/TR/webauthn-2/#sctn-createCredential (Step 16)
      return new WebAuthnError({
        message: "Registration ceremony was sent an abort signal",
        code: "ERROR_CEREMONY_ABORTED",
        cause: error,
      });
    }
  } else if (error.name === "ConstraintError") {
    if (publicKey.authenticatorSelection?.requireResidentKey === true) {
      // https://www.w3.org/TR/webauthn-2/#sctn-op-make-cred (Step 4)
      return new WebAuthnError({
        message:
          "Discoverable credentials were required but no available authenticator supported it",
        code: "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT",
        cause: error,
      });
    } else if (
      publicKey.authenticatorSelection?.userVerification === "required"
    ) {
      // https://www.w3.org/TR/webauthn-2/#sctn-op-make-cred (Step 5)
      return new WebAuthnError({
        message:
          "User verification was required but no available authenticator supported it",
        code: "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT",
        cause: error,
      });
    }
  } else if (error.name === "InvalidStateError") {
    // https://www.w3.org/TR/webauthn-2/#sctn-createCredential (Step 20)
    // https://www.w3.org/TR/webauthn-2/#sctn-op-make-cred (Step 3)
    return new WebAuthnError({
      message: "The authenticator was previously registered",
      code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
      cause: error,
    });
  } else if (error.name === "NotAllowedError") {
    /**
     * Pass the error directly through. Platforms are overloading this error beyond what the spec
     * defines and we don't want to overwrite potentially useful error messages.
     */
    return new WebAuthnError({
      message: error.message,
      code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
      cause: error,
    });
  } else if (error.name === "NotSupportedError") {
    const validPubKeyCredParams = publicKey.pubKeyCredParams.filter(
      (param) => param.type === "public-key"
    );

    if (validPubKeyCredParams.length === 0) {
      // https://www.w3.org/TR/webauthn-2/#sctn-createCredential (Step 10)
      return new WebAuthnError({
        message: 'No entry in pubKeyCredParams was of type "public-key"',
        code: "ERROR_MALFORMED_PUBKEYCREDPARAMS",
        cause: error,
      });
    }

    // https://www.w3.org/TR/webauthn-2/#sctn-op-make-cred (Step 2)
    return new WebAuthnError({
      message:
        "No available authenticator supported any of the specified pubKeyCredParams algorithms",
      code: "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG",
      cause: error,
    });
  } else if (error.name === "SecurityError") {
    const effectiveDomain = window.location.hostname;
    if (!isValidDomain(effectiveDomain)) {
      // https://www.w3.org/TR/webauthn-2/#sctn-createCredential (Step 7)
      return new WebAuthnError({
        message: `${window.location.hostname} is an invalid domain`,
        code: "ERROR_INVALID_DOMAIN",
        cause: error,
      });
    } else if (publicKey.rp.id !== effectiveDomain) {
      // https://www.w3.org/TR/webauthn-2/#sctn-createCredential (Step 8)
      return new WebAuthnError({
        message: `The RP ID "${publicKey.rp.id}" is invalid for this domain`,
        code: "ERROR_INVALID_RP_ID",
        cause: error,
      });
    }
  } else if (error.name === "TypeError") {
    const userId = publicKey.user.id;
    const userIdLength =
      typeof userId !== "string" ? userId.byteLength : userId.length;

    if (userIdLength < 1 || userIdLength > 64) {
      // https://www.w3.org/TR/webauthn-2/#sctn-createCredential (Step 5)
      return new WebAuthnError({
        message: "User ID was not between 1 and 64 characters",
        code: "ERROR_INVALID_USER_ID_LENGTH",
        cause: error,
      });
    }
  } else if (error.name === "UnknownError") {
    // https://www.w3.org/TR/webauthn-2/#sctn-op-make-cred (Step 1)
    // https://www.w3.org/TR/webauthn-2/#sctn-op-make-cred (Step 8)
    return new WebAuthnError({
      message:
        "The authenticator was unable to process the specified options, or could not create a new credential",
      code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
      cause: error,
    });
  }

  return error;
}

// https://github.com/MasterKale/SimpleWebAuthn/blob/9757b8172d8d025eade46bd62be0e6c3c2216ea3/packages/browser/src/helpers/identifyAuthenticationError.ts
/**
 * Attempt to intuit _why_ an error was raised after calling `navigator.credentials.get()`
 */
export function identifyAuthenticationError({
  error,
  options,
}: {
  error: Error;
  options: CredentialRequestOptions | webauthn.CredentialRequestOptionsJSON;
}): WebAuthnError | Error {
  const { publicKey } = options;

  if (!publicKey) {
    throw Error("options was missing required publicKey property");
  }

  if (error.name === "AbortError") {
    if (options.signal instanceof AbortSignal) {
      // https://www.w3.org/TR/webauthn-2/#sctn-createCredential (Step 16)
      return new WebAuthnError({
        message: "Authentication ceremony was sent an abort signal",
        code: "ERROR_CEREMONY_ABORTED",
        cause: error,
      });
    }
  } else if (error.name === "NotAllowedError") {
    /**
     * Pass the error directly through. Platforms are overloading this error beyond what the spec
     * defines and we don't want to overwrite potentially useful error messages.
     */
    return new WebAuthnError({
      message: error.message,
      code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
      cause: error,
    });
  } else if (error.name === "SecurityError") {
    const effectiveDomain = window.location.hostname;
    if (!isValidDomain(effectiveDomain)) {
      // https://www.w3.org/TR/webauthn-2/#sctn-discover-from-external-source (Step 5)
      return new WebAuthnError({
        message: `${window.location.hostname} is an invalid domain`,
        code: "ERROR_INVALID_DOMAIN",
        cause: error,
      });
    } else if (publicKey.rpId !== effectiveDomain) {
      // https://www.w3.org/TR/webauthn-2/#sctn-discover-from-external-source (Step 6)
      return new WebAuthnError({
        message: `The RP ID "${publicKey.rpId}" is invalid for this domain`,
        code: "ERROR_INVALID_RP_ID",
        cause: error,
      });
    }
  } else if (error.name === "UnknownError") {
    // https://www.w3.org/TR/webauthn-2/#sctn-op-get-assertion (Step 1)
    // https://www.w3.org/TR/webauthn-2/#sctn-op-get-assertion (Step 12)
    return new WebAuthnError({
      message:
        "The authenticator was unable to process the specified options, or could not create a new assertion signature",
      code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
      cause: error,
    });
  }

  return error;
}

export type CustomScuteErrorCode =
  | "identifier-not-recognized"
  | "identifier-already-exists"
  | "new-device"
  | "login-required"
  | "invalid-auth-token"
  | "unknown-sign-in"
  | "invalid-magic-link";

export class CustomScuteError extends ScuteError {
  constructor(
    message: ScuteError["message"],
    code: CustomScuteErrorCode & ScuteError["code"],
    slug?: ScuteError["slug"]
  ) {
    super({ message, code, slug });
    Object.setPrototypeOf(this, CustomScuteError.prototype);
  }
}

export class IdentifierNotRecognizedError extends CustomScuteError {
  constructor() {
    super(
      "Identifier is not recognized.",
      "identifier-not-recognized",
      "identifier_not_recognized"
    );
    Object.setPrototypeOf(this, IdentifierNotRecognizedError.prototype);
  }
}

export class IdentifierAlreadyExistsError extends CustomScuteError {
  constructor() {
    super(
      "User with this identifier already exists.",
      "identifier-already-exists",
      "identifier_already_exists"
    );
    Object.setPrototypeOf(this, IdentifierAlreadyExistsError.prototype);
  }
}

export class NewDeviceError extends CustomScuteError {
  constructor() {
    super("New Device.", "new-device", "new_device");
    Object.setPrototypeOf(this, NewDeviceError.prototype);
  }
}

export class LoginRequiredError extends CustomScuteError {
  constructor() {
    super("Login Required.", "login-required", "login_required");
    Object.setPrototypeOf(this, LoginRequiredError.prototype);
  }
}

export class InvalidAuthTokenError extends CustomScuteError {
  constructor() {
    super("Invalid auth token.", "invalid-auth-token", "invalid_auth_token");
    Object.setPrototypeOf(this, InvalidAuthTokenError.prototype);
  }
}

export class UnknownSignInError extends CustomScuteError {
  constructor() {
    super("Unknown sign in error.", "unknown-sign-in", "unknown_sign_in");
    Object.setPrototypeOf(this, UnknownSignInError.prototype);
  }
}

export class InvalidMagicLinkError extends CustomScuteError {
  constructor() {
    super("Invalid magic link.", "invalid-magic-link", "invalid_magic_link");
    Object.setPrototypeOf(this, InvalidMagicLinkError.prototype);
  }
}
