import { useEffect, useState, createContext, useContext } from "react";
import {
  ScuteClient,
  type ScuteClientConfig,
  type ScuteUser,
  type Session,
} from "@scute/auth-core";

export interface AuthSession {
  user: ScuteUser | null;
  session: Session;
  signOut: () => void;
}

const AuthContext = createContext<AuthSession | undefined>(undefined);

export type AuthContextProviderProps = {
  children?: React.ReactElement;
} & (
  | {
      scuteClient?: undefined;
      scuteClientConfig: ScuteClientConfig;
    }
  | {
      scuteClient: ScuteClient;
      scuteClientConfig?: undefined;
    }
);

export const AuthContextProvider = (props: AuthContextProviderProps) => {
  const { scuteClient: _scuteClient, scuteClientConfig, children } = props;
  const [scuteClient] = useState(
    () => _scuteClient ?? new ScuteClient(scuteClientConfig)
  );

  const [session, setSession] = useState<AuthSession["session"]>({
    access: null,
    refresh: null,
    csrf: null,
    accessExpiresAt: null,
    refreshExpiresAt: null,
    user: null,
    status: "loading",
  });

  const [user, setUser] = useState<AuthSession["user"] | null>(
    session?.user ?? null
  );

  useEffect(() => {
    const unsubscribe = scuteClient.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    (async () => {
      const { data: session } = await scuteClient.getSession();
      setSession(session);
      setUser(session?.user ?? null);
    })();

    return () => unsubscribe();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = {
    session,
    user,
    signOut: () => scuteClient.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error(`useAuth must be used within a AuthContextProvider.`);
  }
  return context;
};
