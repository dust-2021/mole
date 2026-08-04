<template>
  <div class="main-layout">
    <!-- 标题栏 -->
    <header class="titlebar titlebar-drag">
      <div class="titlebar-left">
        <svg width="20" height="15">
          <use href="#icon-mole" />
        </svg>
        <span class="titlebar-title">Mole - {{ serverName }}</span>
      </div>
      <div class="titlebar-actions titlebar-no-drag">
        <el-button class="win-btn" @click="minimize" :icon="Minus" text />
        <el-button class="win-btn win-btn-close" @click="shutdown" :icon="Close" text />
      </div>
    </header>

    <div class="layout-body">
      <!-- 左侧导航栏 -->
      <aside class="sidebar">
        <!-- 固定导航 -->
        <div class="sidebar-nav">
          <div
            v-for="item in fixedNavItems"
            :key="item.path"
            class="nav-item"
            :class="{ active: isActive(item.path) }"
            @click="navigate(item.path)"
          >
            <el-icon :size="18"><component :is="item.icon" /></el-icon>
            <span class="nav-label">{{ item.label }}</span>
          </div>
        </div>

        <!-- 已打开的房间 -->
        <div class="sidebar-rooms" v-if="openRooms.length > 0">
          <div class="sidebar-divider">
            <span>已打开房间</span>
          </div>
          <div
            v-for="room in openRooms"
            :key="room.roomId"
            class="nav-item room-nav-item"
            :class="{ active: isRoomActive(room.roomId) }"
            @click="navigate(`/main/${serverName}/room/${room.roomId}`)"
          >
            <el-icon :size="16"><ChatDotRound /></el-icon>
            <span class="nav-label">{{ room.label }}</span>
            <el-icon :size="14" class="room-close-icon" @click.stop="exitRoom(room.roomId)">
              <Close />
            </el-icon>
          </div>
        </div>

        <!-- 底部 -->
        <div class="sidebar-footer">
          <div class="nav-item" @click="logout">
            <el-icon :size="18"><SwitchButton /></el-icon>
            <span class="nav-label">退出登录</span>
          </div>
        </div>
      </aside>

      <!-- 主内容区 -->
      <main class="content">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, provide } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Minus, Close, SwitchButton, HomeFilled, ChatDotRound, Setting } from '@element-plus/icons-vue'
import { ipcSend } from '../utils/publicType'
import { saveStore, HallStore } from '../utils/stores'
import { Connection } from '../utils/conn'
import { roomer } from '../utils/roomController'
import { roomOut } from '../utils/api/ws/room'

const props = defineProps<{ serverName: string }>()

const router = useRouter()
const route = useRoute()

const fixedNavItems = [
  { path: `/main/${props.serverName}/home`, label: '首页', icon: HomeFilled },
  { path: `/main/${props.serverName}/rooms`, label: '房间列表', icon: ChatDotRound },
  { path: `/main/${props.serverName}/settings`, label: '设置', icon: Setting },
]

// 已打开的房间列表
interface OpenRoom {
  roomId: string
  label: string
}
const openRooms = ref<OpenRoom[]>([])

function isActive(path: string): boolean {
  return route.path === path || (path.includes('/home') && route.path === `/main/${props.serverName}`)
}

function isRoomActive(roomId: string): boolean {
  return route.path.includes(`/room/${roomId}`)
}

function navigate(path: string) {
  router.push(path)
}

// 添加房间到导航栏
function addRoom(roomId: string, label: string) {
  if (!openRooms.value.find(r => r.roomId === roomId)) {
    openRooms.value.push({ roomId, label: label || roomId.slice(0, 8) })
  }
}

// 退出房间（从导航栏移除 + 清理 + 导航到房间列表）
async function exitRoom(roomId: string) {
  openRooms.value = openRooms.value.filter(r => r.roomId !== roomId)
  await roomOut(props.serverName, roomId)
  await roomer.deleteRoom(roomId)
  if (isRoomActive(roomId)) {
    router.push(`/main/${props.serverName}/rooms`)
  }
}

// 提供给子组件
provide('addRoom', addRoom)
provide('exitRoom', exitRoom)

// 监听路由变化，自动将进入的房间加入导航栏
watch(() => route.params.roomId, (roomId) => {
  if (roomId && typeof roomId === 'string') {
    const title = (route.query.title as string) || roomId.slice(0, 8)
    addRoom(roomId, title)
  }
})

function minimize() {
  ipcSend('main-min')
}

function shutdown() {
  saveStore()
  ipcSend('main-close')
}

function logout() {
  for (const r of openRooms.value) {
    roomOut(props.serverName, r.roomId)
    roomer.deleteRoom(r.roomId)
  }
  openRooms.value = []
  // 清空大厅聊天状态
  const hallStore = HallStore()
  delete hallStore.states[props.serverName]
  Connection.getInstance(props.serverName).close()
  router.push('/')
}
</script>

<style scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-secondary);
}

/* 标题栏 */
.titlebar {
  height: var(--titlebar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.titlebar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.titlebar-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.titlebar-actions {
  display: flex;
  gap: 2px;
}

.win-btn {
  width: 32px;
  height: 28px;
  border-radius: 4px;
  color: var(--text-secondary);
}

.win-btn:hover {
  background: var(--bg-tertiary);
}

.win-btn-close:hover {
  background: var(--color-danger) !important;
  color: #fff !important;
}

/* 主体 */
.layout-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 侧边导航栏 */
.sidebar {
  width: var(--sidebar-width);
  background: var(--bg-primary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex-shrink: 0;
}

.sidebar-nav {
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-footer {
  padding: 8px;
  border-top: 1px solid var(--border-color-light);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-small);
  cursor: pointer;
  transition: all var(--transition-fast);
  color: var(--text-regular);
  font-size: 14px;
}

.nav-item:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.nav-item.active {
  background: rgba(64, 158, 255, 0.1);
  color: var(--color-primary);
  font-weight: 500;
}

.nav-label {
  white-space: nowrap;
}

/* 房间导航区 */
.sidebar-rooms {
  padding: 8px;
  flex: 1;
  overflow-y: auto;
}

.sidebar-divider {
  padding: 8px 12px 4px;
  font-size: 11px;
  color: var(--text-placeholder);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.room-nav-item {
  justify-content: flex-start;
}

.room-nav-item .nav-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.room-close-icon {
  opacity: 0;
  transition: opacity var(--transition-fast);
  flex-shrink: 0;
}

.room-nav-item:hover .room-close-icon {
  opacity: 1;
}

.room-close-icon:hover {
  color: var(--color-danger);
}

/* 内容区 */
.content {
  flex: 1;
  overflow: auto;
  padding: var(--content-padding);
  background: var(--bg-secondary);
}
</style>
