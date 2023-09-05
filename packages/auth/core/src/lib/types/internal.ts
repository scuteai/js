import type { UniqueIdentifier } from "./general";

export type _ScuteAccessPayload = {
  exp: number;
  uuid: UniqueIdentifier;
} & Record<string, any>;

export type _ScuteRefreshPayload = {
  exp: number;
} & Record<string, any>;

export type _ScuteMagicLinkTokenPayload = {
  webauthnEnabled: boolean;
  uuid: UniqueIdentifier;
} & Record<string, any>;
