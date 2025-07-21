<script setup lang="ts">

import {Connection, Loading, Timer} from "@element-plus/icons-vue";
import {useRouter} from 'vue-router'
import {ipcOn, ipcRemove, request, server, wsRequest, wsResp} from "../../../utils/publicType";
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
const ping = ref<number>(0);

// 开启或关闭ws连接
async function activeCon(serverName: string) {
  if (connected.value === 2) {
    await window['electron'].invoke("wsClose", serverName);
    connected.value = 0;
    ipcRemove('publish.time', handlePingResp);
  } else {
    connected.value = 1;
    await window['electron'].invoke("wsActive", serverName);
    await new Promise(resolve => setTimeout(resolve, 500));
    pingTask();
    connected.value = 2;
  }
  // if (!flag) {
  //   ElMessage({
  //     type: "warning",
  //     message: "连接异常",
  //     showClose: true,
  //   })
  // }
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

// 处理订阅事件的函数
function handlePingResp(resp: wsResp) {
  const data: {timestamp: number} = resp.data;
  ping.value = Date.now() - data.timestamp;
}

// 订阅服务器时间事件
function pingTask() {
  wsRequest({serverName: props.serverName, apiName: 'channel.subscribe', args: ['time']}, 2000, (resp: wsResp) => {
    if (resp.statusCode != 0) {
      ElMessage({
        type: 'warning',
        message: '校对服务器时间失败'
      })
      return
    }
    ipcOn('publish.time', handlePingResp);
  })
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
      <el-button :class="{'connected-box': connected === 2, 'disconnected-box': connected !== 2}"
                  @click="activeCon(serverName)" v-if="curServer.defaultUser" :disabled="connected === 1"
                 style="width: 80%"
      >
        <el-icon :size="16" v-if="connected === 0">
          <Connection></Connection>
        </el-icon>
        <el-icon :size="16" class="is-loading" v-else-if="connected === 1">
          <Loading></Loading>
        </el-icon>
        <el-text :type="ping > 100 ? 'warning': 'info'" :truncated="true" v-else>{{ping}}</el-text>
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
.connected-box {
  border-color: lightgreen;
  background-color: white;
}
.disconnected-box {
  border: 0;
  background-color: lightgray;
}
</style>