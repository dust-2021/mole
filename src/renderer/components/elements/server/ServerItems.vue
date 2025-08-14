<script setup lang="ts">
import {useRouter} from "vue-router";
import {Services} from '../../../utils/stores'
import ServerBand from "../server/ServerBand.vue";
import {Plus, CirclePlus} from '@element-plus/icons-vue'

const svr = Services();
const router = useRouter();


async function newServer(): Promise<void> {
  await router.push('/server/add')
}
</script>

<template>
  <div style="height: 100%">
    <div style="border-bottom: 1px #eee solid; display: flex; align-items: center; justify-content: center;">
      <el-button @click="newServer" class="btn">
        <el-icon :size="18">
          <CirclePlus></CirclePlus>
        </el-icon>
        <span style="text-align: center;font-size: small;align-content: center">添加服务器</span>
      </el-button>
    </div>

    <div style="height: 85%">
      <el-scrollbar :always="false" max-height="100%">
        <ServerBand v-for="item in svr.all" :server-name="item[0]" :cur-server="item[1]">
        </ServerBand>
      </el-scrollbar>
    </div>
  </div>

</template>

<style scoped>
.btn {
  height: 36px;
  margin: 5px 5px 5px 10px;
  border-radius: 5px;
}
</style>