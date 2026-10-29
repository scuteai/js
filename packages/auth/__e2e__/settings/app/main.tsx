// The page the settings suite drives: ScuteSignIn inside the provider, the
// session as the app sees it (data-testid="session"), a sign-out button, and
// the client and its events on window for the tests to read.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@scute/js-core";
import { AuthContextProvider, useAuth } from "@scute/react-hooks";
import { ScuteSignIn } from "@scute/auth-ui-react";

declare const __SCUTE_API_URL__: string;

const params = new URLSearchParams(window.location.search);
const appId = params.get("app") ?? "";

const w = window as any;
w.__events = [] as string[];
w.__signedInCalls = 0;

function Session() {
  const { isAuthenticated, isLoading, user, signOut } = useAuth();
  const state = isLoading ? "loading" : isAuthenticated ? "signed-in" : "signed-out";
  return (
    <div data-testid="session" data-state={state} data-email={user?.email ?? ""}>
      {state}
      {isAuthenticated && (
        <button type="button" data-testid="sign-out" onClick={() => signOut()}>
          Sign out
        </button>
      )}
    </div>
  );
}

// One client for the page, made once (as an app does at module level).
const client = createClient({
  appId,
  baseUrl: __SCUTE_API_URL__,
  preferences: { fingerprinting: params.get("fp") !== "0" },
});
client.onAuthStateChange((event: string) => w.__events.push(event));
w.__scute = client;

function Page() {
  return (
    <AuthContextProvider scuteClient={client}>
      <Session />
      <ScuteSignIn onSignedIn={() => (w.__signedInCalls += 1)} appearance={{ illustration: false }} />
    </AuthContextProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  params.get("strict") === "0" ? <Page /> : (
    <StrictMode>
      <Page />
    </StrictMode>
  )
);
