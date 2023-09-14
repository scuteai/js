import {
  ScuteClient,
  ScuteUserData,
  type ScuteAppData,
  type Session,
} from "@scute/nextjs";

export interface PatchedScuteClientParams {
  logo: ScuteAppData["logo"];
  allowed_identifiers: ScuteAppData["allowed_identifiers"];
  required_identifiers: ScuteAppData["required_identifiers"];
  user?: Partial<ScuteUserData>;
}

export const createPatchedScuteClient = ({
  logo,
  required_identifiers,
  allowed_identifiers,
  user,
}: PatchedScuteClientParams): ScuteClient => {
  const scuteClient = ((ScuteClientClass: typeof ScuteClient) => {
    ScuteClientClass["nextInstanceID"] = 0;

    const session = {
      access: "access",
      accessExpiresAt: new Date(Infinity),
      status: "authenticated",
    } as unknown as Session;

    class PScuteClient extends ScuteClientClass {
      async _initialize() {
        this.emitAuthChangeEvent("initial_session", session, user as any);
        return { error: null };
      }
      async _getSession() {
        return {
          data: {
            session,
            user: user as any,
          },
          error: null,
        };
      }
      async isAnyDeviceRegistered() {
        return true;
      }
      async getRememberedIdentifier() {
        return null;
      }
    }

    const scuteClient = new PScuteClient({
      appId: "mock-app-id",
      baseUrl: "http://mock-server",
      preferences: {
        persistSession: false,
      },
    });

    return scuteClient;
  })(ScuteClient);

  [scuteClient["wretcher"], scuteClient.admin["wretcher"]].forEach(
    (wretcher) => {
      wretcher._config.polyfills = {
        fetch: (async (input, init) => {
          const url = new URL(input as string);
          if (url.pathname.endsWith("v1/apps/mock-app-id")) {
            return new Response(
              JSON.stringify({
                logo,
                required_identifiers,
                allowed_identifiers,
              } as ScuteAppData)
            );
          }

          return new Response();
        }) as typeof fetch,
      };
    }
  );

  return scuteClient;
};
