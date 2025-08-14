<template>
    <el-button :size="props.btnSize" style="width:100%; border: 0">
      <div class="center-style">
        <span><svg :width="`${props.size}px`" :height="`${props.size}px`">
        <use :href="`#icon-${icon}`"/>
      </svg></span>
      </div>
      <div class="center-style" v-if="label"><span style="text-align: center">{{ label }}</span></div>
    </el-button>
</template>
<script setup lang="ts">

import {PropType} from "vue";

const props = defineProps({
  icon: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    default: 24,
  },
  label: {
    type: String
  },
  btnSize: {
    type: String as PropType<'small' | 'medium' | 'large'>,
    default: 'medium',
  }
})
</script>

<style scoped>
.center-style {
  margin: 0 auto;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>