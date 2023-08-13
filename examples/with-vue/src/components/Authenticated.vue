<script lang="ts" setup>
import { useAuth } from "@scute/vue";

const { session, user, signOut } = useAuth();
</script>

<template>
  <div style="margin: 1rem">
    {{ session.status }}
    <pre style="font-size: 12px">
       {{ JSON.stringify({ user, session }, null, 4) }}
      </pre
    >
    <button @click="() => signOut()">Sign Out</button>
  </div>
</template>
