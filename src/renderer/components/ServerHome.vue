<template>
  <div class="server-home">
    <!-- 合并状态卡片 -->
    <div class="stats-card">
      <div class="stat-item">
        <div class="stat-value">{{ connectInfo.wsConnected }}</div>
        <div class="stat-label">在线连接</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <div class="stat-value">{{ connectInfo.wgPeers }}</div>
        <div class="stat-label">WG Peers</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <div class="stat-value">{{ connectInfo.rooms }}</div>
        <div class="stat-label">活跃房间</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <div class="stat-value" :class="{ 'ping-warn': ping > 100 }">{{ ping }}<span class="stat-unit">ms</span></div>
        <div class="stat-label">延迟</div>
      </div>
    </div>

    <!-- 管理员功能区 -->
    <div v-if="isAdmin" class="admin-section">
      <div class="section-card">
        <h3 class="section-title">管理</h3>

        <div class="admin-actions">
          <el-button type="primary" @click="createUsersF">
            <el-icon><Plus /></el-icon>生成账号
          </el-button>
          <el-button type="success" @click="setPublicRegisterF(true)">
            开启注册
          </el-button>
          <el-button type="danger" @click="setPublicRegisterF(false)">
            关闭注册
          </el-button>
        </div>

        <!-- 生成的账号表格 -->
        <div v-if="showInfo === 'newUsers'" class="new-users-table">
          <el-table :data="newUsers" stripe size="small" empty-text="暂无数据">
            <el-table-column prop="username" label="用户名" />
            <el-table-column prop="password" label="密码" />
            <el-table-column label="操作" width="80">
              <template #default="{ row }">
                <el-button link type="primary" @click="copyAccount(row.username, row.password)">
                  <el-icon><DocumentCopy /></el-icon>
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, DocumentCopy } from '@element-plus/icons-vue'
import { connectingInfo } from '../utils/api/http/server'
import { createUsers } from '../utils/api/http/user'
import { setPublicRegister } from '../utils/api/http/admin'
import { Services } from '../utils/stores'
import { getErrMsg, wsResp } from '../utils/publicType'
import { ping as pingApi } from '../utils/api/ws/base'

const props = defineProps<{ serverName: string }>()

enum ShowType {
  nothing = '',
  newUsers = 'newUsers',
}

const svrStore = Services()
const connectInfo = ref({ wsConnected: 0, wgPeers: 0, rooms: 0 })
const newUsers = ref<{ username: string; password: string }[]>([])
const showInfo = ref<string>(ShowType.nothing)
const ping = ref(0)
let pingTaskId: ReturnType<typeof setInterval> | null = null

// 检查 admin 权限
const isAdmin = computed(() => {
  const svr = svrStore.get(props.serverName)
  return svr?.token?.permission?.includes('admin') ?? false
})

onBeforeMount(async () => {
  await fetchConnectInfo()
  startPing()
})

onBeforeUnmount(() => {
  if (pingTaskId) {
    clearInterval(pingTaskId)
    pingTaskId = null
  }
})

async function fetchConnectInfo() {
  const info = await connectingInfo(props.serverName)
  if (info.serverTime !== 0) {
    connectInfo.value = info
  }
}

function pingCallback(resp: wsResp) {
  const startTime = resp.data as number
  ping.value = Date.now() - startTime
}

function startPing() {
  pingTaskId = setInterval(() => {
    pingApi(props.serverName, pingCallback)
  }, 5000)
}

// ===== 管理员功能 =====
async function createUsersF() {
  ElMessageBox.prompt('请输入要生成的账号数量', '生成账号', {
    confirmButtonText: '生成',
    cancelButtonText: '取消',
    inputPattern: /^[1-9]\d*$/,
    inputErrorMessage: '请输入一个正整数',
  }).then(async ({ value }) => {
    const count = parseInt(value)
    if (count > 20) {
      // 大批量导出为 CSV 文件
      try {
        const folder = await (window as any).electron.invoke('select-folder')
        if (!folder) {
          ElMessage.info('已取消')
          return
        }
        const resp = await createUsers(props.serverName, count)
        if (resp.code !== 0) {
          ElMessage.error(getErrMsg(resp.code))
          return
        }
        const lines = ['用户名,密码', ...resp.data.map((u: any) => `${u.username},${u.password}`)]
        const csv = lines.join('\r\n')
        const filename = `users_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
        const ok = await (window as any).electron.invoke('save-file', folder, filename, csv)
        if (!ok) {
          ElMessage.error('导出失败')
          return
        }
        ElMessage.success(`已导出到 ${folder}\\${filename}`)
        return
      } catch {
        ElMessage.error('导出失败')
        return
      }
    }

    const resp = await createUsers(props.serverName, count)
    if (resp.code !== 0) {
      ElMessage.error(getErrMsg(resp.code))
      return
    }
    newUsers.value = resp.data
    showInfo.value = ShowType.newUsers
  }).catch(() => {
    ElMessage.info('已取消')
  })
}

async function setPublicRegisterF(to: boolean) {
  const resp = await setPublicRegister(props.serverName, to)
  if (!resp) {
    ElMessage.error('设置失败')
    return
  }
  ElMessage.success('设置完成')
}

async function copyAccount(name: string, password: string) {
  await navigator.clipboard.writeText(`用户名：${name} 密码：${password}`)
  ElMessage.success('已复制账号信息')
}
</script>

<style scoped>
.server-home {
  max-width: 720px;
}

/* 合并状态卡片 */
.stats-card {
  display: flex;
  align-items: center;
  background: var(--bg-primary);
  border-radius: var(--radius-base);
  padding: 24px 0;
  box-shadow: var(--shadow-light);
  margin-bottom: 24px;
}

.stat-item {
  flex: 1;
  text-align: center;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-primary);
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.stat-divider {
  width: 1px;
  height: 40px;
  background: var(--border-color-light);
}

.stat-unit {
  font-size: 14px;
  font-weight: 400;
  margin-left: 2px;
}

.ping-warn {
  color: var(--color-warning) !important;
}

/* 管理区域 */
.admin-section {
  margin-top: 0;
}

.section-card {
  background: var(--bg-primary);
  border-radius: var(--radius-base);
  padding: 20px;
  box-shadow: var(--shadow-light);
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
}

.admin-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.new-users-table {
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-small);
  overflow: hidden;
}
</style>
