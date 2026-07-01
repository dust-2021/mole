<template>
  <div class="room-view">
    <div class="room-header">
      <el-button text @click="doExitRoom">
        <el-icon><ArrowLeft /></el-icon>退出房间
      </el-button>
      <div class="room-actions">
        <el-button
          :type="curRoom?.forbidden.value ? 'success' : 'warning'"
          size="small"
          :loading="toggling"
          @click="toggleForbidden"
        >
          {{ curRoom?.forbidden.value ? '开启' : '关闭' }}房间
        </el-button>
        <el-button size="small" @click="copyLink">
          <el-icon><Link /></el-icon>复制链接
        </el-button>
      </div>
    </div>

    <div class="room-body">
      <!-- 成员面板 -->
      <aside class="member-panel">
        <div class="panel-title">成员 ({{ memberCount }})</div>
        <div v-if="mounted" class="member-list">
          <div
            v-for="[id, m] in memberList"
            :key="id"
            class="member-item"
          >
            <el-popover
              placement="right"
              :width="140"
              trigger="click"
            >
              <template #reference>
                <div
                  class="member-avatar"
                  :class="{
                    'direct-connecting': m.directFlag === 0,
                    'direct-ok': m.directFlag === 1,
                    'direct-fail': m.directFlag === 2,
                  }"
                >{{ m.name.charAt(0).toUpperCase() }}</div>
              </template>
              <div class="member-menu">
                <div
                  v-if="isOwner && m.uuid !== curRoom.selfUuid"
                  class="menu-item"
                  @click="kickMemberAction(m)"
                >
                  <el-icon><Remove /></el-icon>
                  <span>踢出房间</span>
                </div>
                <div
                  v-if="m.uuid !== curRoom.selfUuid"
                  class="menu-item"
                  @click="addBlacklistAction(m)"
                >
                  <el-icon><CircleClose /></el-icon>
                  <span>加入黑名单</span>
                </div>
              </div>
            </el-popover>
            <div class="member-info">
              <span class="member-name">{{ m.name }}</span>
              <span class="member-ip">{{ m.wgIp }}</span>
            </div>
            <el-tag v-if="m.owner" size="small" type="warning">房主</el-tag>
            <el-tag v-else-if="m.uuid === curRoom.selfUuid" size="small" type="info">我</el-tag>
          </div>
        </div>
      </aside>

      <!-- 聊天区 -->
      <div class="chat-area">
        <div class="message-list" ref="messageListRef" @scroll="onScroll">
          <template v-if="mounted">
            <div v-for="(msg, i) in curRoom.messages.value" :key="i">
              <div v-if="!msg.fromUuid" class="system-msg">
                <span>{{ msg.text }}</span>
                <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
              </div>
              <div v-else class="chat-msg" :class="{ self: msg.fromUuid === curRoom.selfUuid }">
                <div class="msg-bubble">
                  <div v-if="msg.fromUuid !== curRoom.selfUuid" class="msg-sender">{{ msg.fromUsername }}</div>
                  <div class="msg-text">{{ msg.text }}</div>
                </div>
                <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
              </div>
            </div>
          </template>
          <div v-if="showUnread" class="unread-badge" @click="scrollToBottom">
            {{ unreadCount }} 条新消息 ↓
          </div>
        </div>

        <div class="chat-input">
          <el-input
            v-model="inputText"
            type="textarea"
            :rows="2"
            placeholder="输入消息，Enter 发送"
            resize="none"
            @keyup.enter.exact="sendMessage"
          />
          <el-button type="primary" :disabled="!inputText.trim()" @click="sendMessage">
            发送
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount, onBeforeUnmount, onMounted, nextTick, inject } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Link, Remove, CircleClose } from '@element-plus/icons-vue'
import { roomer, Room, member } from '../utils/roomController'
import { roomMessage, roomForbidden, roomLink, kickMember } from '../utils/api/ws/room'
import { addBlacklist } from '../utils/api/http/user'
import { wsResp } from '../utils/publicType'

const props = defineProps<{ serverName: string; roomId: string }>()
const router = useRouter()
const route = useRoute()

// 房间标题（来自 query 参数）
const roomTitle = computed(() => (route.query.title as string) || props.roomId.slice(0, 8))

// 从 MainLayout 注入的房间管理函数
const exitRoom = inject<(roomId: string) => void>('exitRoom', () => {})

const mounted = ref(false)
const inputText = ref('')
const messageListRef = ref<HTMLElement | null>(null)
const showUnread = ref(false)
const unreadCount = ref(0)
const scrollBottom = ref(true)
const toggling = ref(false)

// 和原组件一致：用普通变量保存 Room 实例，避免 ref 嵌套解包问题
let curRoom: Room
let exited = false

const memberCount = computed(() => curRoom?.members.value.size ?? 0)
const memberList = computed((): [string, member][] => {
  if (!curRoom) return []
  return Array.from(curRoom.members.value.entries())
})
const isOwner = computed(() => {
  if (!curRoom) return false
  return curRoom.members.value.get(curRoom.selfUuid)?.owner ?? false
})

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function onScroll() {
  const el = messageListRef.value
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
  const el = messageListRef.value
  if (el) el.scrollTop = el.scrollHeight
  scrollBottom.value = true
  showUnread.value = false
  unreadCount.value = 0
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || !curRoom) return

  await roomMessage(props.serverName, props.roomId, text, async (r: wsResp) => {
    if (r.statusCode !== 0) {
      ElMessage.error('发送失败: ' + r.data)
      return
    }
    await curRoom.addMsg([{
      fromUuid: curRoom.selfUuid,
      text,
      timestamp: Date.now(),
      fromUsername: '',
    }])
  })
  inputText.value = ''
}

async function toggleForbidden() {
  if (!curRoom || toggling.value) return
  toggling.value = true
  const newVal = !curRoom.forbidden.value
  await roomForbidden(props.serverName, props.roomId, newVal, (r: wsResp) => {
    toggling.value = false
    if (r.statusCode !== 0) {
      ElMessage.error('操作失败: ' + r.data)
    }
    // forbidden 由服务器推送 publish.room.notice.forbidden → changeForbidden 统一更新
  })
}

function copyLink() {
  if (!curRoom) return
  if (curRoom.link) {
    navigator.clipboard.writeText(curRoom.link).then(() => {
      ElMessage.success('已复制房间链接')
    })
    return
  }
  roomLink(props.serverName, props.roomId, (r: wsResp) => {
    if (r.statusCode !== 0) {
      ElMessage.error('获取链接失败: ' + r.data)
      return
    }
    curRoom.link = r.data as string
    navigator.clipboard.writeText(curRoom.link).then(() => {
      ElMessage.success('已复制房间链接')
    })
  })
}

// 踢出成员
function kickMemberAction(m: member) {
  if (!curRoom || !isOwner.value) return
  kickMember(props.serverName, props.roomId, m.uuid, (r: wsResp) => {
    if (r.statusCode !== 0) {
      ElMessage.error('踢出失败: ' + r.data)
    } else {
      ElMessage.success(`已踢出 ${m.name}`)
    }
  })
}

// 加入黑名单（占位）
function addBlacklistAction(m: member) {
  ElMessage.info('黑名单功能待实现')
  // TODO: await addBlacklist(props.serverName, m.uuid)
}

// 退出房间（通知 MainLayout 清理）
async function doExitRoom() {
  if (exited) return
  exited = true
  exitRoom(props.roomId)
}

onBeforeMount(async () => {
  const room = await roomer.getRoom(props.roomId)
  if (!room) {
    ElMessage.info('打开房间失败')
    router.push(`/main/${props.serverName}/rooms`)
    return
  }
  curRoom = room
  room.onClose = () => {
    ElMessage.info('房间已关闭')
    doExitRoom()
  }

  await curRoom.setMsgCallback(async () => {
    await nextTick()
    const el = messageListRef.value
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
  mounted.value = true
})

onMounted(async () => {
  await nextTick()
  scrollToBottom()
})

onBeforeUnmount(async () => {
  // 组件销毁时不做任何清理（切换页面会销毁重建，房间数据在 roomer 中持久保存）
  // 只有显式"退出房间"或"服务器关闭房间"才清理
})
</script>

<style scoped>
.room-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.room-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 12px;
}

.room-id {
  font-weight: 500;
  flex: 1;
}

.room-actions {
  display: flex;
  gap: 8px;
}

.room-body {
  display: flex;
  flex: 1;
  gap: 16px;
  overflow: hidden;
}

/* 成员面板 */
.member-panel {
  width: 200px;
  background: var(--bg-primary);
  border-radius: var(--radius-base);
  padding: 12px;
  box-shadow: var(--shadow-light);
  overflow-y: auto;
  flex-shrink: 0;
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color-light);
}

.member-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: var(--radius-small);
}

.member-item:hover {
  background: var(--bg-secondary);
}

.member-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-primary-light);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  border: 2px solid transparent;
  transition: border-color var(--transition-fast);
}

/* 直连状态 - 头像边框 */
.member-avatar.direct-connecting {
  border-color: var(--color-success);
  animation: direct-pulse 1.5s ease-in-out infinite;
}

.member-avatar.direct-ok {
  border-color: var(--color-success);
}

.member-avatar.direct-fail {
  border-color: var(--color-danger);
}

@keyframes direct-pulse {
  0%, 100% { border-color: var(--color-success); }
  50% { border-color: transparent; }
}

.member-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.member-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-ip {
  font-size: 11px;
  color: var(--text-secondary);
}

/* 成员操作菜单 */
.member-menu {
  display: flex;
  flex-direction: column;
  padding: 4px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  border-radius: 4px;
  transition: background var(--transition-fast);
}

.menu-item:hover {
  background: var(--bg-secondary);
}

.menu-item .el-icon {
  color: var(--text-secondary);
}

.menu-item:hover .el-icon {
  color: var(--color-primary);
}

/* 聊天区 */
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border-radius: var(--radius-base);
  box-shadow: var(--shadow-light);
  overflow: hidden;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  position: relative;
}

.system-msg {
  text-align: center;
  font-size: 12px;
  color: var(--text-placeholder);
  padding: 6px 0;
  user-select: text;
}

.chat-msg {
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
  align-items: flex-start;
}

.chat-msg.self {
  align-items: flex-end;
}

.msg-bubble {
  max-width: 60%;
  padding: 8px 14px;
  border-radius: 12px;
  background: var(--bg-tertiary);
  word-break: break-word;
  user-select: text;
}

.chat-msg.self .msg-bubble {
  background: var(--color-primary);
  color: #fff;
}

.msg-sender {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.msg-text {
  font-size: 14px;
  line-height: 1.5;
}

.msg-time {
  font-size: 11px;
  color: var(--text-placeholder);
  margin-top: 2px;
}

.unread-badge {
  position: sticky;
  bottom: 8px;
  text-align: center;
  background: var(--color-primary);
  color: #fff;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 12px;
  cursor: pointer;
  width: fit-content;
  margin: 0 auto;
}

.chat-input {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color-light);
}

.chat-input .el-textarea {
  flex: 1;
}
</style>
