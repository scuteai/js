import type { UniqueIdentifier } from "./general";

export type Session =
  | {
      access: string | null;
      accessExpiresAt: Date | null;
      refresh: string | null;
      refreshExpiresAt: Date | null;
      csrf: string | null;
      status: "unauthenticated" | "loading";
    }
  | {
      access: string;
      accessExpiresAt: Date;
      refresh: string | null;
      refreshExpiresAt: Date | null;
      csrf: string;
      status: "authenticated";
    };

// TODO: remove
export interface User {
  uid: UniqueIdentifier;
  email: string;
  name: string;
  // credentials?:any;
  // sessions?:any;
}
