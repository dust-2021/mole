<script setup lang="ts">

import {Connection, Loading} from "@element-plus/icons-vue";
import {useRouter} from 'vue-router'
import {server, wsResp, getErrMsg} from "../../../utils/publicType";
import {onBeforeMount, onBeforeUnmount, PropType, ref} from 'vue';
import {ElMessage} from "element-plus";
import {login} from '../../../utils/api/http/user'
import {auth, ping as pingApi} from '../../../utils/api/ws/base'
import {Connection as wsConn} from "../../../utils/conn";
import {Services} from '../../../utils/stores'
import { wgInfo } from "../../../utils/api/http/server";

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

const conn = wsConn.getInstance(props.serverName);
// 0 未连接 1 连接中 2 已连接
const connected = ref<number>(0);
const ping = ref<number>(0);
let pingTaskId: NodeJS.Timeout | null = null;

// 开启或关闭ws连接
async function activeCon() {
  if (connected.value === 2) {
    // 清除定时任务
    if (pingTaskId) {
      clearInterval(pingTaskId);
      pingTaskId = null;
    };
    conn.close();
    connected.value = 0;
  } else {
    connected.value = 1;
    // 连接失败
    if (!(await conn.active(()=> {
      if(pingTaskId) clearInterval(pingTaskId);
      connected.value = 0;
    }))) {
      connected.value = 0;
      ElMessage({
        type: 'error',
        message: '连接服务器失败'
      })
      return;
    }
    
    await auth(props.serverName,  (resp) => {
      if (resp.statusCode !== 0) {
        conn.close();
        connected.value = 0;
        ElMessage({
          type: 'error',
          message: getErrMsg(resp.statusCode),
        })
      } else {
        pingTask();
        connected.value = 2;
      }
    });
  }
}

function pingCallback(resp: wsResp) {
  const startTime = resp.data as number;
  const now = Date.now();
  ping.value = now - startTime;
}

// 订阅服务器时间事件
function pingTask() {
  pingTaskId = setInterval(async () => {
    await pingApi(props.serverName, pingCallback);
  }, 5000);
}

onBeforeMount(async () => {
  const user = props.curServer.defaultUser;
  if (!user) return;
  const resp = await login(props.serverName, user.username, user.password);
  if (resp === null) return;
  const svr = Services().get(props.serverName);
  if(!svr || !resp.data) return;
  svr.token = resp.data;
  svr.wgInfo = (await wgInfo(props.serverName)).data;
});

onBeforeUnmount(() => {
    // 清除定时任务
    if (pingTaskId) {
      clearInterval(pingTaskId);
      pingTaskId = null;
    };
    conn.close();
})

</script>

<template>
  <el-row class="hover-box">
    <el-col :span="16">
      <div class="container" style="padding-left: 5%;padding-right: 5%" @click="router.push(`/server/page/${serverName}`);">
        <el-text :truncated="true" type="primary">
          {{ serverName }}
        </el-text>
      </div>
    </el-col>
    <el-col :span="8">
      <div class="container">
        <el-button :class="{'connected-box': connected === 2, 'disconnected-box': connected !== 2}"
                   @click="activeCon()" v-if="curServer.defaultUser" :disabled="connected === 1"
                   style="width: 80%"
        >
          <el-icon :size="16" v-if="connected === 0">
            <Connection></Connection>
          </el-icon>
          <el-icon :size="16" class="is-loading" v-else-if="connected === 1">
            <Loading></Loading>
          </el-icon>
          <el-text :type="ping > 100 ? 'warning': 'info'" :truncated="true" v-else>{{ ping }}</el-text>
        </el-button>
      </div>
    </el-col>
  </el-row>
</template>

<style scoped>
.hover-box {
  height: 40px;
  cursor: pointer;
  transition: background-color 0.3s;
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

.container {
  justify-items: center;
  align-content: center;
  height: 100%;
}
</style>