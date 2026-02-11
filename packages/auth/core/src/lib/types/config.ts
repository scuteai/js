import type ScuteClient from "../../ScuteClient";
import type { ScuteStorage } from "../ScuteStorage";
import type { UniqueIdentifier } from "./general";

export type ScuteClientConfig = {
  appId: UniqueIdentifier;
  baseUrl?: string;
  /** IMPORTANT: Do not expose to the browser */
  secretKey?: string;
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
  errorReporting?: boolean;
};
