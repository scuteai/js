import type {
  ScuteTokenPayload,
  ScuteAuthStateInterface,
  AuthActions,
  SignInAction,
  RefreshAction,
  SignOutAction,
} from "@scute/auth-react";

import { ActionType } from "@scute/auth-react";

export const authReducer = (
  state: ScuteAuthStateInterface,
  action: AuthActions
): ScuteAuthStateInterface => {
  // sign in
  switch (action.type) {
    case ActionType.SignIn:
      return {
        ...state,
        access: action.payload.access_token,
        refresh: action.payload.refresh_token,
        csrf: action.payload.csrf,
        accessExpiresAt: new Date(action.payload.access_expires_at),
        refreshExpiresAt: new Date(action.payload.refresh_expires_at),
        user: JSON.parse(action.payload.user),
        status: "authenticated",
      };
    case ActionType.Refresh:
      return {
        ...state,
        access: action.payload.access_token,
        refresh: action.payload.refresh_token,
        csrf: action.payload.csrf,
        accessExpiresAt: new Date(action.payload.access_expires_at),
        refreshExpiresAt: new Date(action.payload.refresh_expires_at),
        user: JSON.parse(action.payload.user),
        status: "authenticated",
      };
    case ActionType.SignOut:
      return {
        ...state,
        access: null,
        refresh: null,
        csrf: null,
        accessExpiresAt: null,
        refreshExpiresAt: null,
        user: null,
        status: "unauthenticated",
      };
  }
};

export const signInWithToken = (
  signInPayload: ScuteTokenPayload
): SignInAction => {
  return {
    type: ActionType.SignIn,
    payload: signInPayload,
  };
};

export const refreshToken = (
  refreshPayload: ScuteTokenPayload
): RefreshAction => {
  return {
    type: ActionType.Refresh,
    payload: refreshPayload,
  };
};

export const doSignOut = (): SignOutAction => {
  return {
    type: ActionType.SignOut,
  };
};

// signout

// refresh

// validate
