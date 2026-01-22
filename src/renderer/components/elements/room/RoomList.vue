<script setup lang="ts">
import {onBeforeMount, ref, computed} from "vue";
import {getErrMsg, server, wsResp} from "../../../utils/publicType";
import {roomIn} from '../../../utils/api/ws/room'
import {roomList, roomInfo} from '../../../utils/api/http/server'
import { Lock, Unlock, Refresh, CircleCloseFilled} from "@element-plus/icons-vue"
import {Services} from "../../../utils/stores";
import {ElMessage, ElMessageBox} from "element-plus";
import {useRouter} from 'vue-router';
import { roomer } from "../../../utils/roomController";
import { Connection } from "../../../utils/conn";

const props = defineProps(
    {
      serverName: {
        type: String,
        required: true
      }
    }
)

const mounted = ref(false);
let info = ref<{ total: number, rooms: roomInfo[] }>({total: 0, rooms: []});
const pageSize = ref<number>(10);
const curPage = ref<number>(1);
const services = Services();
const svr = ref<server>({
  host: "", port: 0, certify: false, users: []
});
const router = useRouter();

async function getRoomInfo(): Promise<void> {
  const resp = await roomList(props.serverName, curPage.value, pageSize.value);
  if (resp.code !== 0) {
    ElMessage({
      type: "error",
      message: getErrMsg(resp.code)
    })
    return;
  }
  info.value = resp.data;
  ElMessage({
    type: "success",
    message: `获取到${resp.data.total}个房间信息`
  })
}

async function pageChange(v: number): Promise<void> {
  curPage.value = v;
  await getRoomInfo();
}

async function sizeChange(v: number): Promise<void> {
  pageSize.value = v;
  curPage.value = 1;
  await getRoomInfo();
}

const searchWords = ref("");
const filterRooms = computed(() => {
  return info.value.rooms.filter((room: roomInfo) => {
    return !searchWords.value || room.roomTitle.includes(searchWords.value)
        || room.ownerName.includes(searchWords.value) || room.description.includes(searchWords.value);
  })
})


onBeforeMount(() => {
  const s = services.get(props.serverName);
  if (!s) return;
  svr.value = s;
  getRoomInfo();
  mounted.value = true;
});

function inputPassword(roomId: string): void {
  ElMessageBox.prompt("输入房间密码", "", {
    confirmButtonText: "OK", cancelButtonText: "取消",
    inputType: 'password',
    inputPattern: /\w+/,
    inputErrorMessage: "格式错误"
  }).then(async ({value}) => {
    await roomIn(props.serverName, roomId, value.length === 0 ? undefined : value, async (resp: wsResp) => {
      if (resp.statusCode !== 0) {
        ElMessage({
          showClose: true,
          message: `连接房间失败：${resp.statusCode}-${resp.data}`,
          type: "warning",
        } as any)
        return
      };
      const mates: { id: number, name: string, uuid: string, owner: boolean, addr: string, vlan: number, publicKey: string }[] = resp.data;
      let self_vlan = 0;
      for (const m of mates) {
          if (m.uuid === svr.value.token?.userUuid) self_vlan = m.vlan;
      };
      if (self_vlan === 0) {
        ElMessage({
          type: "error", message: "获取虚拟网络IP失败"
        })
        return
      }
      const  room = await roomer.createRoom(Connection.getInstance(props.serverName), roomId, props.serverName, self_vlan);
      if (!room) {
        ElMessage({
          showClose: true, message: "初始化房间失败", type: "error"
        })
        return;
      }
      room.addMember(mates.map((m) => {return {userId: m.id, userUuid: m.uuid, username: m.name, addr: m.addr, vlan: m.vlan, owner: m.owner, publicKey: m.publicKey}}))
      router.push(`/server/room/page/${props.serverName}/${roomId}`)
    })
  })
}

</script>

<template>
  <div style="height: 90%">
    <el-table :data="filterRooms" style="width: 100%" v-if="mounted" :empty-text="svr.token?`未找到房间`: `未登录`"
    :max-height="500" highlight-current-row>
      <el-table-column prop="roomTitle" label="标题" width="100" show-overflow-tooltip></el-table-column>
      <el-table-column prop="description" label="房间描述" show-overflow-tooltip></el-table-column>
      <el-table-column prop="ownerName" label="创建人" width="100" show-overflow-tooltip></el-table-column>
      <el-table-column label="成员" width="80">
        <template #default="scope">
          <el-tag :type="(scope.row.memberCount < scope.row.memberMax)?'primary': 'danger'" size="small">
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
                <CircleCloseFilled v-if="scope.row.forbidden"></CircleCloseFilled>
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
          <el-button size="small" :disabled="scope.row.forbidden || scope.row.memberCount === scope.row.memberMax"
                     @click="inputPassword(scope.row.roomId)">
            <el-icon>
              <Connection></Connection>
            </el-icon>
            <span style="text-align: center">
            加入
          </span>
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
  <el-footer height="10%" style="justify-items: right;">
    <el-row :gutter="24" style="width: 100%">
      <el-col :span="4">
        <el-button @click="$router.push(`/server/room/create/${props.serverName}`)" :type="'primary'">创建</el-button>
      </el-col>
      <el-col :span="4"></el-col>
      <el-col :span="16">
        <el-pagination :size="'small'" background layout="prev, pager, next, jumper, sizes" :total="info.total"
                       @current-change="pageChange" :current-page="curPage" :page-size="pageSize"
                       @size-change="sizeChange" :page-sizes="[10, 20, 50, 100]"
        ></el-pagination>
      </el-col>
    </el-row>

  </el-footer>
</template>

<style scoped>

</style>