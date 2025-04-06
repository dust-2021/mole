<template>
  <div style="margin: 5% 10%">
    <el-button size="large" style="width:100%; border: 0">
      <span style="width: 30%;height: 100%; margin-right: 20%"><svg width="24px" height="24px">
        <use :href="`#icon-${icon}`"/>
      </svg></span>
      <span v-if="label" style="width: 70%;text-align: center; margin-left: 20%">{{ label }}</span>

    </el-button>
  </div>
</template>
<script setup lang="ts">

const props = defineProps({
  icon: {
    type: String,
    required: true
  },
  label: {
    type: String
  }
})
</script>

<style scoped>
</style>