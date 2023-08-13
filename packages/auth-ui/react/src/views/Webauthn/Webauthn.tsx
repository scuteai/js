import type { ScuteWebauthnOption } from "@scute/core";
import Auth, { type AuthProps } from "../../Auth";

export interface WebauthnProps extends Omit<AuthProps, "webauthn"> {
  mode?: Exclude<ScuteWebauthnOption, "disabled">;
}

const Webauthn = (props: WebauthnProps) => {
  const { mode, ...restProps } = props;
  
  return <Auth {...restProps} webauthn={mode} />;
};

export default Webauthn;
