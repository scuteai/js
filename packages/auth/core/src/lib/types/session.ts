export interface Session {
  access: string | null;
  refresh: string | null;
  csrf: string | null;
  accessExpiresAt: any | null;
  refreshExpiresAt: any | null;
  user: User | null;
  status: "authenticated" | "unauthenticated" | "loading";
}

// TODO: temp
export type ScuteAuthStateInterface = Session;

export interface User {
  [x: string]: any;
  // uid:string;
  // email:string;
  // name:string;
  // credentials?:any;
  // sessions?:any;
}

// TODO: temp
export type ScuteUser = User;

// export type ScuteUser = {
//   id: UniqueIdentifier;
//   email: string;
//   username: string;
//   last_login?: string;
//   status?: string;
// } & Record<string, unknown>;

export interface ScuteTokenPayload {
  access_token: string;
  refresh_token: string;
  csrf: string;
  user: any;
  access_expires_at?: any; //TODO
  refresh_expires_at?: any; //TODO
}
