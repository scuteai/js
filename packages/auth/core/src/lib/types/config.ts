import type { ScuteStorage } from "../ScuteStorage";
import type { UniqueIdentifier } from "./general";

export type ScuteClientConfig = {
  appId: UniqueIdentifier;
  baseUrl?: string;
  /** IMPORTANT: Do not expose to the browser */
  secretKey?: string;
  preferences?: ScuteClientPreferences;
  debug?: boolean;
};

export type ScuteSessionConfig = {
  storage: ScuteStorage;
};

export type ScuteClientPreferences = {
  /** @default true */
  autoRefreshToken?: boolean;
  /** @default true */
  persistSession?: boolean;
  sessionStorageAdapter?: ScuteStorage;
};

export type ScuteAdminApiConfig = {
  appId: UniqueIdentifier;
  baseUrl?: string;
  secretKey?: string;
};
