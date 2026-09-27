"use client";

import {
  useEffect,
  useState,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import {
  AUTH_CHANGE_EVENTS,
  ScuteClient,
  type Session,
  type ScuteUserData,
  sessionLoadingState,
} from "@scute/js-core";

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

// Events that carry the real session state: ScuteClient.onAuthStateChange
// resolves the session for these before calling listeners. Every other event
// (OTP_PENDING, MAGIC_PENDING, MFA_REQUIRED, WEBAUTHN_VERIFY_START, ...) is
// delivered with an unauthenticated placeholder and a null user, so it must
// not overwrite the session.
const SESSION_EVENTS: readonly string[] = [
  AUTH_CHANGE_EVENTS.INITIAL_SESSION,
  AUTH_CHANGE_EVENTS.SESSION_REFETCH,
  AUTH_CHANGE_EVENTS.SESSION_EXPIRED,
  AUTH_CHANGE_EVENTS.TOKEN_REFRESHED,
  AUTH_CHANGE_EVENTS.SIGNED_IN,
  AUTH_CHANGE_EVENTS.SIGNED_OUT,
  AUTH_CHANGE_EVENTS.WEBAUTHN_REGISTER_START,
  AUTH_CHANGE_EVENTS.WEBAUTHN_REGISTER_SUCCESS,
];

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
      async (event, session, user) => {
        if (SESSION_EVENTS.indexOf(event) === -1) return;
        setSession(session);
        setUser(user);
      }
    );

    return () => unsubscribe();
  }, [scuteClient]);

  // The AuthSession type promises a user whenever isAuthenticated is true.
  const isAuthenticated = session.status === "authenticated" && !!user;
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
