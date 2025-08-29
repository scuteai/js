<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getMeaningfulError,
    SCUTE_MAGIC_PARAM,
    SCUTE_SKIP_PARAM,
    type ScuteClient,
    type ScuteTokenPayload,
  } from "@scute/js-core";

  export let scuteClient: ScuteClient;
  export let setComponent: (component: string) => void;
  export let magicLinkToken: string | null;
  export let setTokenPayload: (tokenPayload: ScuteTokenPayload | null) => void;

  let verificationStarted = false;

  onMount(() => {
    const verifyMagicLink = async () => {
      if (!magicLinkToken) {
        console.log("no magic link token found");
        return;
      }

      const url = new URL(window.location.href);
      const shouldSkipDeviceRegistration = !!url.searchParams.get(SCUTE_SKIP_PARAM);

      const { data, error } = await scuteClient.verifyMagicLinkToken(
        magicLinkToken
      );
      if (error) {
        console.log("verifyMagicLink error");
        console.log({
          data,
          error,
          meaningfulError: error && getMeaningfulError(error),
        });
        return;
      }

      if (!shouldSkipDeviceRegistration && data?.authPayload) {
        setTokenPayload(data.authPayload);
        setComponent("register_device");
      } else {
        setComponent("profile");
      }

      // Clean up URL parameters
      url.searchParams.delete(SCUTE_SKIP_PARAM);
      url.searchParams.delete(SCUTE_MAGIC_PARAM);
      window.history.replaceState({}, "", url.toString());
    };

    if (!verificationStarted) {
      verificationStarted = true;
      verifyMagicLink();
    }
  });
</script>

<div class="card">
  <h5>Verifying Magic Link...</h5>
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
