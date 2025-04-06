<script setup lang="ts">
import {ref, onBeforeMount} from "vue";
import {HttpResp, HttpReq, request} from '../../utils/ipcTypes'

const props = defineProps({
  name: {
    type: String,
    required: true,
  }
})
let status = ref(true);
let ping = ref(0);

async function checkHost(): Promise<void> {
  const req: HttpReq = {serverName: props.name, apiName: 'serverTime'};
  const resp: HttpResp = await request(req);
  status.value = resp.success && resp.statusCode === 0;
  ping.value = status.value ? Date.now() - resp.data : 0;
}

onBeforeMount(async () => {
  await checkHost();
});

</script>

<template>
  <div style="height: 100%">
    <el-tabs type="border-card" style="height: 100%;">
      <el-tab-pane label="首页">
        <el-empty :description="`无法连接到服务器`" v-if="!status"></el-empty>

        <div v-if="status">
          <el-header height="5%">
          <el-row>

          </el-row>
          </el-header>
          <el-scrollbar>

          </el-scrollbar>
        </div>
      </el-tab-pane>
      <el-tab-pane label="信息"></el-tab-pane>
      <el-tab-pane label="设置">
        <el-button type="danger">
          删除
        </el-button>
      </el-tab-pane>
    </el-tabs>

  </div>
</template>

<style scoped>

</style>