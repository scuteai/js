import { VIEWS } from "@scute/ui-shared";
import Auth, { type AuthProps } from "./Auth";

export interface SignInProps extends Omit<AuthProps, "view"> {}

const SignIn = (props: SignInProps) => {
  return <Auth {...props} view={VIEWS.SIGN_IN} />;
};

export default SignIn;
