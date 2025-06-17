<script setup lang="ts">

const props = defineProps({
  message: {
    type: String,
    required: true,
  },
  system: {
    type: Boolean,
    default: false,
  },
  self: {
    type: Boolean,
    default: false,
  }
})
</script>

<template>

</template>

<style scoped>

</style>