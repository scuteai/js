<script lang="ts">
  import { getMeaningfulError, type ScuteClient, type ScuteTokenPayload } from "@scute/js-core";

  export let scuteClient: ScuteClient;
  export let identifier: string;
  export let setComponent: (component: string) => void;
  export let setTokenPayload: (tokenPayload: ScuteTokenPayload | null) => void;

  let otp = "";

  async function handleSubmit(e: Event) {
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
  }
</script>

<form on:submit={handleSubmit} class="card">
  <h5>Enter OTP</h5>
  <input
    type="text"
    placeholder="OTP"
    bind:value={otp}
  />
  <button type="submit">Verify OTP</button>
</form>

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

  input {
    padding: 0.6em 1.2em;
    border-radius: 8px;
    border: 1px solid #ccc;
    font-size: 1em;
    font-family: inherit;
  }
</style>
