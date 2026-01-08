<script setup lang="ts">
import {ref, watch} from 'vue'
import {Services} from "../../../utils/stores";

const svr = Services();
const props = defineProps({
  serverName: {
    type: String,
    required: true,
  }
})

</script>

<template>
  <div>
    <el-aside style="width: 30%">
      <el-scrollbar>
        <el-row>
          <el-button>添加用户</el-button>
        </el-row>
      </el-scrollbar>
    </el-aside>

  </div>

</template>

<style scoped>

</style>