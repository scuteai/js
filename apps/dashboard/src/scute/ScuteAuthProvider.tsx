import React from "react";
import axios from "axios";
import { ScuteAuthContext } from "./ScuteAuthContext";
import {
  ScuteSession,
  ScuteClient,
  type ScuteAuthStateInterface,
} from "@scute/auth-react";
import {
  authReducer,
  signInWithToken,
  doSignOut,
  refreshToken,
} from "./reducers";

import { apiClient } from "./apiClient";

axios.defaults.withCredentials = true;

export interface ScuteAuthProviderProps {
  appId: string;
  domain: string;
  baseUrl?: string;
  authType?: "default" | "magic_links";
  sessionStorage?: "cookie" | "localstorage";
  children: React.ReactNode;
  middleware?: any;
}

export const ScuteAuthProvider: React.FunctionComponent<
  ScuteAuthProviderProps
> = ({
  authType = "default",
  sessionStorage = "cookie",
  appId,
  baseUrl,
  children,
  domain,
  middleware,
}) => {
  const scuteClient = new ScuteClient({ appId: appId, baseUrl: baseUrl });
  const session = new ScuteSession({
    appId: appId,
    sessionStore: sessionStorage,
    appDomain: domain,
  });
  const [authState, dispatch] = React.useReducer(
    authReducer,
    session.initialState()
  );
  const user = authState.user;
  const config = { baseUrl, appId };

  // TODO: Rename this
  const loginWithToken = async (callbackToken: any): Promise<void> => {
    const result = await scuteClient.signInWithCallback(callbackToken);
    dispatch(signInWithToken(result));
  };

  const getProfile = async () => {
    // return scuteClient.profile(authState.access)
    const result = await apiClient.get(`/v1/auth/${appId}/profile`);
    console.log(result);
    return result;
  };

  const signOut = async () => {
    const result = await apiClient.get("/logout");
    console.log(result);
    dispatch(doSignOut());
  };

  const checkSession = async (state: ScuteAuthStateInterface) => {
    const { access, refresh, csrf } = state;
    console.log(state);
    if (!access) {
      console.log("no access token");
      console.log("no access,", state);
      if (refresh) {
        const result = await apiClient.get("/refresh");
        console.log("result: ", result);
        // @ts-ignore
        if (result.access_token && result.refresh_token) {
          // @ts-ignore
          dispatch(refreshToken(result));
        } else {
          session.sync(state);
        }
      } else {
        session.sync(state);
      }
    } else {
      console.log("access token present");
      session.sync(state);
    }
  };

  // const refreshSession = async() => {
  //   console.log("--- refreshing tokenz");
  //   const {refresh, csrf} = session.initialState();
  //   if (!!refresh && !!csrf) {
  //     const result = await authClient.refresh(refresh, csrf)
  //     dispatch(refreshToken(result))
  //   } else {
  //     signOut()
  //   }

  // }

  React.useEffect(() => {
    // session.sync(authState)
    checkSession(authState);
  }, [authState]);

  return (
    <ScuteAuthContext.Provider
      value={{
        user,
        authState,
        dispatch,
        loginWithToken,
        signOut,
        getProfile,
        config,
      }}
    >
      {children}
    </ScuteAuthContext.Provider>
  );
};
