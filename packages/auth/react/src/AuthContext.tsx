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
  SCUTE_IMPERSONATION_HANDOFF_PARAM,
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
  /**
   * Take a "sign in as this user" hand-off (support access) when the page
   * opens with `?sct_imp=<code>`: the code is removed from the address bar
   * and swapped for the session as the user, and `useImpersonation` reports
   * it for your banner. The code works once, for a couple of minutes.
   * @default true
   */
  acceptImpersonationHandoff?: boolean;
};

// Reads the hand-off code from the address bar and removes it at once, so it
// can't stay in the history or a referrer even when the swap fails.
function takeHandoffCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get(SCUTE_IMPERSONATION_HANDOFF_PARAM);
    if (!code) return null;
    url.searchParams.delete(SCUTE_IMPERSONATION_HANDOFF_PARAM);
    window.history?.replaceState?.(window.history.state, "", url.toString());
    return code;
  } catch {
    return null;
  }
}

export const AuthContextProvider = ({
  scuteClient,
  children,
  acceptImpersonationHandoff = true,
}: AuthContextProviderProps) => {
  const [session, setSession] = useState<Session>(sessionLoadingState());
  const [user, setUser] = useState<ScuteUserData | null>(null);

  useEffect(() => {
    if (!acceptImpersonationHandoff) return;
    const code = takeHandoffCode();
    if (!code) return;
    scuteClient.signInWithImpersonationHandoff(code).then(
      ({ error }) => {
        if (error) console.warn("Scute: the sign-in-as-user link was used or has run out.", error);
      },
      () => {}
    );
  }, [scuteClient, acceptImpersonationHandoff]);

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
