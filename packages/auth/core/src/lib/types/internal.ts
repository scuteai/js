import type { UniqueIdentifier } from "./general";
import { ScuteUserData } from "./scute";

export type _ScuteAccessPayload = {
  exp: number;
  uuid: UniqueIdentifier;
} & Record<string, any>;

export type _ScuteRefreshPayload = {
  exp: number;
} & Record<string, any>;

export type _ScuteMagicLinkTokenPayload = {
  uuid: UniqueIdentifier;
  user_status: ScuteUserData["status"];
  webauthnEnabled?: boolean;
} & Record<string, any>;
