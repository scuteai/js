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
  logo: string;
  logo_dark: string;
  public_key: any; // TODO
  profile_management: boolean;
  public_signup: boolean;
  access_expiration: number;
  refresh_expiration: number;
  refresh_enabled: boolean;
  session_timeout: number;
  scute_branding: boolean; // TODO
  allowed_identifiers: ScuteIdentifierType[];
  required_identifiers: ScuteIdentifierType[];
  default_language: string;
  auth_login_url: string;
  auth_origin: string;
  auth_callback: string;
  magic_link_ttl: number;
  user_meta_data_schema: ScuteUserMetaDataSchema[];
};

export interface ScuteUserMetaDataSchema {
  id: UniqueIdentifier;
  name: string;
  visible_profile: boolean;
  visible_registration: boolean;
  slug: string;
  type: string;
  field_name: string;
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
  email: string | null;
  email_verified: boolean;
  phone: string | null;
  phone_verified: boolean;
  webauthn_enabled: boolean;
  // TODO?
  // created_at: string;
  // update_at: string;
  // status: string;
  // last_login_at: string;
  // login_count: number;
  meta: Metadata | null;
  webauthn_types: string[]; // TODO
  sessions: ScuteUserSession[];
};

type Metadata = Record<string, boolean | string | number>;

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
  type: string; // TODO
  platform: string;
  browser: string;
  user_agent_shortname: string;
};
