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

export type ScuteOAuthProviderConfig = {
  provider: string;
  name: string;
  icon: string;
  color?: string;
};

/**
 * Home-realm discovery result for a SAML SSO email domain. Returned by
 * GET /v1/auth/saml/discover when the email's domain maps to a verified,
 * enabled workspace SAML config.
 */
export type ScuteSsoDiscovery = {
  workspace_id: UniqueIdentifier;
  saml_login_url: string;
  enforce_sso: boolean;
};

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
  email_auth_type: "magic" | "otp";
  default_language: string;
  user_meta_data_schema: ScuteUserMetaDataSchema[];
  oauth_providers?: ScuteOAuthProviderConfig[];
  passkeys_enabled?: boolean;
  base_url: string;
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

/**
 * Who is really acting when someone is signed in as the user (support
 * access). From the access token's `act` claim (RFC 8693).
 */
export type ScuteImpersonationActor = {
  /** app_user: one of the app's users; operator: a Scute dashboard member; backend: named by your server. */
  kind: "app_user" | "operator" | "backend";
  sub?: string;
  email?: string;
  name?: string;
};

export type ScuteImpersonation = {
  actor: ScuteImpersonationActor;
  expiresAt: Date;
};

/** A session as the user, as the admin API reports it. */
export type ScuteImpersonationRecord = {
  session_id: UniqueIdentifier;
  actor: ScuteImpersonationActor & { id?: string };
  reason: string;
  started_at: string;
  expires_at: string;
};

/** What starting one returns: an access token as the user, never a refresh token. */
export type ScuteImpersonationTokens = ScuteTokenPayload & {
  session_id: UniqueIdentifier;
  user_id: UniqueIdentifier;
  impersonation: Omit<ScuteImpersonationRecord, "session_id">;
};

export type ScuteImpersonateParams = {
  /** Why (shown in the user's audit trail). Required. */
  reason: string;
  /** Up to the app's maximum (default 60). */
  minutes?: number;
  /** One of the app's users who holds user:impersonate on this user. */
  actorUserId?: UniqueIdentifier;
  /** Or: the person, named by your backend. */
  actor?: { email?: string; name?: string; id?: string };
  /** A completed step-up challenge's token, when user:impersonate asks for one. */
  challenge?: string;
  /** An approved request's id, when user:impersonate needs approval. */
  approval?: UniqueIdentifier;
};

export type ScuteSendMagicLinkResponse = {
  type: "magic_link";
  id: UniqueIdentifier;
};

export type ScuteUser = {
  id: UniqueIdentifier;
  status: "active" | "pending" | "inactive";
  email: string | null;
  email_verified: boolean;
  phone: string | null;
  phone_verified: boolean;
  webauthn_enabled: boolean;
  required_fields: Array<{
    field: string;
    required: boolean;
  }>;
};

export type ScuteUserData = {
  id: UniqueIdentifier;
  status: ScuteUser["status"];
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
  required_fields: Array<{
    field: string;
    required: boolean;
  }>;
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
} & Record<string, unknown>; // TODO

export type ScuteSignUpOptions = {
  webauthn?: ScuteWebauthnOption;
  userMeta?: Metadata;
} & Record<string, unknown>; // TODO

export type ScuteSignInOrUpOptions = {
  webauthn?: ScuteWebauthnOption;
} & Record<string, unknown>; // TODO

export type ScuteMagicLinkIdResponse = {
  magic_link: { id: UniqueIdentifier };
};

export type ScuteOtpResponse = {
  otp: { id: UniqueIdentifier };
};

export type ScuteChallengeResponse = {
  token: string;
  status: string;
  purpose: string;
  method: string;
  expires_at: string;
  remaining_attempts?: number;
  time_remaining?: number;
  delivery_required?: boolean;
};

export type ScuteMfaRequiredResponse = {
  mfa_required: true;
  mfa_enrollment_required?: boolean;
  mfa_grace_period?: boolean;
  mfa_grace_days_remaining?: number;
  app_user_id: string;
  mfa_challenge?: ScuteChallengeResponse;
  available_methods: string[];
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
  | "misc"
  | "otp"
  | "workspace"
  | "m2m"
  | "mfa"
  | "challenge"
  | "impersonation";

export type ScutePaginationMeta = {
  total_pages: number;
  current_page: number;
  next_page: number | null;
  prev_page: number | null;
  per_page: number;
};

export type ListUsersRequestParams = {
  id?: UniqueIdentifier;
  email?: string;
  phone?: string;
  created_before?: string;
  status?: string;
  page?: number;
  limit?: number;
};
