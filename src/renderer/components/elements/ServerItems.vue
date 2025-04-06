<script setup lang="ts">
import {Connection} from '@element-plus/icons-vue'
import {onBeforeMount, ref} from "vue";
import {useRouter} from "vue-router";
import {Services, server, request, user} from '../../utils/ipcTypes'
import {ElMessage} from 'element-plus'

let services = ref<Map<string, server>>(null);
let token = ref<Map<string, string>>();

async function init(): Promise<void> {
  services.value = await Services.all();
  token.value = new Map<string, string>();
}

const router = useRouter();

function serverDetails(name: string): void {
  router.push(`/server/${name}`);
}

async function login(serviceName: string, user?: user): Promise<void> {
  if (token.value.get(serviceName)) {
    token.value.delete(serviceName);
    return;
  }
  if (!user){
    user = services.value.get(serviceName).defaultUser;
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
    token.value.set(serviceName, resp.data);
  }
}

onBeforeMount(init);
</script>

<template>
  <div style="height: 100%">
    <div style="height: 5%;">
      <h5 style="height: 100%;text-align: center;margin: 0;align-items: center; border-bottom: 1px solid #eeeeee;user-select: none;cursor: default;">
        服务器</h5>
    </div>
    <div style="height: 95%">
      <el-scrollbar :always="false" max-height="80%">
        <el-row v-for="(item, index) in services" :index="index" class="hover-box">
          <el-col :span="16">

            <el-popover
                trigger="hover"
                :title="item[0]"
                placement="right"
                :content="item[1].host + ':' + item[1].port"
            >
              <template #reference>
                <el-button style="width: 80%" @click="serverDetails(item[0])">
                  {{ item[0].length <= 5 ? item[0] : item[0].substring(0, 5) + '...' }}
                </el-button>
              </template>
            </el-popover>
          </el-col>
          <el-col :span="8">
            <el-button :color="token.get(item[0])? `blue`: `white`"
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