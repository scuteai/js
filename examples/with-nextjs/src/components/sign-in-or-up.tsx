"use client";

import {
  getMeaningfulError,
  SCUTE_MAGIC_PARAM,
  SCUTE_SKIP_PARAM,
  ScuteClient,
  ScuteTokenPayload,
  useScuteClient,
} from "@scute/react-hooks";
import { redirect, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function SignInOrUp() {
  const [identifier, setIdentifier] = useState("");
  const [component, setComponent] = useState("login");
  const [magicLinkToken, setMagicLinkToken] = useState<string | null>(null);
  const [tokenPayload, setTokenPayload] = useState<ScuteTokenPayload | null>(
    null
  );

  const scuteClient = useScuteClient();

  // Catch magic link token from url if it exists and verify it
  // Oauth token is also a magic link token and will be handled by this block.
  useEffect(() => {
    const magicLinkToken = scuteClient.getMagicLinkToken();
    if (magicLinkToken) {
      setComponent("magic_verify");
      setMagicLinkToken(magicLinkToken);
    }
  }, [scuteClient]);

  return (
    <>
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
        <RegisterDevice scuteClient={scuteClient} tokenPayload={tokenPayload} />
      )}
      {component === "otp_verify" && (
        <OtpForm
          scuteClient={scuteClient}
          identifier={identifier}
          setComponent={setComponent}
          setTokenPayload={setTokenPayload}
        />
      )}
    </>
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
      redirect("/profile");
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
        redirect("/profile");
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

    // MFA-required results carry no token; the MFA events take over then.
    if (data && "authPayload" in data && data.authPayload) {
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
}: {
  scuteClient: ScuteClient;
  tokenPayload: ScuteTokenPayload | null;
}) => {
  const router = useRouter();
  // Exchange the verified payload for a session right away: the Next.js
  // handler only accepts a freshly issued token (30s), so don't wait for a click.
  const exchange = useRef<Promise<boolean> | null>(null);
  const signIn = () => {
    if (!tokenPayload) return Promise.resolve(false);
    if (!exchange.current) {
      exchange.current = scuteClient.signInWithTokenPayload(tokenPayload).then(({ error: signInError }) => {
        if (!signInError) return true;
        console.log({ signInError, meaningfulError: getMeaningfulError(signInError) });
        exchange.current = null;
        return false;
      });
    }
    return exchange.current;
  };

  useEffect(() => {
    signIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenPayload]);

  const handleRegisterDevice = async () => {
    if (!(await signIn())) return;
    const { data, error } = await scuteClient.addDevice();
    if (error) {
      console.log("addDevice error");
      console.log({ data, error, meaningfulError: getMeaningfulError(error) });
      return;
    }
    router.push("/profile");
  };

  const handleSkipDeviceRegistration = async () => {
    if (!(await signIn())) return;
    router.push("/profile");
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
