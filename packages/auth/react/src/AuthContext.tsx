import {
  useEffect,
  useState,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import {
  ScuteClient,
  type Session,
  type ScuteUserData,
  sessionLoadingState,
} from "@scute/core";

export type AuthSession = {
  session: Session;
  signOut: () => ReturnType<ScuteClient["signOut"]>;
} & (
  | {
      user: null;
      isAuthenticated: false;
      isLoading: false;
    }
  | {
      user: null;
      isAuthenticated: false;
      isLoading: true;
    }
  | {
      user: ScuteUserData;
      isAuthenticated: true;
      isLoading: false;
    }
);

const AuthContext = createContext<AuthSession | undefined>(undefined);
const ScuteClientContext = createContext<ScuteClient | undefined>(undefined);

export type AuthContextProviderProps = {
  scuteClient: ScuteClient;
  children: ReactNode;
};

export const AuthContextProvider = ({
  scuteClient,
  children,
}: AuthContextProviderProps) => {
  const [session, setSession] = useState<Session>(sessionLoadingState());
  const [user, setUser] = useState<ScuteUserData | null>(null);

  useEffect(() => {
    const unsubscribe = scuteClient.onAuthStateChange(
      async (_event, session, user) => {
        setSession(session);
        setUser(user);
      }
    );

    return () => unsubscribe();
  }, [scuteClient]);

  const isAuthenticated = session.status === "authenticated";
  const isLoading = session.status === "loading";

  const authContextValue = {
    session,
    user,
    isAuthenticated,
    isLoading,
    signOut: () => scuteClient.signOut(),
  };

  return (
    <ScuteClientContext.Provider value={scuteClient}>
      <AuthContext.Provider value={authContextValue as any}>
        {children}
      </AuthContext.Provider>
    </ScuteClientContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error(`useAuth must be used within a AuthContextProvider.`);
  }
  return context;
};

export const useScuteClient = () => {
  const context = useContext(ScuteClientContext);
  if (context === undefined) {
    throw new Error(
      `useScuteClient must be used within a AuthContextProvider.`
    );
  }
  return context;
};
