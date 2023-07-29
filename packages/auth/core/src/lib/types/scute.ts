import type { UniqueIdentifier } from "./general";

export type ScuteActivity = {
  id: UniqueIdentifier;
  email: string;
  user_id: string;
  event_type: string;
  timestamp: string;
  ip_address: string;
  user_agent: string;
} & Record<string, unknown>;

export type ScuteAppData = any; // TODO

export type ScuteTokenPayload = {
  csrf: string;
  refresh: string;
  refresh_expires_at: string;
  access_expires_at: string;
  access: string;
  user_id: string;
};

export type ScuteSendMagicLinkResponse = {
  type: "magic_link";
  id: UniqueIdentifier;
};

export type ScuteUser = {
  id: UniqueIdentifier;
  email: string;
  email_verified: boolean;
  phone: string; // TODO
  phone_verified: boolean;
  webauthn_enabled: boolean;
  user_metadata: Metadata | null;
};

export type ScuteUserData = {
  id: string;
  created_at: string;
  update_at: string;
  status: string;
  email: string;
  email_verified: boolean;
  phone: string;
  phone_verified: boolean;
  webauthn_enabled: boolean;
  webauthn_devices: ScuteDevice[];
  last_login_at: string;
  login_count: number;
  user_metadata: Metadata | null;
};

type Metadata = Record<string, boolean | string | number>;

/**
 * Identifier that is an email or phone number.
 */
export type ScuteIdentifier = string;

export type ScuteSignInOptions = {
  webauthn?: ScuteWebauthnOption;
} & Record<string, any>; // TODO

export type ScuteWebauthnOption = "strict" | "optional" | "disabled";

export type ScuteSignUpOptions = Record<string, any>; // TODO
export type ScuteSignInOrUpOptions = Record<string, any>; // TODO

export type ScuteMagicLinkIdResponse = {
  magic_link: { id: UniqueIdentifier };
};

export type ScuteDevice = {
  id: UniqueIdentifier;
  nickname: string;
  user_agent: string;
};
