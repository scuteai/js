<script lang="ts">
  import { getMeaningfulError, type ScuteClient, type ScuteTokenPayload } from "@scute/js-core";

  export let scuteClient: ScuteClient;
  export let tokenPayload: ScuteTokenPayload | null;
  export let setComponent: (component: string) => void;

  async function handleRegisterDevice() {
    if (!tokenPayload) {
      console.error("No token payload");
      return;
    }

    // Sign in with the token payload first
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

    // Add the device for future passkey authentication
    const { data, error } = await scuteClient.addDevice();
    if (error) {
      console.log("addDevice error");
      console.log({ data, error, meaningfulError: getMeaningfulError(error) });
      return;
    }
    setComponent("profile");
  }

  async function handleSkipDeviceRegistration() {
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
  }
</script>

<div class="card">
  <h5>Register Device</h5>
  <button on:click={handleRegisterDevice}>Register Device</button>
  <button on:click={handleSkipDeviceRegistration}>
    Skip Device Registration
  </button>
</div>

<style>
  .card {
    width: 320px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 16px;
    border: 1px solid #ccc;
    padding: 16px;
    border-radius: 8px;
  }
</style>
