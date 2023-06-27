import type { UniqueIdentifier } from "./general";
import type {
  CredentialCreationOptionsJSON,
  CredentialRequestOptionsJSON,
} from "../webauthn";

export type ScuteActivity = {
  id: UniqueIdentifier;
  email: string;
  user_id: string;
  event_type: string;
  timestamp: string;
  ip_address: string;
  user_agent: string;
} & Record<string, unknown>;

export type ScuteWebauthnStartResponse = {
  status: "ok";
  action: "login" | "register";
  options:
    | NonNullable<CredentialCreationOptionsJSON["publicKey"]>
    | NonNullable<CredentialRequestOptionsJSON["publicKey"]>;
};

export type ScuteWebauthnCredentialsResponse = {
  message: string;
  cbt: string;
};

export type ScuteTokenPayload = {
  csrf: string;
  refresh_token: string;
  refresh_expires_at: string;
  access_expires_at: string;
  access_token: string;
  user: string;
};

export type ScuteTokenPayloadUser = {
  uid: UniqueIdentifier;
  email: string;
  name: string;
};

export type ScuteSendMagicLinkResponse = {
  type: "magic_link";
  id: UniqueIdentifier;
};
export type ScuteMagicLinkStatusValidResponse =
  ScuteWebauthnCredentialsResponse;

export type ScuteMagicLinkVerifyWaDisabledResponse = {
  status: string;
  cbt: string;
};
export type ScuteMagicLinkVerifyWaEnabledResponse = ScuteWebauthnStartResponse;
