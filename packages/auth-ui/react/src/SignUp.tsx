import { VIEWS } from "@scute/ui-shared";
import Auth, { type AuthProps } from "./Auth";

export interface SignUpProps extends Omit<AuthProps, "view"> {}

const SignUp = (props: SignUpProps) => {
  return <Auth {...props} view={VIEWS.SIGN_UP} />;
};

export default SignUp;
