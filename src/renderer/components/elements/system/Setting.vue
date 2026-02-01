<script setup lang="ts">
import {ref, onBeforeMount} from 'vue';
import {getConfig, setConfig} from "../../../utils/publicType";
import { ElFormItem, ElMessage } from 'element-plus';

const wgPort = ref(0);
const udpPort = ref(0);
const loglevel = ref<string>('');

async function save(key: string, value: any) {
  if (wgPort.value === udpPort.value) {
    ElMessage({
      type: 'warning',
      message: 'WG端口和NAT端口不能相同',
    })
    return;
  }
  await setConfig(key, value);
  ElMessage({
    type: 'success',
    message: '保存成功，请立即重启app',
  });
}

onBeforeMount(async () => {
  wgPort.value = await getConfig('wgPort');
  udpPort.value = await getConfig('udpPort');
  loglevel.value = await getConfig('loglevel');
});
</script>

<template>
  <div style="padding: 10px">
    <el-form label-width="auto" style="max-width: 80%;">
      <el-form-item label="WG端口">
        <el-input-number @change="save('wgPort', wgPort)" v-model="wgPort" :max="2 ** 16 -1" :min="3000" style="width: 200px;"/>
      </el-form-item>
      <el-form-item label="UDP端口">
        <el-input-number @change="save('port', udpPort)" v-model="udpPort" :max="2 ** 16 -1" :min="3000" style="width: 200px;"/>
      </el-form-item>
      <el-form-item label="日志">
        <el-select @change="save('loglevel', loglevel)" v-model="loglevel" style="width: 200px;">
          <el-option :value="'info'">{{ 'info' }}</el-option>
          <el-option :value="'debug'">{{ 'debug' }}</el-option>
        </el-select>
      </el-form-item>
    </el-form>

  </div>
</template>

<style scoped>

</style>