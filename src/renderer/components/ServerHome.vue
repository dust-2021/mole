<template>
  <div class="server-home">
    <!-- 紧凑状态卡片 -->
    <div class="stats-card">
      <div class="stat-item">
        <span class="stat-value">{{ connectInfo.wsConnected }}</span>
        <span class="stat-label">在线</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ connectInfo.wgPeers }}</span>
        <span class="stat-label">Peers</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ connectInfo.rooms }}</span>
        <span class="stat-label">房间</span>
      </div>
      <div class="stat-item">
        <span class="stat-value" :class="{ 'ping-warn': ping > 100 }">{{ ping }}<span class="stat-unit">ms</span></span>
        <span class="stat-label">延迟</span>
      </div>
    </div>

    <!-- Tab 切换区 -->
    <el-tabs v-model="activeTab" class="home-tabs">
      <!-- 大厅聊天 -->
      <el-tab-pane label="大厅" name="hall">
        <div class="chat-panel">
          <!-- 订阅开关 -->
          <div class="hall-header">
            <el-button
              :type="hallEnabled ? 'success' : 'info'"
              size="small"
              @click="toggleHall"
            >
              {{ hallEnabled ? '已订阅' : '已关闭' }}
            </el-button>
            <span class="hall-hint">{{ hallEnabled ? '正在接收大厅消息' : '订阅已关闭，点击开启' }}</span>
          </div>

          <!-- 消息列表 -->
          <div class="chat-messages" ref="chatListRef" @scroll="onScroll">
            <template v-if="mounted">
              <div v-for="(msg, idx) in messages" :key="idx">
                <!-- 系统消息 -->
                <div v-if="!msg.senderUuid" class="system-msg">
                  <span>{{ msg.text }}</span>
                  <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
                </div>
                <!-- 聊天消息 -->
                <div v-else class="chat-msg" :class="{ self: msg.senderUuid === selfUuid }">
                  <div class="msg-bubble">
                    <div v-if="msg.senderUuid !== selfUuid" class="msg-sender">{{ msg.senderName }}</div>
                    <div class="msg-text">{{ msg.text }}</div>
                  </div>
                  <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
                </div>
              </div>
            </template>
            <div v-if="messages.length === 0" class="chat-empty">暂无消息</div>
            <div v-if="showUnread" class="unread-badge" @click="scrollToBottom">
              {{ unreadCount }} 条新消息 ↓
            </div>
          </div>

          <!-- 输入框 -->
          <div class="chat-input">
            <el-input
              v-model="inputText"
              placeholder="输入消息，Enter 发送..."
              :disabled="!hallEnabled || sending"
              @keyup.enter.exact="sendHallMsg"
            >
              <template #append>
                <el-button @click="sendHallMsg" :disabled="!hallEnabled || sending || !inputText.trim()">发送</el-button>
              </template>
            </el-input>
          </div>
        </div>
      </el-tab-pane>

      <!-- 管理（仅 admin 可见） -->
      <el-tab-pane v-if="isAdmin" label="管理" name="admin">
        <div class="admin-section">
          <div class="section-card">
            <h3 class="section-title">管理功能</h3>

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
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount, onBeforeUnmount, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, DocumentCopy } from '@element-plus/icons-vue'
import { connectingInfo } from '../utils/api/http/server'
import { createUsers } from '../utils/api/http/user'
import { setPublicRegister } from '../utils/api/http/admin'
import { Services, HallStore } from '../utils/stores'
import { getErrMsg, wsResp } from '../utils/publicType'
import { ping as pingApi } from '../utils/api/ws/base'
import { subscribe, unsubscribe, broadcast } from '../utils/api/ws/channel'

const props = defineProps<{ serverName: string }>()

enum ShowType {
  nothing = '',
  newUsers = 'newUsers',
}

const svrStore = Services()
const hallStore = HallStore()

const connectInfo = ref({ wsConnected: 0, wgPeers: 0, rooms: 0 })
const newUsers = ref<{ username: string; password: string }[]>([])
const showInfo = ref<string>(ShowType.nothing)
const ping = ref(0)
let pingTaskId: ReturnType<typeof setInterval> | null = null

// 自己的 uuid
const selfUuid = computed(() => {
  const svr = svrStore.get(props.serverName)
  return svr?.token?.userUuid ?? ''
})

// 大厅聊天（从 Pinia 读取，页面切换状态保留）
const activeTab = ref('hall')
const mounted = ref(false)
const inputText = ref('')
const sending = ref(false)
const chatListRef = ref<HTMLElement | null>(null)
const showUnread = ref(false)
const unreadCount = ref(0)
const scrollBottom = ref(true)

const MAX_MSG = 100

// 直接从 Pinia store 读取
const messages = computed(() => hallStore.getState(props.serverName).messages)
const hallEnabled = computed(() => hallStore.isSubscribed(props.serverName))

// 检查 admin 权限
const isAdmin = computed(() => {
  const svr = svrStore.get(props.serverName)
  return svr?.token?.permission?.includes('admin') ?? false
})

onBeforeMount(async () => {
  await fetchConnectInfo()
  startPing()
  // 不再自动订阅——由用户点击按钮手动开启
})

onMounted(async () => {
  mounted.value = true
  await nextTick()
  scrollToBottom()
})

onBeforeUnmount(() => {
  // 只清理 ping，不取消订阅、不清消息
  if (pingTaskId) {
    clearInterval(pingTaskId)
    pingTaskId = null
  }
})

// 开启/关闭大厅订阅
async function toggleHall() {
  if (hallEnabled.value) {
    unsubscribe(props.serverName, 'hall')
    hallStore.setSubscribed(props.serverName, false)
  } else {
    await subscribe(props.serverName, 'hall', handleHallMsg)
    hallStore.setSubscribed(props.serverName, true)
  }
}

function handleHallMsg(r: wsResp) {
  hallStore.addMsg(props.serverName, {
    senderUuid: r.data?.senderUuid ?? '',
    senderName: r.data?.senderName ?? '',
    text: r.data?.data ?? r.data?.text ?? '',
    timestamp: r.data?.timestamp ?? Date.now(),
  })
  // 滚动处理（参照 RoomView）
  nextTick(() => {
    const el = chatListRef.value
    if (!el) return
    if (scrollBottom.value) {
      el.scrollTop = el.scrollHeight
      showUnread.value = false
      unreadCount.value = 0
    } else {
      unreadCount.value++
      showUnread.value = true
    }
  })
}

// 发送消息 #sym:broadcast
async function sendHallMsg() {
  const text = inputText.value.trim()
  if (!text || sending.value || !hallEnabled.value) return
  sending.value = true
  try {
    await broadcast(props.serverName, 'hall', text)
    hallStore.addMsg(props.serverName, {
      senderUuid: selfUuid.value,
      senderName: '',
      text,
      timestamp: Date.now(),
    })
    inputText.value = ''
    scrollBottom.value = true
    nextTick(() => {
      if (chatListRef.value) {
        chatListRef.value.scrollTop = chatListRef.value.scrollHeight
      }
      showUnread.value = false
      unreadCount.value = 0
    })
  } catch {
    ElMessage.error('发送失败')
  } finally {
    sending.value = false
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function onScroll() {
  const el = chatListRef.value
  if (!el) return
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 40
  scrollBottom.value = atBottom
  if (atBottom) {
    showUnread.value = false
    unreadCount.value = 0
  }
}

async function scrollToBottom() {
  await nextTick()
  const el = chatListRef.value
  if (el) el.scrollTop = el.scrollHeight
  scrollBottom.value = true
  showUnread.value = false
  unreadCount.value = 0
}

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

/* 紧凑状态卡片 */
.stats-card {
  display: flex;
  align-items: center;
  background: var(--bg-primary);
  border-radius: var(--radius-base);
  padding: 12px 0;
  box-shadow: var(--shadow-light);
  margin-bottom: 16px;
}

.stat-item {
  flex: 1;
  text-align: center;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: 4px;
}

.stat-unit {
  font-size: 12px;
  font-weight: 400;
  margin-left: 2px;
}

.ping-warn {
  color: var(--color-warning) !important;
}

/* Tab */
.home-tabs {
  background: var(--bg-primary);
  border-radius: var(--radius-base);
  padding: 0 16px 16px;
  box-shadow: var(--shadow-light);
}

/* 聊天面板 */
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 380px;
}

.hall-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0 10px;
}

.hall-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-small);
  margin-bottom: 10px;
}

/* 系统消息 */
.system-msg {
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 3px 0;
}
.system-msg .msg-time {
  margin-left: 8px;
  font-family: monospace;
}

/* 聊天消息（参照 RoomView） */
.chat-msg {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-bottom: 8px;
}
.chat-msg.self {
  flex-direction: row-reverse;
}

.msg-bubble {
  max-width: 70%;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--bg-secondary, #f0f0f0);
}
.chat-msg.self .msg-bubble {
  background: var(--color-primary);
  color: #fff;
}

.msg-sender {
  font-size: 11px;
  color: var(--color-primary);
  margin-bottom: 2px;
}
.chat-msg.self .msg-sender {
  color: rgba(255, 255, 255, 0.7);
}

.msg-text {
  font-size: 13px;
  word-break: break-all;
  white-space: pre-wrap;
}

.msg-time {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
  font-family: monospace;
}

.chat-empty {
  text-align: center;
  color: var(--text-secondary);
  padding-top: 60px;
  font-size: 13px;
}

.unread-badge {
  text-align: center;
  color: var(--color-primary);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 0;
  user-select: none;
}

.chat-input {
  flex-shrink: 0;
}

/* 管理区域 */
.admin-section {
  margin-top: 0;
}

.section-card {
  background: var(--bg-primary);
  border-radius: var(--radius-base);
  padding: 20px;
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
