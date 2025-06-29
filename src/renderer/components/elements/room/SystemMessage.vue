<script setup lang="ts">


import {PropType} from "vue";

const props = defineProps({
  level: {
    type: String as PropType<'info' | 'danger' | 'warning'>,
    default: 'info',
  },
  message: {
    type: String,
    required: true,
  },
  time: {
    type: Number,
    required: true,
  }
})
</script>

<template>
  <div>
    <div class="center-item"><el-text size="small">{{(new Date(props.time)).toLocaleTimeString()}}</el-text></div>
    <div class="center-item"><el-tag :type="props.level">{{ props.message }}</el-tag></div>
  </div>
</template>

<style scoped>
.center-item {
  display: flex;
  align-items: center;justify-content: center
}
</style>