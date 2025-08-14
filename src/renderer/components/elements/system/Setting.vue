<script setup lang="ts">
import {ref, watch} from 'vue';
import {ipcInvoke} from "../../../utils/publicType";

const natPort = ref(8080);
const logLevel = ref<string>('info');
watch(natPort, (newVal, oldVal) => {
  ipcInvoke('setConfig', '', newVal);
})

async function save(key: string, value: any) {
  await ipcInvoke("setConfig", key, value);
}
</script>

<template>
  <div>
    <el-form label-width="auto" style="max-width: 80%;">
      <el-form-item label="NAT端口">
        <el-input-number @change="save('port', natPort)" v-model="natPort" :max="2 ** 16 -1" :min="3000"/>
      </el-form-item>
      <el-form-item label="日志">
        <el-select @change="save('loglevel', logLevel)" v-model="logLevel">
          <el-option :value="'info'">{{ 'info' }}</el-option>
          <el-option :value="'debug'">{{ 'debug' }}</el-option>
        </el-select>
      </el-form-item>
    </el-form>

  </div>
</template>

<style scoped>

</style>