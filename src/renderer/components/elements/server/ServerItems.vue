<script setup lang="ts">
import {useRouter} from "vue-router";
import {Services} from '../../../utils/stores'
import ServerBand from "../server/ServerBand.vue";

const svr = Services();
const router = useRouter();


async function newServer(): Promise<void> {
  await router.push('/addServer')
}
</script>

<template>
  <div style="height: 100%">
    <div style="height: 10%; border-bottom: 1px #eee solid;">
      <el-button type="primary" @click="newServer">
        新建
      </el-button>
      <el-button @click="router.push('/room/default/111')">test2</el-button>
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

</style>