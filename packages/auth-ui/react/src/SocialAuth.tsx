import Auth, { type AuthProps } from "./Auth";

export interface SocialAuthProps extends Omit<AuthProps, "view"> {}

const SocialAuth = (props: SocialAuthProps) => {
  return <Auth {...props} />;
};

export default SocialAuth;

// TODO