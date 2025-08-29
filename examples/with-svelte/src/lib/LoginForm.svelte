<script lang="ts">
  import { getMeaningfulError, type ScuteClient } from "@scute/js-core";

  export let scuteClient: ScuteClient;
  export let identifier: string;
  export let setIdentifier: (identifier: string) => void;
  export let setComponent: (component: string) => void;

  async function handleSubmit(e: Event) {
    e.preventDefault();
    const { data, error } = await scuteClient.signInOrUp(identifier);

    if (error) {
      console.log("signInOrUp error");
      console.log({
        data,
        error,
        meaningfulError: error && getMeaningfulError(error),
      });
      return;
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
  }

  async function handleSendCode() {
    if (identifier.includes("@")) {
      await scuteClient.sendLoginMagicLink(identifier);
      setComponent("magic_sent");
    } else {
      await scuteClient.sendLoginOtp(identifier);
      setComponent("otp_verify");
    }
  }

  async function handleSignInWithGoogle() {
    await scuteClient.signInWithOAuthProvider("google");
  }
</script>

<form on:submit={handleSubmit} class="card">
  <h5>Sign in or up</h5>
  <p>
    Enter your email or phone number without any spaces
    <small>(eg. 12125551212)</small>
  </p>
  <input
    type="text"
    bind:value={identifier}
    placeholder="Email or phone number"
  />
  <p style="font-size: 0.625rem; text-align: left;">
    Try to sign in with a passkey if you have one. Will send a magic link or
    otp if no devices are registered for webauthn.
  </p>
  <button type="submit">Sign in or up</button>
  <hr />
  <p style="font-size: 0.625rem; text-align: left;">
    Will always send a magic link or otp.
  </p>
  <button type="button" on:click={handleSendCode}>
    Send otp or magic link
  </button>
  <hr />
  <button type="button" on:click={handleSignInWithGoogle}>
    Sign in with Google
  </button>
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

  hr {
    border: none;
    border-top: 1px solid #ccc;
    margin: 8px 0;
  }
</style>
