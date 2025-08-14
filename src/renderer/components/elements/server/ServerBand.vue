<script setup lang="ts">

import {Connection, Loading} from "@element-plus/icons-vue";
import {useRouter} from 'vue-router'
import {server, wsResp} from "../../../utils/publicType";
import {onBeforeMount, onBeforeUnmount, PropType, ref} from 'vue';
import {ElMessage} from "element-plus";
import {subscribe, unsubscribe} from "../../../utils/api/ws/channel";
import {login} from '../../../utils/api/http/user'
import {auth} from '../../../utils/api/ws/base'
import {Connection as wsConn} from "../../../utils/ws/conn";

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

// 开启或关闭ws连接
async function activeCon() {
  if (connected.value === 2) {
    await unsubscribe(props.serverName, 'time');
    conn.close();
    connected.value = 0;
  } else {
    connected.value = 1;
    // 连接失败
    if (!(await conn.active())){
      connected.value = 0;
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    pingTask();
    await auth(props.serverName);
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

// 订阅服务器时间事件
function pingTask() {
  subscribe(props.serverName, 'time', (resp: wsResp) => {
    if (resp.statusCode != 0) {
      ElMessage({
        type: 'warning',
        message: '校对服务器时间失败'
      })
      return
    }
    const data: {timestamp: number} = resp.data;
    ping.value = Date.now() - data.timestamp;
  })
}

onBeforeMount(() => {
  login(props.serverName, props.curServer.defaultUser?.username, props.curServer.defaultUser?.password).then();

});

onBeforeUnmount(() => {
  if (connected.value > 2) {
    unsubscribe(props.serverName, 'time').then(() => {
      conn.close();
    });
  }
})

</script>

<template>
  <el-row class="hover-box">
    <el-col :span="16">
      <el-button style="width: 80%" @click="router.push(`/server/page/${serverName}`);">
        {{ serverName.length <= 5 ? serverName : serverName.substring(0, 5) + '...' }}
      </el-button>
    </el-col>
    <el-col :span="8">
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