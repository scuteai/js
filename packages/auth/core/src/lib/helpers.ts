import { supported as _isWebauthnSupported } from "./webauthn";
import jwtDecode from "jwt-decode";

export const isBrowser = () => typeof document !== "undefined";

// https://github.com/MasterKale/SimpleWebAuthn/blob/9757b8172d8d025eade46bd62be0e6c3c2216ea3/packages/browser/src/helpers/isValidDomain.ts
/**
 * A simple test to determine if a hostname is a properly-formatted domain name
 *
 * A "valid domain" is defined here: https://url.spec.whatwg.org/#valid-domain
 *
 * Regex sourced from here:
 * https://www.oreilly.com/library/view/regular-expressions-cookbook/9781449327453/ch08s15.html
 */
export function isValidDomain(hostname: string): boolean {
  return (
    // Consider localhost valid as well since it's okay wrt Secure Contexts
    hostname === "localhost" ||
    /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i.test(hostname)
  );
}

/**
 * Checks if the webauthn is supported in the browser
 */
export const isWebauthnSupported = () => isBrowser() && _isWebauthnSupported();

export const getUserIdFromAccessToken = (accessToken: string) => {
  const { uuid: userId } = jwtDecode<any>(accessToken);
  return userId;
};
