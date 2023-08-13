<script lang="ts" setup>
import { Auth } from "@scute/ui-vue";
import { useScuteClient } from "@scute/vue";

const scute = useScuteClient();
</script>

<template>
  <Auth :scute-client="scute" />
</template>
