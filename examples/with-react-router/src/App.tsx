import {
  getMeaningfulError,
  SCUTE_MAGIC_PARAM,
  SCUTE_SKIP_PARAM,
  useAuth,
  useScuteClient,
} from "@scute/react-hooks";
import { useEffect, useRef, useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router";

import "./App.css";

function App() {
  const scuteClient = useScuteClient();
  const location = useLocation();

  // Catch magic link token from url if it exists
  useEffect(() => {
    const magicLinkToken = scuteClient.getMagicLinkToken();
    if (magicLinkToken && location.pathname !== "/magic-verify") {
      // Navigate to magic verify route if we have a token
      window.history.replaceState({}, "", "/magic-verify" + location.search);
    }
  }, [scuteClient, location]);

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<MagicVerify />} />
        <Route path="/login" element={<LoginForm />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/magic-sent" element={<MagicSent />} />
        <Route path="/register-device" element={<RegisterDevice />} />
        <Route path="/otp-verify" element={<OtpForm />} />
      </Routes>
    </div>
  );
}

const LoginForm = () => {
  const [identifier, setIdentifier] = useState("");
  const navigate = useNavigate();
  const scuteClient = useScuteClient();

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
      console.log("Navibgate");
      navigate("/profile");
    } else {
      if (identifier.includes("@")) {
        navigate("/magic-sent", { state: { identifier } });
      } else {
        navigate("/otp-verify", { state: { identifier } });
      }
    }
  };

  const handleSendCode = async () => {
    if (identifier.includes("@")) {
      await scuteClient.sendLoginMagicLink(identifier);
      navigate("/magic-sent", { state: { identifier } });
    } else {
      await scuteClient.sendLoginOtp(identifier);
      navigate("/otp-verify", { state: { identifier } });
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

const MagicSent = () => {
  const location = useLocation();
  const identifier = location.state?.identifier || "";

  return (
    <div className="card">
      <h5>Magic Link Sent</h5>
      <p>
        Please check <strong>{identifier}</strong> for the magic link.
      </p>
    </div>
  );
};

const MagicVerify = () => {
  const navigate = useNavigate();
  const scuteClient = useScuteClient();
  const verificationStarted = useRef(false);

  useEffect(() => {
    const verifyMagicLink = async () => {
      const magicLinkToken = scuteClient.getMagicLinkToken();
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

      const url = new URL(window.location.href);
      const shouldSkipDeviceRegistration =
        !!url.searchParams.get(SCUTE_SKIP_PARAM);

      if (!shouldSkipDeviceRegistration && data?.authPayload) {
        navigate("/register-device", {
          state: { tokenPayload: data.authPayload },
        });
      } else {
        navigate("/profile");
      }

      // Clean up URL parameters
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

const OtpForm = () => {
  const [otp, setOtp] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const scuteClient = useScuteClient();
  const identifier = location.state?.identifier || "";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { data, error } = await scuteClient.verifyOtp(otp, identifier);
    if (error) {
      console.log("verifyOtp error");
      console.log({ data, error, meaningfulError: getMeaningfulError(error) });
      return;
    }

    if (data) {
      navigate("/register-device", {
        state: { tokenPayload: data.authPayload },
      });
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

export const RegisterDevice = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const scuteClient = useScuteClient();
  const tokenPayload = location.state?.tokenPayload || null;

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
    navigate("/profile");
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
    navigate("/profile");
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

const Profile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const scuteClient = useScuteClient();

  useEffect(() => {
    scuteClient.getSession().then((session) => {
      if (!session.data.user) {
        navigate("/login");
      }
    });
  }, [navigate, scuteClient]);

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
            navigate("/login");
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
