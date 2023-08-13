<script lang="ts" setup>
import { AuthContextProvider } from "@scute/vue";
import { scute } from "./scute";
import WithScuteUI from "./components/WithScuteUI.vue";
</script>

<template>
  <h1>Vue App</h1>
  <AuthContextProvider :scute-client="scute">
    <WithScuteUI />
  </AuthContextProvider>
</template>
