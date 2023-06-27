import type { UniqueIdentifier } from "./general";

export interface Session {
  access: string | null;
  accessExpiresAt: Date | null;
  refresh: string | null;
  refreshExpiresAt: Date | null;
  csrf: string | null;
  user: User | null;
  status: "authenticated" | "unauthenticated" | "loading";
}

export interface User {
  uid: UniqueIdentifier;
  email: string;
  name: string;
  // credentials?:any;
  // sessions?:any;
}
