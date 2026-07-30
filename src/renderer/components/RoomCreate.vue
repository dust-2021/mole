<template>
  <div class="room-create">
    <div class="page-header">
      <h2>创建房间</h2>
    </div>

    <div class="form-card">
      <el-form :model="form" label-width="100px" label-position="left" style="max-width: 600px;">
        <el-form-item label="房间标题" required>
          <el-input v-model="form.title" :maxlength="12" placeholder="输入房间标题" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="输入房间描述" />
        </el-form-item>
        <el-form-item label="最大成员数">
          <el-input-number v-model="form.maxMember" :min="2" :max="32" />
        </el-form-item>
        <el-form-item label="房间密码">
          <div style="display: flex; align-items: center; gap: 8px;">
            <el-switch v-model="withPassword" />
            <el-input v-if="withPassword" v-model="form.password" type="password" placeholder="设置密码" style="width: 160px;" />
          </div>
        </el-form-item>
        <el-form-item label="自动关闭">
          <el-switch v-model="form.autoClose" />
          <span class="form-hint">房间长时间无消息时自动关闭</span>
        </el-form-item>
        <el-form-item label="黑名单">
          <div class="blacklist-row">
            <div class="blacklist-item">
              <el-switch v-model="form.ipBlackList" size="small" />
              <span>IP 黑名单</span>
            </div>
            <div class="blacklist-item">
              <el-switch v-model="form.userIdBlackList" size="small" />
              <span>用户黑名单</span>
            </div>
            <div class="blacklist-item">
              <el-switch v-model="form.deviceBlackList" size="small" />
              <span>设备黑名单</span>
            </div>
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="submit" :loading="submitting" :disabled="!form.title">
            创建房间
          </el-button>
          <el-button @click="router.back()">取消</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, toRaw } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { roomCreate, roomOut } from '../utils/api/ws/room'
import { roomer, member } from '../utils/roomController'
import { Connection } from '../utils/conn'
import { wsResp } from '../utils/publicType'

const props = defineProps<{ serverName: string }>()
const router = useRouter()

const submitting = ref(false)
const withPassword = ref(false)

const form = ref<{
  title: string
  description: string
  maxMember: number
  password?: string
  autoClose: boolean
  ipBlackList: boolean
  userIdBlackList: boolean
  deviceBlackList: boolean
}>({
  title: '',
  description: '',
  maxMember: 16,
  autoClose: false,
  ipBlackList: false,
  userIdBlackList: false,
  deviceBlackList: false,
})

watch(withPassword, (val) => {
  if (val) {
    form.value.password = ''
  } else {
    delete form.value.password
  }
})

async function submit() {
  if (!form.value.title.trim()) {
    ElMessage.warning('请输入房间标题')
    return
  }

  submitting.value = true
  await roomCreate(props.serverName, toRaw(form.value), async (r: wsResp) => {
    if (r.statusCode !== 0) {
      ElMessage.error('创建失败: ' + r.data)
      submitting.value = false
      return
    }

    const data: { roomId: string; link: string; mates: member[] } = r.data
    if (data.mates.length !== 1) {
      ElMessage.error('获取虚拟网络IP失败')
      await roomOut(props.serverName, data.roomId)
      submitting.value = false
      return
    }

    const room = await roomer.createRoom(
      Connection.getInstance(props.serverName),
      data.roomId, props.serverName, data.mates[0].vlan, data.link
    )

    if (!room) {
      await roomOut(props.serverName, data.roomId)
      ElMessage.error('创建局域网失败')
      submitting.value = false
      return
    }

    await room.addMembers(data.mates)
    router.push(`/main/${props.serverName}/room/${data.roomId}?title=${encodeURIComponent(form.value.title || data.roomId)}`)
  })
}
</script>

<style scoped>
.room-create {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 720px;
  margin: 0 auto;
}

.page-header {
  width: 100%;
  margin-bottom: 24px;
}

.page-header h2 {
  font-size: 20px;
  font-weight: 600;
}

.form-card {
  width: 100%;
  background: var(--bg-primary);
  border-radius: var(--radius-base);
  padding: 32px 40px;
  box-shadow: var(--shadow-light);
}

.form-hint {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.blacklist-row {
  display: flex;
  gap: 24px;
}

.blacklist-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
</style>
