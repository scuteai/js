export type _ScuteAccessPayload = {
  exp: number;
  uuid: string;
} & Record<string, any>;

export type _ScuteRefreshPayload = {
  exp: number;
} & Record<string, any>;

export type _ScuteMagicLinkTokenPayload = {
  webauthnEnabled: boolean;
} & Record<string, any>;
