import React from "react";
import type { ScuteAuthStateInterface } from "@scute/auth-react";

export interface ScuteAuthContextInterface {
  authState?: ScuteAuthStateInterface;
  dispatch: React.Dispatch<any>;
  loginWithToken: any;
  signOut: any;
  user: any;
  getProfile: any;
  config: any;
}

const ScuteAuthContext = React.createContext<ScuteAuthContextInterface | null>(
  null
);

const ScuteAuthContextConsumer = ScuteAuthContext.Consumer;
export { ScuteAuthContextConsumer, ScuteAuthContext };
