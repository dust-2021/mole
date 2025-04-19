<script setup lang="ts">
import {ref, onBeforeMount, watch} from "vue";
import {useRouter} from 'vue-router'
import {HttpResp, HttpReq, request, Services, server} from '../../utils/ipcTypes'

const props = defineProps({
  name: {
    type: String,
    required: true,
  }
})
let isMounted = ref(false);
let status = ref(true);
let ping = ref(0);
let svr = ref<server>(null);

async function checkHost(): Promise<void> {
  const req: HttpReq = {serverName: props.name, apiName: 'serverTime'};
  const resp: HttpResp = await request(req);
  status.value = resp.success && resp.statusCode === 0;
  ping.value = status.value ? Date.now() - resp.data : 0;
}

onBeforeMount(async () => {
  await checkHost();
  svr.value = await Services.get(props.name);
  isMounted.value = true;
});

watch(() => props.name, (val) => {
  checkHost();
})

</script>

<template>
  <div style="height: 100%" v-show="isMounted">
    <el-empty :description="`无法连接到服务器`" v-if="!status"></el-empty>
    <el-tabs style="height: 100%; padding: 0 2%" v-else>
      <el-tab-pane label="首页">

      </el-tab-pane>
      <el-tab-pane label="信息">
        <el-descriptions :title="name" :column="3" border>
          <el-descriptions-item label="地址：">{{ svr.host }}</el-descriptions-item>
          <el-descriptions-item>

          </el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>
      <el-tab-pane label="设置">

      </el-tab-pane>
    </el-tabs>

  </div>
</template>

<style scoped>

</style>