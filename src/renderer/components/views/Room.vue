<script setup lang="ts">
import {onBeforeMount, onBeforeUnmount, ref} from 'vue'
import {Services} from "../../utils/stores";
import {server, wsResp} from "../../utils/publicType";
import {useRouter} from "vue-router";
import {ElMessage} from "element-plus";
import Message from "../elements/room/Message.vue";
import {ArrowLeft, CopyDocument, Lock, Unlock} from '@element-plus/icons-vue'
import SystemMessage from "../elements/room/SystemMessage.vue";
import {Connection} from "../../utils/ws/conn";
import {roomOut, roomMessage, roomForbidden, roomMates} from '../../utils/api/ws/room'
import {Mutex} from 'async-mutex';
import IconButton from "../elements/IconButton.vue";

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
const messagesLock: Mutex = new Mutex();
const members = ref<Map<number, member>>(new Map());
const self = ref<member>(null);
const inputMessage = ref<string>('');
const router = useRouter();
const forbidden = ref(false);
const conn = Connection.getInstance(props.serverName);

async function onMessage(resp: wsResp) {
  const r = await messagesLock.acquire();
  try {
    const data: { senderId: number, senderName: string, data: string, timestamp: number } = resp.data;
    messages.value.push({from: data.senderId, text: data.data, timestamp: data.timestamp});
    const k = messages.value.length;
    if (k >= 1000) {
      messages.value = messages.value.slice(k - 1001, 1000);
    }
  } catch (error) {
  } finally {
    r();
  }
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
  await roomMessage(props.serverName, props.roomId, inputMessage.value, async (r) => {
    if (r.statusCode !== 0) {
      ElMessage({
        type: 'error',
        message: '消息发送失败：' + r.data,
        showClose: true,
      })
      inputMessage.value = "";
      return;
    }
    const release = await messagesLock.acquire();
    try {
      messages.value.push({
        from: self.value.userId,
        text: inputMessage.value,
        timestamp: Date.now()
      })
      inputMessage.value = "";
    } catch (e) {

    } finally {
      release();
    }
  });

}

function onJoinRoom(resp: wsResp) {
  const data: { id: number, name: string, owner: boolean, addr: string } = resp.data;
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
  const data: { old: number, new: number } = resp.data;
  const old_ = members.value.get(data.old);
  const new_ = members.value.get(data.new);
  if (old_ !== undefined) {
    old_.owner = false;
  }
  if (new_ === undefined) {
    return;
  }
  new_.owner = true;
  messages.value.push({from: 0, text: `房主已移交至${new_.username}`, timestamp: Date.now()});

}

function onCloseRoom() {
  router.push('/server/' + props.serverName)
}

function onForbiddenRoom(resp: wsResp) {
  forbidden.value = resp.data;
  messages.value.push({
    from: 0, text: forbidden.value ? '房间关闭进入' : '房间开放进入', timestamp: Date.now()
  })
}

async function forbiddenRoom() {
  if (!members.value.get(self.value.userId).owner) {
    ElMessage({
      message: '仅房主可用',
      type: 'warning'
    })
    return;
  }
  await roomForbidden(props.serverName, props.roomId, !forbidden.value, (resp: wsResp) => {
    if (resp.statusCode !== 0)  {
      ElMessage({
        type: 'warning',
        message: `关闭房间失败：${resp.data}`
      })
    }
  });
}


onBeforeMount(async () => {
  svr.value = services.get(props.serverName);
  await roomMates(props.serverName, props.roomId,
      (resp: wsResp) => {
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
          if (item.name === svr.value.defaultUser.username) {
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
  conn.methodHandler(`publish.room.notice.in`, onJoinRoom)
  conn.methodHandler(`publish.room.notice.exchangeOwner`, onOwnerChange)
  conn.methodHandler(`publish.room.notice.out`, onLeaveRoom)
  conn.methodHandler(`publish.room.message`, onMessage)
  conn.methodHandler(`publish.room.notice.close`, onCloseRoom)
  conn.methodHandler(`publish.room.notice.forbidden`, onForbiddenRoom)


  mounted.value = true;
  messages.value = [];
})

onBeforeUnmount(async () => {
  await roomOut(props.serverName, props.roomId);

  conn.methodHandler(`publish.room.notice.in`)
  conn.methodHandler(`publish.room.notice.exchangeOwner`)
  conn.methodHandler(`publish.room.notice.out`)
  conn.methodHandler(`publish.room.message`)
  conn.methodHandler(`publish.room.notice.close`)
  conn.methodHandler(`publish.room.notice.forbidden`)
})
</script>

<template>
  <div style="height: 100%;width: 100%">
    <el-row :gutter="24" v-if="mounted" style="height: 100%;width: 100%">
      <el-col :span="6" style="height: 100%;border-right: 1px solid #eee;">
        <div style="margin-bottom: 1px">
          <el-row :gutter="24">
            <el-col :span="8">
              <div class="room-btn"><IconButton :size="24" icon="leaveRoom" @click="router.go(-1)"></IconButton></div>

            </el-col>
            <el-col :span="8">
              <div class="room-btn">
              <IconButton icon="unlock" :size="24" @click="forbiddenRoom" v-if="forbidden"></IconButton>
              <IconButton icon="lock" :size="24" @click="forbiddenRoom" v-else></IconButton>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="room-btn">
              <IconButton icon="copy" :size="24" @click="copyRoomId(props.roomId)"></IconButton>
              </div>
            </el-col>
          </el-row>
        </div>
        <div style="width: 100%;" v-if="mounted">
        </div>
        <el-scrollbar :always="false" height="100%" max-height="100%"
                      :noresize="true">
          <div v-for="(k, i) in members" :key="i" class="member-info">
            <el-row :gutter="24">
              <el-col :span="6" class="center-item">
                <el-avatar src="" :size="32"></el-avatar>
              </el-col>
              <el-col :span="14">
                <el-row :gutter="24">
                  <el-col :span="16">
                    <el-text :type="'primary'" :truncated="true">{{ k[1].username }}</el-text>
                  </el-col>
                  <el-col :span="8" v-if="k[1].owner">
                    <div style="display: flex;justify-items: center;align-content: center">
                      <svg :width="'16px'" :height="'16px'">
                        <use href="#icon-badge"></use>
                      </svg>
                    </div>
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

.room-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: auto;
  padding: 5px;
}
.center-item {
  display: flex;
  justify-items: center;
  align-items: center;
}
</style>