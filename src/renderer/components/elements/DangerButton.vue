<template>
  <el-button type="danger" @click="open">{{ props.boxText }}</el-button>
</template>

<script lang="ts" setup>
import {ElMessageBox} from 'element-plus'

const emit = defineEmits(['success', 'cancel']);

const props = defineProps({
  message: {
    type: String,
    required: true,
  },
  boxText: {
    type: String,
    required: true,
  }
})

const open = () => {
  ElMessageBox.confirm(
      props.message,
      '',
      {
        confirmButtonText: "确认",
        cancelButtonText: "取消",
        type: 'warning',
      }
  )
      .then(() => {
        emit('success')
      })
      .catch(() => {
        emit('cancel')
      })
}
</script>
