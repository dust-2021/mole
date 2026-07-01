<template>
  <svg :width="size" :height="size" class="app-icon" :class="{ clickable: !!$attrs.onClick }">
    <use :href="`#icon-${name}`" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  name: string
  size?: number | string
}>(), {
  size: 24
})
</script>

<style scoped>
.app-icon {
  flex-shrink: 0;
  vertical-align: middle;
}
.clickable {
  cursor: pointer;
}
</style>
