<template>
  <div class="rooms-page">
    <div class="page-header">
      <h2>房间列表</h2>
      <div class="header-actions">
        <el-button @click="getRoomInfo" :loading="freshing">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button @click="enterRoomByLink">
          <el-icon><Link /></el-icon>链接加入
        </el-button>
        <el-button type="primary" @click="router.push(`/main/${serverName}/room/create`)">
          <el-icon><Plus /></el-icon>创建房间
        </el-button>
      </div>
    </div>

    <div class="section-card">
      <div class="toolbar">
        <el-input
          v-model="search"
          placeholder="搜索房间..."
          :prefix-icon="Search"
          clearable
          style="width: 260px;"
        />
      </div>

      <el-table
        :data="filteredRooms"
        v-loading="freshing"
        stripe
        style="width: 100%;"
        empty-text="暂无房间"
      >
        <el-table-column prop="roomTitle" label="标题" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="room-link" @click="enterRoom(row)">{{ row.roomTitle || '未命名' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="160" show-overflow-tooltip />
        <el-table-column prop="ownerName" label="房主" width="100" />
        <el-table-column label="成员" width="90">
          <template #default="{ row }">
            <el-tag :type="row.memberCount < row.memberMax ? 'primary' : 'danger'" size="small">
              {{ row.memberCount }}/{{ row.memberMax }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="密码" width="70" align="center">
          <template #default="{ row }">
            <el-icon v-if="row.withPassword"><Lock /></el-icon>
            <el-icon v-else><Unlock /></el-icon>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.forbidden" type="danger" size="small">关闭</el-tag>
            <el-tag v-else type="success" size="small">开放</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link :disabled="row.forbidden" @click="enterRoom(row)">
              加入
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrap" v-if="total > 0">
        <el-pagination
          v-model:current-page="curPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          :total="total"
          layout="total, sizes, prev, pager, next"
          background
          small
          @current-change="pageChange"
          @size-change="sizeChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Lock, Unlock, Refresh, Search, Link } from '@element-plus/icons-vue'
import { roomList, roomInfo } from '../utils/api/http/server'
import { roomIn } from '../utils/api/ws/room'
import { Services } from '../utils/stores'
import { roomer, member } from '../utils/roomController'
import { Connection } from '../utils/conn'
import { wsResp, getErrMsg } from '../utils/publicType'

const props = defineProps<{ serverName: string }>()
const router = useRouter()

// 分页 & 数据
const freshing = ref(false)
const rooms = ref<roomInfo[]>([])
const total = ref(0)
const curPage = ref(1)
const pageSize = ref(10)
const search = ref('')

const filteredRooms = computed(() => {
  if (!search.value) return rooms.value
  const q = search.value.toLowerCase()
  return rooms.value.filter(r =>
    r.roomTitle.toLowerCase().includes(q) ||
    r.description.toLowerCase().includes(q) ||
    r.ownerName.toLowerCase().includes(q)
  )
})

onBeforeMount(async () => {
  await getRoomInfo()
})

async function getRoomInfo() {
  freshing.value = true
  const resp = await roomList(props.serverName, curPage.value, pageSize.value)
  if (resp.code !== 0) {
    ElMessage.error(getErrMsg(resp.code))
    freshing.value = false
    return
  }
  rooms.value = resp.data.rooms
  total.value = resp.data.total
  ElMessage.success(`获取到 ${resp.data.total} 个房间`)
  freshing.value = false
}

async function pageChange(v: number) {
  curPage.value = v
  await getRoomInfo()
}

async function sizeChange(v: number) {
  pageSize.value = v
  curPage.value = 1
  await getRoomInfo()
}

// 通过链接进入房间
async function enterRoomByLink() {
  try {
    const { value } = await ElMessageBox.prompt('请输入房间链接', '链接加入', {
      confirmButtonText: '加入',
      inputPattern: /.+/,
      inputErrorMessage: '请输入有效链接',
    })
    if (!value) return
    await doEnterRoom(value.trim(), value.trim(), undefined)
  } catch {
    // 取消
  }
}

// 通用进入房间逻辑
async function doEnterRoom(roomId: string, title: string, password?: string) {
  // 已打开则直接跳转
  const existing = await roomer.getRoom(roomId)
  if (existing) {
    router.push(`/main/${props.serverName}/room/${roomId}?title=${encodeURIComponent(title)}`)
    return
  }

  await roomIn(props.serverName, roomId, password, async (resp: wsResp) => {
    if (resp.statusCode !== 0) {
      ElMessage.error(`进入房间失败: ${resp.data}`)
      return
    }
    const mates: member[] = resp.data
    const svr = Services().get(props.serverName)
    let selfVlan = 0
    for (const m of mates) {
      if (m.uuid === svr?.token?.userUuid) selfVlan = m.vlan
    }
    if (selfVlan === 0) {
      ElMessage.error('获取虚拟网络IP失败')
      return
    }
    const roomInst = await roomer.createRoom(
      Connection.getInstance(props.serverName),
      roomId, props.serverName, selfVlan, ''
    )
    if (!roomInst) {
      ElMessage.error('创建局域网失败')
      return
    }
    await roomInst.addMembers(mates)
    router.push(`/main/${props.serverName}/room/${roomId}?title=${encodeURIComponent(title)}`)
  })
}

async function enterRoom(room: roomInfo) {
  if (room.forbidden) return
  let password: string | undefined
  if (room.withPassword) {
    try {
      password = await new Promise<string | undefined>((resolve) => {
        ElMessageBox.prompt('请输入房间密码', '密码验证', {
          inputType: 'password',
        }).then(({ value }) => resolve(value || undefined)).catch(() => resolve(undefined))
      })
      if (!password) return
    } catch { return }
  }
  await doEnterRoom(room.roomId, room.roomTitle || room.roomId, password)
}
</script>

<style scoped>
.rooms-page {
  max-width: 960px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header h2 {
  font-size: 20px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.section-card {
  background: var(--bg-primary);
  border-radius: var(--radius-base);
  padding: 20px;
  box-shadow: var(--shadow-light);
}

.toolbar {
  margin-bottom: 12px;
}

.room-link {
  color: var(--color-primary);
  cursor: pointer;
  font-weight: 500;
}

.room-link:hover {
  text-decoration: underline;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color-light);
}
</style>
