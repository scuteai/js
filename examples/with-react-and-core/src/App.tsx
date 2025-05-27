import {
  getMeaningfulError,
  SCUTE_MAGIC_PARAM,
  SCUTE_SKIP_PARAM,
  ScuteClient,
  type ScuteTokenPayload,
  type ScuteUserData,
} from "@scute/js-core";
import { useEffect, useRef, useState } from "react";
import { scuteClient } from "./scute";
import "./App.css";

function App() {
  const [identifier, setIdentifier] = useState("");
  const [component, setComponent] = useState("");
  const [magicLinkToken, setMagicLinkToken] = useState<string | null>(null);
  const [tokenPayload, setTokenPayload] = useState<ScuteTokenPayload | null>(
    null
  );

  // Catch magic link token from url if it exists and verify it
  useEffect(() => {
    const magicLinkToken = scuteClient.getMagicLinkToken();
    if (magicLinkToken) {
      setComponent("magic_verify");
      setMagicLinkToken(magicLinkToken);
    }
  }, [scuteClient]);

  useEffect(() => {
    const getSession = async () => {
      const { data, error } = await scuteClient.getSession();
      console.log(data);
      if (error) {
        console.error(error);
      }
      if (data?.session && data.session.status === "authenticated") {
        setComponent("profile");
      } else {
        setComponent("login");
      }
    };
    getSession();
  }, []);

  return (
    <div className="app">
      {component === "profile" && <Profile setComponent={setComponent} />}
      {component === "login" && (
        <LoginForm
          scuteClient={scuteClient}
          identifier={identifier}
          setIdentifier={setIdentifier}
          setComponent={setComponent}
        />
      )}

      {component === "magic_verify" && (
        <MagicVerify
          scuteClient={scuteClient}
          magicLinkToken={magicLinkToken}
          setTokenPayload={setTokenPayload}
          setComponent={setComponent}
        />
      )}
      {component === "magic_sent" && <MagicSent identifier={identifier} />}
      {component === "register_device" && (
        <RegisterDevice
          scuteClient={scuteClient}
          tokenPayload={tokenPayload}
          setComponent={setComponent}
        />
      )}
      {component === "otp_verify" && (
        <OtpForm
          scuteClient={scuteClient}
          identifier={identifier}
          setComponent={setComponent}
          setTokenPayload={setTokenPayload}
        />
      )}
    </div>
  );
}

const LoginForm = ({
  scuteClient,
  identifier,
  setIdentifier,
  setComponent,
}: {
  scuteClient: ScuteClient;
  identifier: string;
  setIdentifier: (identifier: string) => void;
  setComponent: (component: string) => void;
}) => {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { data, error } = await scuteClient.signInOrUp(identifier);

    if (error) {
      console.log("signInOrUp error");
      return console.log({
        data,
        error,
        meaningfulError: error && getMeaningfulError(error),
      });
    }

    if (!data) {
      // passkey verified.
      setComponent("profile");
    } else {
      if (identifier.includes("@")) {
        setComponent("magic_sent");
      } else {
        setComponent("otp_verify");
      }
    }
  };

  const handleSendCode = async () => {
    if (identifier.includes("@")) {
      await scuteClient.sendLoginMagicLink(identifier);
      setComponent("magic_sent");
    } else {
      await scuteClient.sendLoginOtp(identifier);
      setComponent("otp_verify");
    }
  };

  const handleSignInWithGoogle = async () => {
    await scuteClient.signInWithOAuthProvider("google");
  };

  return (
    <form onSubmit={handleSubmit}>
      <h5>Sign in or up</h5>
      <p>
        Enter your email or phone number without any spaces{" "}
        <small>(eg. 12125551212)</small>
      </p>
      <input
        type="text"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      <p style={{ fontSize: "0.625rem", textAlign: "left" }}>
        Try to sign in with a passkey if you have one. Will send a magic link or
        otp if no devices are registered for webauthn.
      </p>
      <button type="submit">Sign in or up</button>
      <hr />
      <p style={{ fontSize: "0.625rem", textAlign: "left" }}>
        Will always send a magic link or otp.
      </p>
      <button type="button" onClick={handleSendCode}>
        Send otp or magic link
      </button>
      <hr />
      <button type="button" onClick={handleSignInWithGoogle}>
        Sign in with Google
      </button>
    </form>
  );
};

const MagicSent = ({ identifier }: { identifier: string }) => {
  return (
    <div className="card">
      <h5>Magic Link Sent</h5>
      <p>
        Please check <strong>{identifier}</strong> for the magic link.
      </p>
    </div>
  );
};

const MagicVerify = ({
  scuteClient,
  setComponent,
  magicLinkToken,
  setTokenPayload,
}: {
  scuteClient: ScuteClient;
  setComponent: (component: string) => void;
  magicLinkToken: string | null;
  setTokenPayload: (tokenPayload: ScuteTokenPayload | null) => void;
}) => {
  const url = new URL(window.location.href);
  const shouldSkipDeviceRegistration = !!url.searchParams.get(SCUTE_SKIP_PARAM);
  const verificationStarted = useRef(false);

  useEffect(() => {
    const verifyMagicLink = async () => {
      if (!magicLinkToken) {
        return console.log("no magic link token found");
      }

      const { data, error } = await scuteClient.verifyMagicLinkToken(
        magicLinkToken
      );
      if (error) {
        console.log("verifyMagicLink error");
        return console.log({
          data,
          error,
          meaningfulError: error && getMeaningfulError(error),
        });
      }

      if (!shouldSkipDeviceRegistration && data?.authPayload) {
        setTokenPayload(data.authPayload);
        setComponent("register_device");
      } else {
        setComponent("profile");
      }
      url.searchParams.delete(SCUTE_SKIP_PARAM);
      url.searchParams.delete(SCUTE_MAGIC_PARAM);
      window.history.replaceState({}, "", url.toString());
    };

    if (!verificationStarted.current) {
      verificationStarted.current = true;
      verifyMagicLink();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card">
      <h5>Verifying Magic Link...</h5>
    </div>
  );
};

const OtpForm = ({
  scuteClient,
  identifier,
  setComponent,
  setTokenPayload,
}: {
  scuteClient: ScuteClient;
  identifier: string;
  setComponent: (component: string) => void;
  setTokenPayload: (tokenPayload: ScuteTokenPayload | null) => void;
}) => {
  const [otp, setOtp] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { data, error } = await scuteClient.verifyOtp(otp, identifier);
    if (error) {
      console.log("verifyOtp error");
      console.log({ data, error, meaningfulError: getMeaningfulError(error) });
      return;
    }

    if (data) {
      setTokenPayload(data.authPayload);
      setComponent("register_device");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h5>Enter OTP</h5>
      <input
        type="text"
        placeholder="OTP"
        value={otp}
        onChange={(e) => setOtp(e.target.value)}
      />
      <button type="submit">Verify OTP</button>
    </form>
  );
};

export const RegisterDevice = ({
  scuteClient,
  tokenPayload,
  setComponent,
}: {
  scuteClient: ScuteClient;
  tokenPayload: ScuteTokenPayload | null;
  setComponent: (component: string) => void;
}) => {
  const handleRegisterDevice = async () => {
    if (!tokenPayload) {
      console.error("No token payload");
      return;
    }
    const { error: signInError } = await scuteClient.signInWithTokenPayload(
      tokenPayload
    );
    if (signInError) {
      console.log("signInWithTokenPayload error");
      console.log({
        signInError,
        meaningfulError: getMeaningfulError(signInError),
      });
      return;
    }
    const { data, error } = await scuteClient.addDevice();
    if (error) {
      console.log("addDevice error");
      console.log({ data, error, meaningfulError: getMeaningfulError(error) });
      return;
    }
    setComponent("profile");
  };

  const handleSkipDeviceRegistration = async () => {
    if (!tokenPayload) {
      console.error("No token payload");
      return;
    }
    const { error: signInError } = await scuteClient.signInWithTokenPayload(
      tokenPayload
    );
    if (signInError) {
      console.log("signInWithTokenPayload error");
      console.log({
        signInError,
        meaningfulError: getMeaningfulError(signInError),
      });
      return;
    }
    setComponent("profile");
  };

  return (
    <div className="card">
      <h5>Register Device</h5>
      <button onClick={handleRegisterDevice}>Register Device</button>
      <button onClick={handleSkipDeviceRegistration}>
        Skip Device Registration
      </button>
    </div>
  );
};

const Profile = ({
  setComponent,
}: {
  setComponent: (component: string) => void;
}) => {
  const [user, setUser] = useState<ScuteUserData | null>(null);

  useEffect(() => {
    const getSession = async () => {
      const { data, error } = await scuteClient.getSession();
      if (error) {
        console.error(error);
      }
      if (!data?.session || data.session.status === "unauthenticated") {
        setComponent("login");
      } else {
        setUser(data.user);
      }
    };
    getSession();
  }, []);

  return (
    <>
      <div className="card" style={{ width: "420px" }}>
        <h5>Profile</h5>
        <pre style={{ whiteSpace: "pre-wrap", textAlign: "left" }}>
          {user
            ? JSON.stringify({ ...user, sessions: "[...]" }, null, 2)
            : "Loading..."}
        </pre>
        <button
          onClick={async () => {
            await scuteClient.signOut();
            setComponent("login");
          }}
        >
          Sign Out
        </button>
      </div>
      <div style={{ width: "420px" }}>
        <h5>Sessions</h5>
        <ul style={{ textAlign: "left" }}>
          {user?.sessions
            ? user?.sessions.map((session) => (
                <li
                  className="card"
                  style={{
                    width: "420px",
                    textAlign: "left",
                    padding: "10px",
                    margin: "10px",
                  }}
                  key={session.id}
                >
                  <p>{session.id}</p>
                  <pre style={{ whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(session, null, 2)}
                  </pre>
                  <p>
                    <button
                      onClick={() =>
                        scuteClient.revokeSession(session.id).then(() => {
                          window.location.reload();
                        })
                      }
                    >
                      Delete Session
                    </button>
                  </p>
                </li>
              ))
            : "Loading..."}
        </ul>
      </div>
    </>
  );
};

export default App;
