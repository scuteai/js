import type { ScuteStorage } from "../ScuteBaseStorage";
import type { UniqueIdentifier } from "./general";

export type ScuteClientConfig = {
  appId: UniqueIdentifier;
  baseUrl?: string;
  /** IMPORTANT: Do not expose to the browser */
  secretKey?: string;
  preferences?: ScuteClientPreferences;
};

export type ScuteSessionConfig = {
  appId: UniqueIdentifier;
  storage: ScuteStorage;
};

export type ScuteClientPreferences = {
  /** @default true */
  autoRefreshToken?: boolean;
  detectSessionInUrl?: boolean;
  persistSession?: boolean;
  sessionStorageAdapter?: ScuteStorage;
};

export type ScuteAdminApiConfig = {
  appId: UniqueIdentifier;
  baseUrl?: string;
  secretKey?: string;
};
