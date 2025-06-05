<script setup lang="ts">
import {onBeforeMount, ref, computed} from "vue";
import {ipcOn, ipcOnce, request, server, wsRequest, wsResp} from "../../../utils/ipcTypes";
import {Connection, Lock, Unlock, Refresh, CircleCloseFilled} from "@element-plus/icons-vue"
import {Services} from "../../../utils/stores";
import {ElMessage, ElMessageBox} from "element-plus";
import {v4 as uuid} from 'uuid';
import {useRouter} from 'vue-router';

const props = defineProps(
    {
      serverName: {
        type: String,
        required: true
      }
    }
)

interface Room {
  roomId: string,
  roomTitle: string,
  description: string,
  ownerId: number,
  ownerName: string,
  memberCount: number,
  memberMax: number,
  withPassword: boolean,
  forbidden: boolean
}

interface response {
  total: number;
  rooms: Room[];
}

const mounted = ref(false);
let info = ref<response>({total: 0, rooms: []});
const services = Services();
const svr = ref<server>(null);
const router = useRouter();

async function getRoomInfo(): Promise<void> {
  if (svr.value.token === null || svr.value.token === undefined || svr.value.token === "") {
    ElMessage({
      showClose: true,
      type: "warning",
      message: "请登录获取令牌"
    })
    return
  }
  const data = await request({serverName: props.serverName, apiName: "roomList"})
  if (!data.success && data.statusCode !== 0) {
    return;
  }
  info.value = data.data;
}

const searchWords = ref("");
const filterRooms = computed(() => {
  return info.value.rooms.filter((room: Room) => {
    return !searchWords.value || room.roomTitle.includes(searchWords.value)
        || room.ownerName.includes(searchWords.value) || room.description.includes(searchWords.value);
  })
})


onBeforeMount(() => {
  svr.value = services.get(props.serverName);
  getRoomInfo();
  mounted.value = true;
});

function inputPassword(roomId: string): void {
  ElMessageBox.prompt("输入房间密码", "", {
    confirmButtonText: "OK", cancelButtonText: "取消",
    inputPattern: /\w{2,12}/,
    inputErrorMessage: "格式错误"
  }).then(({value}) => {
    const key = uuid().toString();
    wsRequest({serverName: props.serverName, apiName: "room.in", uuid: key, args: [roomId, value]});
    const handle = setTimeout(()=> {}, 2000);
    ipcOnce(key, (resp: wsResp) => {
      clearTimeout(handle);
      if (resp.statusCode !== 0) {
        ElMessage({
          showClose: true,
          message: "连接房间失败",
          type: "warning",
        } as any)
        return
      }
      router.push(`/room/${props.serverName}/${roomId}`)
    })
  })
}

</script>

<template>
  <div style="height: 90%">
  <el-table :data="filterRooms" style="width: 100%" v-if="mounted" :empty-text="svr.token?`未找到房间`: `未登录`">
    <el-table-column prop="roomTitle" label="标题" width="100" show-overflow-tooltip></el-table-column>
    <el-table-column prop="description" label="房间描述" show-overflow-tooltip></el-table-column>
    <el-table-column prop="ownerName" label="创建人" width="100" show-overflow-tooltip></el-table-column>
    <el-table-column label="成员" width="80">
      <template #default="scope">
        <el-tag :type="scope.row.memberCount < scope.row.memberMax?'primary': 'danger'" size="small">
          {{ `${scope.row.memberCount}/${scope.row.memberMax}` }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column label="" width="100">
      <template #default="scope">
        <el-row :gutter="24">
          <el-col :span="12">
            <el-icon>
              <Lock v-if="scope.row.withPassword"></Lock>
              <Unlock v-else></Unlock>
            </el-icon>
          </el-col>
          <el-col :span="12">
            <el-icon>
              <CircleCloseFilled v-if="scope.row.withPassword"></CircleCloseFilled>
            </el-icon>
          </el-col>
        </el-row>

      </template>
    </el-table-column>
    <el-table-column align="right" width="180">
      <template #header>
        <el-row :gutter="24">
          <el-col :span="6">
            <el-button @click="getRoomInfo" size="small">
              <el-icon>
                <Refresh></Refresh>
              </el-icon>
            </el-button>
          </el-col>
          <el-col :span="18">
            <el-input v-model="searchWords" placeholder="查找" size="small"></el-input>
          </el-col>
        </el-row>
      </template>
      <template #default="scope">
        <el-button size="small" :disabled="scope.row.forbidden || scope.row.memberCount === scope.row.memberMax" @click="inputPassword(scope.row.roomId)">
          <el-icon>
            <Connection></Connection>
          </el-icon>
          <span style="text-align: center">
            加入
          </span>
        </el-button>
      </template>
    </el-table-column>
  </el-table></div>
  <el-footer height="10%">
    <el-pagination :size="'small'" background layout="prev, pager, next" :total="info.total"></el-pagination>
  </el-footer>
</template>

<style scoped>

</style>