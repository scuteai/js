<script lang="ts" setup>
import { useAuth } from "@scute/vue";
import Login from "./Login.vue";
import Authenticated from "./Authenticated.vue";

const { isAuthenticated, isLoading } = useAuth();
</script>

<template>
  <span v-if="isLoading">Loading...</span>
  <Login v-else-if="!isAuthenticated" />
  <Authenticated v-else-if="isAuthenticated" />
</template>
