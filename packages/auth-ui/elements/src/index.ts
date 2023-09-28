export { default as Auth, AUTH_ELEMENT_NAME, type AuthProps } from "./Auth";
export {
  default as SignIn,
  SIGN_IN_ELEMENT_NAME,
  type SignInProps,
} from "./SignIn";
export {
  default as SignUp,
  SIGN_UP_ELEMENT_NAME,
  type SignUpProps,
} from "./SignUp";
export {
  default as Profile,
  PROFILE_ELEMENT_NAME,
  type ProfileProps,
} from "./Profile";
export {
  default as Webauthn,
  WEBAUTHN_ELEMENT_NAME,
  type WebauthnProps,
} from "./Webauthn";
export {
  default as MagicLinkOtp,
  MAGIC_LINK_OTP_ELEMENT_NAME,
  type MagicLinkOtpProps,
} from "./MagicLinkOtp";
// TODO export { default as SocialAuth, SOCIAL_AUTH_ELEMENT_NAME, type SocialAuthProps } from "./SocialAuth";

export { safelyDefineElement } from "./utils/define";
export { render, updateProps } from "./utils/render";

export { darkTheme, type Theme } from "@scute/ui-react";
