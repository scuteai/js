<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getMeaningfulError,
    SCUTE_MAGIC_PARAM,
    SCUTE_SKIP_PARAM,
    type ScuteTokenPayload,
    type ScuteUserData,
  } from "@scute/js-core";
  import { scuteClient } from './scute';
  import LoginForm from './lib/LoginForm.svelte';
  import MagicSent from './lib/MagicSent.svelte';
  import MagicVerify from './lib/MagicVerify.svelte';
  import OtpForm from './lib/OtpForm.svelte';
  import RegisterDevice from './lib/RegisterDevice.svelte';
  import Profile from './lib/Profile.svelte';

  let identifier = '';
  let component = '';
  let magicLinkToken: string | null = null;
  let tokenPayload: ScuteTokenPayload | null = null;

  // Catch magic link token from url if it exists and verify it
  // OAuth token is also a magic link token and will be handled by this block.
  onMount(() => {
    const token = scuteClient.getMagicLinkToken();
    if (token) {
      component = 'magic_verify';
      magicLinkToken = token;
      return;
    }

    // Check existing session on app load
    const getSession = async () => {
      const { data, error } = await scuteClient.getSession();
      console.log(data);
      if (error) {
        console.error(error);
      }
      if (data?.session && data.session.status === "authenticated") {
        component = "profile";
      } else {
        component = "login";
      }
    };
    getSession();
  });

  function setComponent(newComponent: string) {
    component = newComponent;
  }

  function setIdentifier(newIdentifier: string) {
    identifier = newIdentifier;
  }

  function setTokenPayload(newTokenPayload: ScuteTokenPayload | null) {
    tokenPayload = newTokenPayload;
  }

  function setMagicLinkToken(token: string | null) {
    magicLinkToken = token;
  }
</script>

<main class="app">
  {#if component === "profile"}
    <Profile {setComponent} />
  {:else if component === "login"}
    <LoginForm {scuteClient} {identifier} {setIdentifier} {setComponent} />
  {:else if component === "magic_verify"}
    <MagicVerify {scuteClient} {magicLinkToken} {setTokenPayload} {setComponent} />
  {:else if component === "magic_sent"}
    <MagicSent {identifier} />
  {:else if component === "register_device"}
    <RegisterDevice {scuteClient} {tokenPayload} {setComponent} />
  {:else if component === "otp_verify"}
    <OtpForm {scuteClient} {identifier} {setComponent} {setTokenPayload} />
  {/if}
</main>

<style>
  .app {
    display: flex;
    flex-direction: column;
    gap: 32px;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
  }
</style>