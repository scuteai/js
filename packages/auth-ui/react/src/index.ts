export { default as Auth, type AuthProps } from "./Auth";
export { default as Profile, type ProfileProps } from "./Profile";
export { default as SignIn, type SignInProps } from "./SignIn";
export { default as SignUp, type SignUpProps } from "./SignUp";
export { default as UserButton, type UserButtonProps } from "./UserButton";
export {
  Webauthn,
  type WebauthnProps,
  MagicLinkOtp,
  type MagicLinkOtpProps,
} from "./views";
// TODO export { default as SocialAuth, type SocialAuthProps } from "./SocialAuth";

export { ThemeProvider, useTheme } from "./ThemeContext";
export { type Theme } from "@scute/ui-shared";

export const darkTheme = {};
