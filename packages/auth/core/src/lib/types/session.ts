export type AuthenticatedSession =
  | {
      access: string;
      accessExpiresAt: Date;
      refresh?: string | undefined;
      refreshExpiresAt?: Date | undefined;
      status: "authenticated";
    }
  | {
      access: string;
      accessExpiresAt: Date;
      refresh: string;
      refreshExpiresAt: Date;
      status: "authenticated";
    };

export type Session =
  | AuthenticatedSession
  | {
      access: null;
      accessExpiresAt: null;
      refresh?: string | null;
      refreshExpiresAt?: Date | null;
      status: "unauthenticated" | "loading";
    };
