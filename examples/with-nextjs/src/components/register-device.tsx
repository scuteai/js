import {
  getMeaningfulError,
  ScuteClient,
  ScuteTokenPayload,
} from "@scute/react-hooks";
import { redirect } from "next/navigation";

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
