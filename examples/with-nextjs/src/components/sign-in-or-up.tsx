"use client";

import {
  getMeaningfulError,
  SCUTE_MAGIC_PARAM,
  SCUTE_SKIP_PARAM,
  ScuteClient,
  ScuteTokenPayload,
  useScuteClient,
} from "@scute/react-hooks";
import { redirect } from "next/navigation";
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
}: {
  scuteClient: ScuteClient;
  tokenPayload: ScuteTokenPayload | null;
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
    redirect("/profile");
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
    redirect("/profile");
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
