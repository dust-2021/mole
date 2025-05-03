<script setup lang="ts">
import {Connection, CirclePlusFilled, RemoveFilled} from '@element-plus/icons-vue'
import {useRouter} from "vue-router";
import { server, request, user} from '../../utils/ipcTypes'
import {Services} from '../../utils/stores'
import {ElMessage} from 'element-plus'


const svr = Services();
svr.init();

function deleteServer(serverName: string) {
  svr.delete(serverName);
}

const router = useRouter();

function serverDetails(name: string): void {
  router.push(`/server/${name}`);
}

async function login(serviceName: string, user?: user): Promise<void> {
  const s: server = svr.get(serviceName);
  if (s === undefined) {
    return ;
  }
  // token已存在则登出
  if (s.token) {
    s.token = "";
    await request({apiName: 'logout', serverName: serviceName})
    return;
  }
  if (!user) {
    user = s.defaultUser;
  }
  if (!user) {
    ElMessage({
      showClose: true,
      type: 'error',
      message: '未设置默认账户'
    })
    return
  }
  const resp = await request({apiName: 'login', serverName: serviceName, args: [user.username, user.password]});
  if (resp.success && resp.statusCode === 0) {
    s.token = resp.data;
  }
}
</script>

<template>
  <div style="height: 100%">
    <div style="height: 10%; border-bottom: 1px #eee solid;">
      <el-row style="height: 100%">
        <el-col :span="12" style="padding: 5% 10%;">
          <el-button style=" width: 80%">
            <el-icon style="height: 100%">
              <CirclePlusFilled></CirclePlusFilled>
            </el-icon>
          </el-button>
        </el-col>
        <el-col :span="12" style="padding: 5% 10%">
          <el-button style=" width: 80%">
            <el-icon style="height: 100%">
              <RemoveFilled></RemoveFilled>
            </el-icon>
          </el-button>
        </el-col>
      </el-row>
    </div>

    <div style="height: 85%">
      <el-scrollbar :always="false" max-height="100%">
        <el-row v-for="(item, index) in svr.all" :index="index" class="hover-box">
          <el-col :span="16">
                <el-button style="width: 80%" @click="serverDetails(item[0])">
                  {{ item[0].length <= 5 ? item[0] : item[0].substring(0, 5) + '...' }}
                </el-button>
          </el-col>
          <el-col :span="8">
            <el-button :color="item[1].token? `blue`: `white`"
                       style="border: 0" @click="login(item[0])" v-if="item[1].defaultUser">
              <el-icon :size="16">
                <Connection></Connection>
              </el-icon>
            </el-button>
          </el-col>
        </el-row>
      </el-scrollbar>
    </div>
  </div>

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