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

export type ScuteAppData = {
  id: UniqueIdentifier;
  name: string;
  created_at: string;
  updated_at: string;
  origin: string;
  callback_url: string;
  login_url: string;
  logo: string;
  logo_dark: string;
  colors: any; // TODO
  public_key: any; // TODO
  profile_management: boolean;
  public_signup: boolean;
  access_expiration: number;
  refresh_expiration: number;
  refresh_payload: boolean;
  auto_refresh: boolean;
  magic_link_expiration: number;
  session_timeout: number;
  scute_branding: boolean;
  allowed_identifiers: ScuteIdentifierType[];
  required_identifiers: ScuteIdentifierType[];
  default_language: string;
  user_meta_data_schema: ScuteUserMetaDataSchema[];
};

export interface ScuteUserMetaDataSchema {
  id: UniqueIdentifier;
  name: string;
  field_type:
    | "string"
    | "boolean"
    | "integer"
    | "date"
    | "phone"
    | "email"
    | "text"
    | "url";
  field_name: string;
  visible_profile: boolean;
  visible_registration: boolean;
  required: boolean;
}

export type ScuteTokenPayload = {
  refresh?: string | null;
  refresh_expires_at?: string | null;
  access_expires_at: string;
  access: string;
};

export type ScuteSendMagicLinkResponse = {
  type: "magic_link";
  id: UniqueIdentifier;
};

export type ScuteUser = {
  id: UniqueIdentifier;
  email: string | null;
  email_verified: boolean;
  phone: string | null;
  phone_verified: boolean;
  webauthn_enabled: boolean;
  meta: Metadata | null;
};

export type ScuteUserData = {
  id: UniqueIdentifier;
  status: "active" | "pending" | "inactive";
  email: string | null;
  email_verified: boolean;
  phone: string | null;
  phone_verified: boolean;
  webauthn_enabled: boolean;
  meta: Metadata | null;
  last_used_at: string;
  signup_date: string;
  webauthn_types: string[]; // TODO
  sessions: ScuteUserSession[];
};

type Metadata = Record<string, string | boolean | number>;

export type UserMeta = Metadata;

/**
 * Identifier that is an email or phone number.
 */
export type ScuteIdentifier = string;

export type ScuteIdentifierType = "email" | "phone";

export type ScuteWebauthnOption = "strict" | "optional" | "disabled";

export type ScuteSignInOptions = {
  webauthn?: ScuteWebauthnOption;
} & Record<string, any>; // TODO

export type ScuteSignUpOptions = {
  webauthn?: ScuteWebauthnOption;
  userMeta?: Record<string, any>;
} & Record<string, any>; // TODO

export type ScuteSignInOrUpOptions = {
  webauthn?: ScuteWebauthnOption;
} & Record<string, any>; // TODO

export type ScuteMagicLinkIdResponse = {
  magic_link: { id: UniqueIdentifier };
};

export type ScuteUserSession = {
  id: UniqueIdentifier;
  // TODO refresh_expiration: string;
  display_name: string;
  created_at: string;
  updated_at: string;
  credential_id: UniqueIdentifier | null;
  last_used_at: string;
  last_used_at_ip: string;
  user_agent: string;
  type: ScuteSessionType;
  platform: string;
  browser: string;
  user_agent_shortname: string;
  nickname: string;
};

export type ScuteSessionType =
  | "webauthn"
  | "magic"
  | "xlogin"
  | "oauth"
  | "misc";

export type ScutePaginationMeta = {
  total_pages: number;
  current_page: number;
  next_page: number | null;
  prev_page: number | null;
  per_page: number;
};
