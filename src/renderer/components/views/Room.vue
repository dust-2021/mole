<script setup lang="ts">
import {onBeforeMount, onBeforeUnmount, ref} from 'vue'
import {wsResp} from "../../utils/publicType";
import {useRouter} from "vue-router";
import {ElMessage} from "element-plus";
import Message from "../elements/room/Message.vue";
import SystemMessage from "../elements/room/SystemMessage.vue";
import {roomOut, roomMessage, roomForbidden} from '../../utils/api/ws/room'
import IconButton from "../elements/IconButton.vue";
import { roomer, Room } from '../../utils/roomController';

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

// 组件挂载完成信号
const mounted = ref(false);
// 输入框文本
const inputMessage = ref<string>('');
const router = useRouter();
let curRoom: Room;
const test = ref(new Map<string, any>())

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
    curRoom.addMsg([{fromUuid: curRoom.selfUuid, text: inputMessage.value, timestamp: Date.now(), fromUsername: ""}]);
      inputMessage.value = "";
  });

}

async function forbiddenRoom() {
  if (!(await curRoom.members.value.get(curRoom.selfUuid))?.owner) {
    ElMessage({
      message: '仅房主可用',
      type: 'warning'
    })
    return;
  }
  await roomForbidden(props.serverName, props.roomId, !curRoom.forbidden.value, (resp: wsResp) => {
    if (resp.statusCode !== 0) {
      ElMessage({
        type: 'warning',
        message: `关闭房间失败：${resp.data}`
      })
    }
  });
}


onBeforeMount(async () => {
  const room = await roomer.getRoom(props.roomId);
  if (!room) {
    ElMessage({
      type: "info", message: "打开房间失败"
    })
    router.go(-1);
    return;
  };
  curRoom = room;
  room.onClose = () => {
    ElMessage({
      type: "info", message: "房间已关闭"
    })
    router.go(-1);
  }
  mounted.value = true;
})

onBeforeUnmount(async () => {
  await roomOut(props.serverName, props.roomId);
  await roomer.deleteRoom(props.roomId);
})
</script>

<template>
  <div style="height: 100%;width: 100%">
    <el-row :gutter="24" v-if="mounted" style="height: 100%;width: 100%">
      <el-col :span="6" style="height: 100%;border-right: 1px solid #eee;">
        <div style="margin-bottom: 1px">
          <el-row :gutter="24" style="padding: 2px 5px;">
            <el-col :span="8">
              <div class="room-btn">
                <IconButton :size="24" icon="leaveRoom" @click="router.go(-1)"></IconButton>
              </div>

            </el-col>
            <el-col :span="8">
              <div class="room-btn">
                <IconButton icon="unlock" :size="24" @click="forbiddenRoom" v-if="curRoom.forbidden.value"></IconButton>
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
          <div v-for="[k, v] in curRoom.members.value" :key="k" class="member-info">
            <el-row :gutter="24">
              <el-col :span="6" class="center-item">
                <el-avatar src="" :size="32"></el-avatar>
              </el-col>
              <el-col :span="14">
                <el-row :gutter="24">
                  <el-col :span="16">
                    <el-text :type="'primary'" :truncated="true">{{ v.name }}</el-text>
                  </el-col>
                  <el-col :span="8" v-if="v.owner">
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
            <div v-for="(message, index) in curRoom.messages.value">
              <Message :msg="message.text" :time="message.timestamp" :self="message.fromUuid === curRoom.selfUuid"
                       :username="message.fromUsername" v-if="message.fromUuid !== ''"></Message>
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