<template>
  <div class="login-container">
    <!-- 顶部标题栏（可拖拽） -->
    <div class="login-titlebar titlebar-drag">
      <div class="titlebar-brand">
        <svg width="16" height="12">
          <use href="#icon-mole" />
        </svg>
        <span>Mole</span>
      </div>
      <el-button class="titlebar-close titlebar-no-drag" @click="closeApp" text>
        <el-icon :size="16"><Close /></el-icon>
      </el-button>
    </div>

    <div class="login-body">
      <!-- 左侧品牌区 -->
      <div class="login-brand">
        <div class="brand-logo">
          <svg width="64" height="48">
            <use href="#icon-mole" />
          </svg>
        </div>
        <h1 class="brand-title">Mole</h1>
        <p class="brand-desc">NAT 穿透组网工具</p>
      </div>

      <!-- 右侧操作区 -->
      <div class="login-main">
        <div class="login-card">
          <!-- 步骤1: 选择服务器 -->
          <div class="section">
            <div class="section-header">
              <h3>选择服务器</h3>
              <el-button type="primary" link @click="showAddServer = true">
                <el-icon><Plus /></el-icon>添加
              </el-button>
            </div>

          <div v-if="serverList.length === 0" class="empty-hint">
            <p>暂无服务器，请添加一个</p>
          </div>

          <div class="server-list" v-else>
            <div
              v-for="[name, svr] in serverList"
              :key="name"
              class="server-item"
              :class="{ active: selectedServer === name }"
              @click="selectServer(name)"
            >
              <div class="server-item-main">
                <span class="server-name">{{ name }}</span>
                <span class="server-url">{{ svr.host }}:{{ svr.port }}</span>
              </div>
              <div class="server-item-actions">
                <el-button link type="primary" @click.stop="editServer(name)">
                  <el-icon><Edit /></el-icon>
                </el-button>
                <el-popconfirm title="确定删除该服务器？" @confirm="deleteServer(name)">
                  <template #reference>
                    <el-button link type="danger" @click.stop>
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </div>
        </div>

        <!-- 步骤2: 选择账号 / 点击直接登录 -->
        <div class="section" v-if="selectedServer">
          <div class="section-header">
            <h3>选择账号</h3>
            <div class="section-header-actions">
              <el-button type="primary" link @click="openRegister">
                <el-icon><UserFilled /></el-icon>注册
              </el-button>
              <el-button type="primary" link @click="openAddUser">
                <el-icon><Plus /></el-icon>新增
              </el-button>
            </div>
          </div>

          <div v-if="currentUsers.length === 0" class="empty-hint">
            <p>该服务器没有已保存的账号，请新增</p>
          </div>

          <div class="user-list" v-else>
            <div
              v-for="user in currentUsers"
              :key="user.username"
              class="user-item"
              @click="loginWithUser(user)"
            >
              <el-icon :size="18"><User /></el-icon>
              <span class="user-name">{{ user.username }}</span>
              <div class="user-item-actions">
                <el-button link type="primary" @click.stop="openEditUser(user)">
                  <el-icon><Edit /></el-icon>
                </el-button>
                <el-popconfirm
                  :title="`确定删除账号「${user.username}」？`"
                  @confirm="deleteUser(user)"
                >
                  <template #reference>
                    <el-button link type="danger" @click.stop>
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加/编辑服务器对话框 -->
    <el-dialog
      v-model="showAddServer"
      :title="editingServer ? '编辑服务器' : '添加服务器'"
      width="480px"
      destroy-on-close
    >
      <el-form :model="serverForm" label-width="80px" label-position="left">
        <el-form-item label="服务器名称" required>
          <el-input v-model="serverForm.name" placeholder="如：我的服务器" />
        </el-form-item>
        <el-form-item label="主机地址" required>
          <el-input v-model="serverForm.host" placeholder="如：192.168.1.100" />
        </el-form-item>
        <el-form-item label="端口" required>
          <el-input-number v-model="serverForm.port" :min="1" :max="65535" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="HTTPS">
          <el-switch v-model="serverForm.certify" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddServer = false">取消</el-button>
        <el-button type="primary" @click="saveServer">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新增/编辑账号对话框（先验证登录再保存） -->
    <el-dialog
      v-model="showUserDialog"
      :title="editingUser ? '编辑账号' : '新增账号'"
      width="420px"
      destroy-on-close
      @closed="resetUserDialog"
    >
      <el-form :model="userForm" label-width="80px" label-position="left">
        <el-form-item label="用户名" required>
          <el-input
            v-model="userForm.username"
            placeholder="输入用户名"
            :disabled="!!editingUser"
          />
        </el-form-item>
        <el-form-item label="密码" required>
          <el-input
            v-model="userForm.password"
            type="password"
            show-password
            placeholder="输入密码"
            @keyup.enter="submitUser"
          />
        </el-form-item>
        <el-form-item v-if="!editingUser" label="确认密码" required>
          <el-input
            v-model="userForm.confirmPassword"
            type="password"
            show-password
            placeholder="再次输入密码"
            @keyup.enter="submitUser"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showUserDialog = false" :disabled="userSubmitting">取消</el-button>
        <el-button type="primary" @click="submitUser" :loading="userSubmitting">
          {{ userSubmitting ? '验证中...' : (editingUser ? '保存' : '验证并保存') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 注册账号对话框 -->
    <el-dialog
      v-model="showRegister"
      title="注册账号"
      width="420px"
      destroy-on-close
      @closed="resetRegister"
    >
      <el-form :model="registerForm" label-width="80px" label-position="left">
        <el-form-item label="用户名" required>
          <el-input v-model="registerForm.username" placeholder="输入用户名" />
        </el-form-item>
        <el-form-item label="密码" required>
          <el-input v-model="registerForm.password" type="password" show-password placeholder="输入密码" />
        </el-form-item>
        <el-form-item label="确认密码" required>
          <el-input v-model="registerForm.confirmPassword" type="password" show-password placeholder="再次输入密码" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="registerForm.phone" placeholder="选填" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="registerForm.email" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRegister = false" :disabled="registering">取消</el-button>
        <el-button type="primary" @click="submitRegister" :loading="registering">
          {{ registering ? '注册中...' : '注册' }}
        </el-button>
      </template>
    </el-dialog>
    </div><!-- login-body -->
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Edit, Delete, User, Close, UserFilled } from '@element-plus/icons-vue'
import { Services, saveStore } from '../utils/stores'
import { server, user as UserType, ipcSend, getErrMsg } from '../utils/publicType'
import { login, registerUser } from '../utils/api/http/user'
import { wgInfo } from '../utils/api/http/server'
import { Connection } from '../utils/conn'

const router = useRouter()
const svrStore = Services()

// ===== 服务器管理 =====
const serverList = ref<[string, server][]>([])
const selectedServer = ref<string>('')
const showAddServer = ref(false)
const editingServer = ref<string | null>(null)
const serverForm = ref({ name: '', host: '', port: 443, certify: false })

// ===== 账号管理 =====
const showUserDialog = ref(false)
const editingUser = ref<UserType | null>(null)
const userSubmitting = ref(false)
const userForm = ref({ username: '', password: '', confirmPassword: '' })

// 注册
const showRegister = ref(false)
const registering = ref(false)
const registerForm = ref({ username: '', password: '', confirmPassword: '', phone: '', email: '' })

// 登录中状态
const loggingIn = ref(false)

function closeApp() {
  saveStore()
  ipcSend('main-close')
}

const currentUsers = computed(() => {
  if (!selectedServer.value) return []
  const svr = serverList.value.find(([n]) => n === selectedServer.value)
  return svr ? svr[1].users : []
})

onBeforeMount(() => {
  refreshServerList()
})

function refreshServerList() {
  serverList.value = svrStore.all
}

function selectServer(name: string) {
  selectedServer.value = name
}

// ===== 服务器 CRUD =====
function editServer(name: string) {
  const svr = svrStore.get(name)
  if (!svr) return
  editingServer.value = name
  serverForm.value = { name, host: svr.host, port: svr.port, certify: svr.certify }
  showAddServer.value = true
}

function saveServer() {
  const { name, host, port, certify } = serverForm.value
  if (!name || !host || !port) {
    ElMessage.warning('请填写完整信息')
    return
  }
  if (editingServer.value && editingServer.value !== name) {
    svrStore.delete(editingServer.value)
  }
  const existing = svrStore.get(name)
  svrStore.set(name, {
    host,
    port,
    certify,
    users: existing?.users || [],
    defaultUser: existing?.defaultUser,
    token: existing?.token,
    wgInfo: existing?.wgInfo,
  })
  svrStore.save()
  refreshServerList()
  showAddServer.value = false
  editingServer.value = null
  ElMessage.success('服务器已保存')
}

function deleteServer(name: string) {
  svrStore.delete(name)
  svrStore.save()
  if (selectedServer.value === name) {
    selectedServer.value = ''
  }
  refreshServerList()
  ElMessage.success('服务器已删除')
}

// ===== 账号 CRUD =====
function openAddUser() {
  editingUser.value = null
  userForm.value = { username: '', password: '', confirmPassword: '' }
  showUserDialog.value = true
}

function openEditUser(user: UserType) {
  editingUser.value = user
  userForm.value = { username: user.username, password: '', confirmPassword: '' }
  showUserDialog.value = true
}

function resetUserDialog() {
  editingUser.value = null
  userForm.value = { username: '', password: '', confirmPassword: '' }
}

// ===== 注册账号 =====
function openRegister() {
  registerForm.value = { username: '', password: '', confirmPassword: '', phone: '', email: '' }
  showRegister.value = true
}

function resetRegister() {
  registerForm.value = { username: '', password: '', confirmPassword: '', phone: '', email: '' }
}

async function submitRegister() {
  const { username, password, confirmPassword, phone, email } = registerForm.value
  if (!username || !password) {
    ElMessage.warning('请填写用户名和密码')
    return
  }
  if (password !== confirmPassword) {
    ElMessage.warning('两次输入的密码不一致')
    return
  }
  if (!selectedServer.value) return

  registering.value = true
  try {
    const code = await registerUser(selectedServer.value, username, password, phone, email)
    if (code !== 0) {
      ElMessage.error('注册失败：' + getErrMsg(code))
      return
    }
    // 注册成功后自动添加到账号列表
    const svr = svrStore.get(selectedServer.value)
    if (svr) {
      svr.users.push({ username, password, userUuid: '' })
      svrStore.set(selectedServer.value, svr)
      svrStore.save()
      refreshServerList()
    }
    ElMessage.success('注册成功')
    showRegister.value = false
  } catch {
    ElMessage.error('注册失败：无法连接服务器')
  } finally {
    registering.value = false
  }
}

async function submitUser() {
  const { username, password, confirmPassword } = userForm.value
  if (!username || !password) {
    ElMessage.warning('请填写完整信息')
    return
  }
  if (!editingUser.value && password !== confirmPassword) {
    ElMessage.warning('两次输入的密码不一致')
    return
  }
  if (!selectedServer.value) return

  userSubmitting.value = true
  try {
    // 先调用登录接口验证账号密码是否有效
    const resp = await login(selectedServer.value, username, password)
    if (resp.code !== 0 || !resp.data) {
      ElMessage.error('验证失败：用户名或密码错误')
      return
    }

    const svr = svrStore.get(selectedServer.value)
    if (!svr) return

    if (editingUser.value) {
      // 编辑模式：更新密码
      const idx = svr.users.findIndex(u => u.username === editingUser.value!.username)
      if (idx !== -1) {
        svr.users[idx].password = password
      }
      ElMessage.success('账号密码已更新')
    } else {
      // 新增模式：检查重复后添加
      if (svr.users.find(u => u.username === username)) {
        ElMessage.warning('该账号已存在')
        return
      }
      svr.users.push({ username, password, userUuid: '' })
      ElMessage.success('账号已添加并验证通过')
    }

    svrStore.set(selectedServer.value, svr)
    svrStore.save()
    refreshServerList()
    showUserDialog.value = false
  } catch {
    ElMessage.error('验证失败：无法连接服务器')
  } finally {
    userSubmitting.value = false
  }
}

function deleteUser(user: UserType) {
  if (!selectedServer.value) return
  const svr = svrStore.get(selectedServer.value)
  if (!svr) return
  svr.users = svr.users.filter(u => u.username !== user.username)
  svrStore.set(selectedServer.value, svr)
  svrStore.save()
  refreshServerList()
  ElMessage.success(`账号「${user.username}」已删除`)
}

// ===== 登录 =====
async function loginWithUser(user: UserType) {
  if (!selectedServer.value) return

  loggingIn.value = true
  try {
    const resp = await login(selectedServer.value, user.username, user.password)
    if (resp.code !== 0 || !resp.data) {
      ElMessage.error('登录失败：用户名或密码错误，请检查账号')
      return
    }

    const svr = svrStore.get(selectedServer.value)
    if (svr) {
      svr.token = resp.data
      svr.defaultUser = user

      const wgResp = await wgInfo(selectedServer.value)
      if (wgResp.code === 0) {
        svr.wgInfo = wgResp.data
      }

      svrStore.set(selectedServer.value, svr)
      svrStore.save()
    }

    // 尝试建立 WebSocket 连接
    const conn = Connection.getInstance(selectedServer.value)
    const connected = await conn.active()
    if (!connected) {
      ElMessage.error('连接服务器失败，请检查网络或服务器状态')
      return
    }

    ElMessage.success('登录成功')
    router.push(`/main/${selectedServer.value}`)
  } catch {
    ElMessage.error('登录失败：无法连接服务器')
  } finally {
    loggingIn.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-secondary);
}

/* 顶部标题栏 */
.login-titlebar {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.titlebar-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.titlebar-close {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: var(--text-secondary);
}

.titlebar-close:hover {
  background: var(--color-danger);
  color: #fff;
}

/* 主体区域 */
.login-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 左侧品牌区 */
.login-brand {
  width: 320px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  user-select: none;
}

.brand-logo {
  margin-bottom: 16px;
  opacity: 0.9;
}

.brand-title {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 4px;
  margin-bottom: 8px;
}

.brand-desc {
  font-size: 14px;
  opacity: 0.6;
  letter-spacing: 2px;
}

/* 右侧操作区 */
.login-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.login-card {
  width: 440px;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}

.section {
  background: var(--bg-primary);
  border-radius: var(--radius-base);
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: var(--shadow-light);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-header h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-header-actions {
  display: flex;
  gap: 4px;
}

.empty-hint {
  text-align: center;
  padding: 24px 0;
  color: var(--text-placeholder);
  font-size: 13px;
}

/* 服务器列表 */
.server-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
}

.server-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-small);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.server-item:hover {
  border-color: var(--color-primary-light);
  background: rgba(64, 158, 255, 0.04);
}

.server-item.active {
  border-color: var(--color-primary);
  background: rgba(64, 158, 255, 0.08);
}

.server-item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.server-name {
  font-weight: 500;
  font-size: 14px;
}

.server-url {
  font-size: 12px;
  color: var(--text-secondary);
}

.server-item-actions {
  display: flex;
  gap: 4px;
}

/* 用户列表 */
.user-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-small);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: 14px;
}

.user-item:hover {
  border-color: var(--color-primary-light);
  background: rgba(64, 158, 255, 0.04);
}

.user-name {
  flex: 1;
  font-weight: 500;
}

.user-item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.user-item:hover .user-item-actions {
  opacity: 1;
}
</style>
