import type { UniqueIdentifier } from "./general";

export type AuthenticatedSession =
  | {
      access: string;
      accessExpiresAt: Date;
      refresh?: string | undefined;
      refreshExpiresAt?: Date | undefined;
      csrf?: string | undefined;
      status: "authenticated";
    }
  | {
      access: string;
      accessExpiresAt: Date;
      refresh: string;
      refreshExpiresAt: Date;
      csrf: string;
      status: "authenticated";
    };

export type Session =
  | AuthenticatedSession
  | {
      access: null;
      accessExpiresAt: null;
      refresh?: null;
      refreshExpiresAt?: null;
      csrf?: null;
      status: "unauthenticated" | "loading";
    };
