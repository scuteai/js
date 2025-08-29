<script lang="ts">
  import { onMount } from 'svelte';
  import { type ScuteUserData } from "@scute/js-core";
  import { scuteClient } from '../scute';

  export let setComponent: (component: string) => void;

  let user: ScuteUserData | null = null;

  onMount(() => {
    const getSession = async () => {
      const { data, error } = await scuteClient.getSession();
      if (error) {
        console.error(error);
      }
      if (!data?.session || data.session.status === "unauthenticated") {
        setComponent("login");
      } else {
        user = data.user;
      }
    };
    getSession();
  });

  async function handleSignOut() {
    await scuteClient.signOut();
    setComponent("login");
  }

  async function handleRevokeSession(sessionId: string) {
    await scuteClient.revokeSession(sessionId);
    // Reload the page to refresh the session list
    window.location.reload();
  }
</script>

<div class="profile-container">
  <div class="card" style="width: 420px;">
    <h5>Profile</h5>
    <pre style="white-space: pre-wrap; text-align: left;">
      {user
        ? JSON.stringify({ ...user, sessions: "[...]" }, null, 2)
        : "Loading..."}
    </pre>
    <button on:click={handleSignOut}>
      Sign Out
    </button>
  </div>

  <div style="width: 420px;">
    <h5>Sessions</h5>
    <ul style="text-align: left; list-style: none; padding: 0;">
      {#if user?.sessions}
        {#each user.sessions as session (session.id)}
          <li
            class="card"
            style="width: 420px; text-align: left; padding: 10px; margin: 10px 0;"
          >
            <p>{session.id}</p>
            <pre style="white-space: pre-wrap;">
              {JSON.stringify(session, null, 2)}
            </pre>
            <p>
              <button
                on:click={() => handleRevokeSession(session.id)}
              >
                Delete Session
              </button>
            </p>
          </li>
        {/each}
      {:else}
        <li>Loading...</li>
      {/if}
    </ul>
  </div>
</div>

<style>
  .profile-container {
    display: flex;
    flex-direction: column;
    gap: 32px;
    align-items: center;
  }

  .card {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 16px;
    border: 1px solid #ccc;
    padding: 16px;
    border-radius: 8px;
  }

  pre {
    font-size: 0.875rem;
    overflow-x: auto;
  }
</style>
