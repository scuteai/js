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
import { RegisterDevice } from "./register-device";

export default function MagicLinkLogin() {
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
          setComponent={setComponent}
          identifier={identifier}
          setIdentifier={setIdentifier}
        />
      )}

      {component === "magic_verify" && (
        <MagicVerify
          scuteClient={scuteClient}
          setComponent={setComponent}
          magicLinkToken={magicLinkToken}
          setTokenPayload={setTokenPayload}
        />
      )}
      {component === "magic_sent" && <MagicSent identifier={identifier} />}
      {component === "register_device" && (
        <RegisterDevice scuteClient={scuteClient} tokenPayload={tokenPayload} />
      )}
    </>
  );
}

const LoginForm = ({
  scuteClient,
  setComponent,
  identifier,
  setIdentifier,
}: {
  scuteClient: ScuteClient;
  setComponent: (component: string) => void;
  identifier: string;
  setIdentifier: (identifier: string) => void;
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
      // webauthn enabled and device is registered
      redirect("/profile");
    } else {
      setComponent("magic_sent");
    }
  };

  const handleSignInWithGoogle = async () => {
    await scuteClient.signInWithOAuthProvider("google");
  };

  return (
    <form onSubmit={handleSubmit}>
      <h5>Sign in or up</h5>
      <input
        type="email"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      <button type="submit">Sign in or up</button>
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
