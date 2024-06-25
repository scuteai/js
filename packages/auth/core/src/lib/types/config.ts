import type { ScuteStorage } from "../ScuteStorage";
import type { UniqueIdentifier } from "./general";

export type ScuteClientConfig = {
  appId: UniqueIdentifier;
  baseUrl?: string;
  /** IMPORTANT: Do not expose to the browser */
  secretKey?: string;
  oAuthProviders?: ScuteOAuthProviderConfig[];
  preferences?: ScuteClientPreferences;
  debug?: boolean;
  errorReporting?: boolean;
};

export type ScuteOAuthProviderConfig = {
  provider: string;
  name: string;
  icon: string;
  color?: string;
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
  /**
   * Refetch interval in seconds
   * @default 300 */
  refetchInverval?: number;
};

export type ScuteAdminApiConfig = {
  appId: UniqueIdentifier;
  baseUrl?: string;
  secretKey?: string;
  errorReporting?: boolean;
};
