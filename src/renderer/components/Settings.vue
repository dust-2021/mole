<template>
  <div class="settings-page">
    <div class="page-header">
      <h2>系统设置</h2>
    </div>

    <div class="form-card">
      <el-form label-width="120px" label-position="left" style="max-width: 480px;">
        <el-form-item label="WireGuard 端口">
          <el-input-number
            v-model="wgPort"
            :min="3000"
            :max="65535"
            @change="save('wgPort', wgPort)"
          />
        </el-form-item>
        <el-form-item label="UDP 端口">
          <el-input-number
            v-model="udpPort"
            :min="3000"
            :max="65535"
            @change="save('udpPort', udpPort)"
          />
        </el-form-item>
        <el-form-item label="日志级别">
          <el-select v-model="logLevel" @change="save('loglevel', logLevel)" style="width: 160px;">
            <el-option label="Info" value="info" />
            <el-option label="Debug" value="debug" />
          </el-select>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeMount } from 'vue'
import { ElMessage } from 'element-plus'
import { getConfig, setConfig } from '../utils/publicType'

const wgPort = ref(0)
const udpPort = ref(0)
const logLevel = ref('info')

async function save(key: string, value: any) {
  if (wgPort.value === udpPort.value && wgPort.value !== 0) {
    ElMessage.warning('WG端口和UDP端口不能相同')
    return
  }
  await setConfig(key, value)
  ElMessage.success('设置已保存，请重启应用生效')
}

onBeforeMount(async () => {
  wgPort.value = await getConfig('wgPort')
  udpPort.value = await getConfig('udpPort')
  logLevel.value = await getConfig('loglevel') || 'info'
})
</script>

<style scoped>
.settings-page {
  max-width: 640px;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h2 {
  font-size: 20px;
  font-weight: 600;
}

.form-card {
  background: var(--bg-primary);
  border-radius: var(--radius-base);
  padding: 24px;
  box-shadow: var(--shadow-light);
}
</style>
