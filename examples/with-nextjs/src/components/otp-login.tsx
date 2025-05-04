"use client";

import {
  getMeaningfulError,
  ScuteClient,
  ScuteTokenPayload,
  useScuteClient,
} from "@scute/react-hooks";
import { useState } from "react";
import { RegisterDevice } from "./register-device";

export default function OtpLogin() {
  const scuteClient = useScuteClient();

  const [tokenPayload, setTokenPayload] = useState<ScuteTokenPayload | null>(
    null
  );
  const [component, setComponent] = useState<string>("login");
  const [identifier, setIdentifier] = useState<string>("");
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
      {component === "otp" && (
        <OtpForm
          scuteClient={scuteClient}
          identifier={identifier}
          setComponent={setComponent}
          setTokenPayload={setTokenPayload}
        />
      )}
      {component === "register_device" && (
        <RegisterDevice tokenPayload={tokenPayload} scuteClient={scuteClient} />
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
  identifier: string;
  setIdentifier: (identifier: string) => void;
  setComponent: (component: string) => void;
}) => {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { data, error } = await scuteClient.sendLoginOtp(identifier);
    if (error) {
      console.log("sendLoginOtp error");
      console.log({
        data,
        error,
        meaningfulError: getMeaningfulError(error),
      });
      return;
    }
    setComponent("otp");
  };

  return (
    <form onSubmit={handleSubmit}>
      <h5>Login with OTP</h5>
      <input
        type="tel"
        placeholder="Phone number"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      <button type="submit">Send OTP</button>
    </form>
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
    setComponent("register_device");
    if (data) {
      setTokenPayload(data.authPayload);
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
