<script setup lang="ts">
import {ref, onBeforeMount, onBeforeUnmount} from 'vue'
import {Services} from "../../../utils/stores";
import {server, ipcWsReq, ipcOnce, wsRequest, wsResp, ipcOn, ipcRemove} from "../../../utils/ipcTypes";
import {useRouter} from "vue-router";
import {ElMessage} from "element-plus";
import {ArrowLeft, Lock, Unlock } from '@element-plus/icons-vue'

const props = defineProps({
  serverName: {
    type: String,
    required: true
  },
  roomId: {
    type: String,
    required: true
  }
})

interface member {
  userId: number,
  username: string,
  addr: string,
  owner: boolean,
}

interface message {
  from: number,
  text: string,
  timestamp: number
}

const mounted = ref(false);
const services = Services();
const svr = ref<server>(null);
const messages = ref<message[]>(null);
const members = ref<Map<number, member>>(new Map());
const self = ref<member>(null);
const inputMessage = ref<string>('');
const router = useRouter();

function onMessage(resp: wsResp) {
  const data: {senderId: number, senderName: string, data: string, timestamp: number} = resp.data;
  messages.value.push({from: data.senderId, text: data.data, timestamp: data.timestamp});
}

async function sendMessage(): Promise<void> {
  if (inputMessage.value === "") {
    return;
  }
  await wsRequest({serverName: props.serverName, apiName: 'room.message', args: [props.serverName, props.roomId]})
  messages.value.push({
    from: self.value.userId,
    text: inputMessage.value,
    timestamp: Date.now()
  })
  inputMessage.value = "";
}

function onJoinRoom(resp: wsResp) {
  const data: {id: number, name: string, owner: boolean, addr: string} = resp.data;
  members.value.set(data.id, {
    userId: data.id, username: data.name, addr: data.addr, owner: data.owner
  });
}

function onLeaveRoom(resp: wsResp) {
  const id: number = resp.data;
  members.value.delete(id);
}

function onOwnerChange(resp: wsResp) {
  const data: {old: number, new: number} = resp.data;
  const old = {...members.value.get(data.old), owner: false};
  const new_ = {...members.value.get(data.new), owner: false};
  members.value.set(data.old, old);
  members.value.set(data.new, new_);
}

function onCloseRoom() {
  router.push('/server/' + props.serverName)
}


onBeforeMount(async () => {
  svr.value = services.get(props.serverName);
  await wsRequest({serverName: props.serverName, apiName: 'room.roommate', args: [props.roomId]},
      true, 2000, (resp: wsResp) => {
      if (resp.statusCode !== 0) {
        ElMessage({
          showClose: true,
          message: `获取成员失败：${resp.statusCode}-${resp.data}`,
          type: 'warning'
        })
        return
      }
        for (const item of resp.data) {
          members.value.set(item.id, {
            userId: item.id,
            username: item.name,
            addr: item.addr,
            owner: item.owner
          })
        }
      });
  ipcOn(`${props.serverName}.room.in.${props.roomId}`, onJoinRoom)
  ipcOn(`${props.serverName}.room.owner.${props.roomId}`, onOwnerChange)
  ipcOn(`${props.serverName}.room.out.${props.roomId}`, onLeaveRoom)
  ipcOn(`${props.serverName}.room.message.${props.roomId}`, onMessage)
  ipcOnce(`${props.serverName}.room.close.${props.roomId}`, onCloseRoom)


  mounted.value = true;
  messages.value = [];
  for (const m of members.value) {
    if (m[1].username === svr.value.defaultUser.username) {
      self.value = {
        userId: m[1].userId,
        username: m[1].username,
        addr: m[1].addr,
        owner: m[1].owner,
      }
    }
  }

})
onBeforeUnmount(async () => {
  await wsRequest({serverName: props.serverName, apiName: 'room.out', args: [props.roomId]});

  ipcRemove(`${props.serverName}.room.in.${props.roomId}`, onJoinRoom)
  ipcRemove(`${props.serverName}.room.owner.${props.roomId}`, onOwnerChange)
  ipcRemove(`${props.serverName}.room.out.${props.roomId}`, onLeaveRoom)
  ipcRemove(`${props.serverName}.room.message.${props.roomId}`, onMessage)
})
</script>

<template>
  <div style="height: 100%;width: 100%">
    <el-row :gutter="24" v-if="mounted" style="height: 100%;width: 100%">
      <el-col :span="6" style="height: 100%">
        <div>
          <el-row :gutter="24">
            <el-col :span="8"><el-icon><ArrowLeft></ArrowLeft></el-icon></el-col>
            <el-col :span="8"></el-col>
            <el-col :span="8"></el-col>
          </el-row>
        </div>
        <div style="width: 100%;" v-if="mounted">
        </div>
        <el-scrollbar :always="false" style="border-right: 1px solid #eee;" height="100%" max-height="100%"
                      :noresize="true">
          <div v-for="(k, i) in members" :key="i" class="member-info">
            <el-row :gutter="24">
              <el-col :span="6">
                <el-avatar src="" :size="32"></el-avatar>
              </el-col>
              <el-col :span="14">
                <el-row :gutter="24">
                  <el-col :span="16">
                    <el-text :type="'primary'">{{ k[1].username }}</el-text>
                  </el-col>
                  <el-col :span="8">
                    <el-tag v-if="k[1].owner" size="small">房主</el-tag>
                  </el-col>
                </el-row>
              </el-col>
            </el-row>
          </div>
        </el-scrollbar>
      </el-col>
      <el-col :span="18" style="height: 100%;">
        <div style="height: 70%;display: flex; flex-direction: column">
          <el-scrollbar :always="false" style="background-color: #eaeaea;height: 70%;flex: 1;border-radius: 2px">
            <div
                v-for="(message, index) in messages"
                :key="index"
                class="message-item"
                :class="{ 'self-message': message.from === self?.userId }"
            >
              <div class="message-avatar">
                <el-avatar :size="40" src=""/>
              </div>
              <div class="message-content">
                <div class="message-info">
                  <span class="sender-name" v-if="message.from !== self.userId">{{
                      members.get(message.from)?.username
                    }}</span>
                  <span class="send-time">{{ (new Date(message.timestamp)).toLocaleTimeString() }}</span>
                </div>
                <div class="message-bubble">
                  <div class="message-text">{{ message.text }}</div>
                </div>
              </div>
            </div>
          </el-scrollbar>
        </div>

        <div style="height: 30%;padding-top: 10px">
          <el-row :gutter="12">
            <el-col :span="11">
              <el-input type="textarea" :row="3" v-model="inputMessage" @keyup.enter.native="sendMessage"
                        placeholder="输入消息" resize="none">
              </el-input>
            </el-col>
            <el-col :span="1">
              <el-button @click="sendMessage">发送</el-button>
            </el-col>
          </el-row>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.member-info {
  width: 100%;
  height: 50px;
  margin: 2px 5px;
  text-align: center;
  border-bottom: 1px solid #eeeeee;
  align-items: center;
}

.message-item {
  display: flex;
  margin-bottom: 15px;
}

.message-item.self-message {
  flex-direction: row-reverse;
}

.message-avatar {
  margin-right: 10px;
}

.self-message .message-avatar {
  margin-right: 0;
  margin-left: 10px;
}

.message-content {
  max-width: 60%;
}

.message-info {
  margin-bottom: 5px;
  font-size: 12px;
  color: #666;
}

.self-message .message-info {
  text-align: right;
}

.sender-name {
  margin-right: 8px;
  font-weight: bold;
}

.send-time {
  color: #999;
}

.message-bubble {
  position: relative;
  padding: 10px 15px;
  border-radius: 4px;
  background-color: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.self-message .message-bubble {
  background-color: #95ec69;
}

.message-text {
  word-break: break-word;
  font-size: 14px;
  line-height: 1.5;
}
</style>