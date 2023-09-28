import Auth, { type AuthProps } from "../Auth";

export interface MagicLinkOtpProps extends Omit<AuthProps, "webauthn"> {}

const MagicLinkOtp = (props: MagicLinkOtpProps) => {
  return <Auth {...props} webauthn="disabled" />;
};

export default MagicLinkOtp;
