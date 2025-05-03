<script setup lang="ts">
import {onBeforeMount, ref, computed} from "vue";
import {request} from "../../utils/ipcTypes";
import {Connection, Lock, Unlock, Refresh} from "@element-plus/icons-vue"

const props = defineProps(
    {
      serverName: {
        type: String,
        required: true
      }
    }
)

interface Room {
  roomId: number,
  roomTitle: string,
  description: string,
  ownerId: number,
  ownerName: string,
  memberCount: number,
  memberMax: number,
  withPassword: boolean,
  forbidden: boolean
}

const mounted = ref(false);
let rooms = ref<Room[]>([]);

async function getRoomInfo(): Promise<void> {
  const data = await request({serverName: props.serverName, apiName: "roomList"})
  if (!data.success && data.statusCode !== 0) {
    return;
  }
  rooms.value = data.data;
}

const searchWords = ref("");
const filterRooms = computed(() => {
  return rooms.value.filter((room: Room) => {
    return !searchWords.value || room.roomTitle.includes(searchWords.value)
        || room.ownerName.includes(searchWords.value) || room.description.includes(searchWords.value);
  })
})


onBeforeMount(() => {
  getRoomInfo();
  mounted.value = true;
});

</script>

<template>
  <el-table :data="filterRooms" style="width: 100%" v-if="mounted" empty-text="未找到房间">
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
    <el-table-column label="" width="40">
      <template #default="scope">
        <el-icon>
          <Lock v-if="scope.row.withPassword"></Lock>
          <Unlock v-else></Unlock>
        </el-icon>
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
        <el-button size="small" :disabled="scope.row.forbidden || scope.row.memberCount === scope.row.memberMax">
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
</template>

<style scoped>

</style>