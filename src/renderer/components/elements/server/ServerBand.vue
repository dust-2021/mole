<script setup lang="ts">

import {Connection, Loading} from "@element-plus/icons-vue";
import {useRouter} from 'vue-router'
import {request, server} from "../../../utils/ipcTypes";
import {onBeforeMount, onBeforeUnmount, PropType, ref} from 'vue';
import {ElMessage} from "element-plus";

const router = useRouter()
const props = defineProps({
  serverName: {
    type: String,
    required: true,
  },
  curServer: {
    type: Object as PropType<server>,
    required: true,
  }
})

// 0 未连接 1 连接中 2 已连接
const connected = ref<number>(0);

async function activeCon(serverName: string) {
  connected.value = 1;
  let flag: boolean;
  if (connected.value === 2) {
    flag = await window['electron'].invoke("wsClose", serverName);
    connected.value = 0;
  } else {
    flag = await window['electron'].invoke("wsActive", serverName);
    connected.value = flag === true ? 2 : 0;
  }
  if (!flag) {
    ElMessage({
      type: "warning",
      message: "连接异常",
      showClose: true,
    })
  }
}

async function login(s: server, logout: boolean = false): Promise<void> {
  if (!s.defaultUser) {
    return
  }
  const resp = await request({
    apiName: logout ? 'logout' : 'login',
    serverName: props.serverName,
    args: [s.defaultUser.username, s.defaultUser.password]
  });
  if (!logout && resp.success && resp.statusCode === 0) {
    s.token = resp.data;
  }
}

onBeforeMount(() => {
  login(props.curServer)
});

onBeforeUnmount(() => {
  if (connected.value === 2) {
    activeCon(props.serverName)
  }
  // login(props.curServer, true)
})

</script>

<template>
  <el-row class="hover-box">
    <el-col :span="16">
      <el-button style="width: 80%" @click="router.push(`/server/${serverName}`);">
        {{ serverName.length <= 5 ? serverName : serverName.substring(0, 5) + '...' }}
      </el-button>
    </el-col>
    <el-col :span="8">
      <el-button :color="connected ? `blue`: `lightgray`"
                 style="border: 0" @click="activeCon(serverName)" v-if="curServer.defaultUser" :disabled="connected === 1">
        <el-icon :size="16" v-if="connected !== 1">
          <Connection></Connection>
        </el-icon>
        <el-icon :size="16" class="is-loading" v-else>
          <Loading></Loading>
        </el-icon>
      </el-button>
    </el-col>
  </el-row>
</template>

<style scoped>
.hover-box {
  text-align: center;
  cursor: pointer;
  transition: background-color 0.3s;
  padding: 5px;
  border-bottom: 1px #eee solid;
}

.hover-box:hover {
  background-color: #eee;
}
</style>