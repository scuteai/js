export interface ScuteUser {
  [x: string]: any;
  // uid:string;
  // email:string;
  // name:string;
  // credentials?:any;
  // sessions?:any;
}

export interface ScuteAuthStateInterface {
  appId: string;
  access: string | null;
  refresh: string | null;
  csrf: string | null;
  accessExpiresAt: any | null;
  refreshExpiresAt: any | null;
  user: ScuteUser | null;
  status: "authenticated" | "unauthenticated" | "loading";
  tokenStorage?: "cookie" | "localstorage";
}

export enum ActionType {
  SignIn,
  SignOut,
  Refresh,
}

export interface ScuteTokenPayload {
  access_token: string;
  refresh_token: string;
  csrf: string;
  user: any;
  access_expires_at?: any; //TODO
  refresh_expires_at?: any; //TODO
}

export interface SignInAction {
  type: ActionType.SignIn;
  payload: ScuteTokenPayload;
}
export interface RefreshAction {
  type: ActionType.Refresh;
  payload: ScuteTokenPayload;
}
export interface SignOutAction {
  type: ActionType.SignOut;
}

export type AuthActions = SignInAction | RefreshAction | SignOutAction;
