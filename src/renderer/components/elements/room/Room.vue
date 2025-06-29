<script setup lang="ts">
import {ref, onBeforeMount, onBeforeUnmount} from 'vue'
import {Services} from "../../../utils/stores";
import {server, ipcWsReq, ipcOnce, wsRequest, wsResp, ipcOn, ipcRemove} from "../../../utils/ipcTypes";
import {useRouter} from "vue-router";
import {ElMessage} from "element-plus";
import Message from "./Message.vue";
import {ArrowLeft, Lock, Unlock, CopyDocument } from '@element-plus/icons-vue'
import SystemMessage from "./SystemMessage.vue";

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
const forbidden = ref(false);

function onMessage(resp: wsResp) {
  const data: {senderId: number, senderName: string, data: string, timestamp: number} = resp.data;
  messages.value.push({from: data.senderId, text: data.data, timestamp: data.timestamp});
}

function copyRoomId(msg: string) {
  navigator.clipboard.writeText(msg).then(async () => {
    ElMessage({
      message: '已复制房间ID',
      type: 'success'
    })
  })
}

async function sendMessage(): Promise<void> {
  if (inputMessage.value === "") {
    return;
  }
  await wsRequest({serverName: props.serverName, apiName: 'room.message', args: [props.roomId, inputMessage.value]})
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
  messages.value.push({from: 0, text: `${data.name}加入房间`, timestamp: Date.now()});
}

function onLeaveRoom(resp: wsResp) {
  const id: number = resp.data;
  messages.value.push({from: 0, text: `${members.value.get(id)?.username}离开房间`, timestamp: Date.now()});
  members.value.delete(id);
}

function onOwnerChange(resp: wsResp) {
  const data: {old: number, new: number} = resp.data;
  const old = {...members.value.get(data.old), owner: false};
  const new_ = {...members.value.get(data.new), owner: false};
  messages.value.push({from: 0, text: `房主已移交至${new_.username}`, timestamp: Date.now()});
  members.value.set(data.old, old);
  members.value.set(data.new, new_);
}

function onCloseRoom() {
  router.push('/server/' + props.serverName)
}

async function forbiddenRoom(){
  if (!self.value.owner){
    ElMessage({
      message: '仅房主可用',
      type: 'warning'
    })
    return;
  }
  await wsRequest({serverName: props.serverName, apiName: 'room.forbidden', args: [props.roomId]},
  true, 2000, (resp: wsResp) => {
    if (resp.statusCode === 0) {
      forbidden.value = !forbidden.value;
    }
      })
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
          // 获取自己的账号信息
          if (item.name === svr.value.defaultUser.username){
            self.value = {
              userId: item.id, username: item.name, addr: item.addr, owner: item.owner
            }
          }
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
      <el-col :span="6" style="height: 100%;border-right: 1px solid #eee;">
        <div>
          <el-row :gutter="24" class="room-band">
            <el-col :span="8" class="room-btn"><el-icon :size="24" @click="$router.back()"><ArrowLeft></ArrowLeft></el-icon></el-col>
            <el-col :span="8" class="room-btn"><el-icon :size="24" @click="forbiddenRoom"><Lock v-if="forbidden"></Lock><Unlock v-else></Unlock></el-icon></el-col>
            <el-col :span="8" class="room-btn"><el-icon @click="copyRoomId(props.roomId)" :size="24"><CopyDocument></CopyDocument></el-icon></el-col>
          </el-row>
        </div>
        <div style="width: 100%;" v-if="mounted">
        </div>
        <el-scrollbar :always="false" height="100%" max-height="100%"
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
            <div v-for="(message, index) in messages">
              <Message :msg="message.text" :time="message.timestamp" :self="message.from === self.userId"
                       :username="members.get(message.from)?.username" v-if="message.from !== 0"></Message>
              <SystemMessage :message="message.text" :time="message.timestamp" v-else></SystemMessage>
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
.room-band {
  background: #eeeeee;
}
.room-btn {
  padding: 5px 2px;
  border-radius: 3px;
  background-color: white;
}
</style>