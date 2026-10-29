import type ScuteClient from "../../ScuteClient";
import type { ScuteStorage } from "../ScuteStorage";
import type { UniqueIdentifier } from "./general";

export type ScuteClientConfig = {
  appId: UniqueIdentifier;
  baseUrl?: string;
  /** IMPORTANT: Do not expose to the browser */
  secretKey?: string;
  /**
   * The signing-in person's IP address, for a client made per request on
   * your server. Sent as `X-Scute-Client-IP` on the calls made with
   * `secretKey`, so sign-ins your server starts are checked against the
   * workspace's IP rules. One address; see `admin.withClientIp`.
   */
  clientIp?: string | null;
  preferences?: ScuteClientPreferences;
  onBeforeInitialize?: (this: ScuteClient) => void;
  debug?: boolean;
  errorReporting?: boolean;
};

export type ScuteSessionConfig = {
  storage: ScuteStorage;
};

export type ScuteClientPreferences = {
  /** @default true */
  persistSession?: boolean;
  sessionStorageAdapter?: ScuteStorage;
  /** @default true */
  refetchOnWindowFocus?: boolean;
  /** @default true */
  autoRefreshToken?: boolean;
  /**
   * Refetch interval in seconds
   * @default 300 */
  refetchInverval?: number;
  /** @default true */
  fingerprinting?: boolean;
};

export type ScuteAdminApiConfig = {
  appId: UniqueIdentifier;
  baseUrl?: string;
  secretKey?: string;
  /**
   * The signing-in person's IP address, sent as `X-Scute-Client-IP` with the
   * secret key. One address (IPv4 or IPv6); see `withClientIp`.
   */
  clientIp?: string | null;
  errorReporting?: boolean;
};
