import type { UniqueIdentifier } from ".";
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
    | CredentialCreationOptionsJSON["publicKey"]
    | CredentialRequestOptionsJSON["publicKey"];
};

export type ScuteWebauthnCredentialsResponse = {
  message: string;
  cbt: string;
};

export type ScuteCallbackTokenResponse = {
  csrf: string;
  refresh_token: string;
  refresh_expires_at: string;
  access_expires_at: string;
  access_token: string;
  user: string;
};

export type ScuteSendMagicLinkResponse = {
  type: "magic_link";
  id: string
};
export type ScuteMagicLinkStatusValidResponse = ScuteWebauthnCredentialsResponse;

export type ScuteMagicLinkVerifyWaDisabledResponse = {
  status: string;
  cbt: string;
};
export type ScuteMagicLinkVerifyWaEnabledResponse = ScuteWebauthnStartResponse;
