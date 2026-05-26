<script setup lang="ts">
import {onBeforeMount, onBeforeUnmount, onMounted, nextTick, ref} from 'vue'
import {wsResp} from "../../utils/publicType";
import {useRouter} from "vue-router";
import {ElMessage, ElScrollbar} from "element-plus";
import Message from "../elements/room/Message.vue";
import SystemMessage from "../elements/room/SystemMessage.vue";
import {roomOut, roomMessage, roomForbidden} from '../../utils/api/ws/room'
import IconButton from "../elements/IconButton.vue";
import { roomer, Room } from '../../utils/roomController';
import Member from '../elements/room/Member.vue';

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
const messageScroll = ref<any>(null);
const showUnreadBubble = ref(false);
const unreadCount = ref(0);
const scrollBottom = ref(true);

const test = ref(new Map<string, any>())

function isScrollAtBottom(target: HTMLElement) {
  return target.scrollHeight - target.scrollTop - target.clientHeight <= 40;
}

function onScroll({ scrollTop }: { scrollTop: number; scrollLeft: number }) {
  const wrap = messageScroll.value?.wrapRef as HTMLElement | undefined;
  if (!wrap) return;
  const atBottom = wrap.scrollHeight - scrollTop - wrap.clientHeight <= 40;
  scrollBottom.value = atBottom;
  if (atBottom) {
    showUnreadBubble.value = false;
    unreadCount.value = 0;
  }
}

async function scrollToBottom() {
  await nextTick();
  const wrap = messageScroll.value?.wrapRef as HTMLElement | undefined;
  if (!wrap) return;
  wrap.scrollTop = wrap.scrollHeight;
  scrollBottom.value = true;
  showUnreadBubble.value = false;
  unreadCount.value = 0;
}

function copyLink(msg: string) {
  if (!(curRoom.members.value.get(curRoom.selfUuid))?.owner) {
    ElMessage({
      type: 'warning',
      message: '仅房主可用'
    })
    return;
  };
  navigator.clipboard.writeText(msg).then(async () => {
    ElMessage({
      message: '已复制房间链接',
      type: 'success'
    })
  })
}

async function sendMessage(): Promise<void> {
  if (inputMessage.value.replace(/\s+/g, "") === "") {
    ElMessage({
      type: 'warning',
      message: '请输入消息'
    })
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
  if (!(curRoom.members.value.get(curRoom.selfUuid))?.owner) {
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
    router.push(`/server/page/${props.serverName}`);
    return;
  };
  curRoom = room;
  room.onClose = () => {
    ElMessage({
      type: "info", message: "房间已关闭"
    })
    router.push(`/server/page/${props.serverName}`);
  };
  await curRoom.setMsgCallback(async (msg) => {
    await nextTick();
    const wrap = messageScroll.value?.wrapRef as HTMLElement | undefined;
    if (!wrap) return;
    if (scrollBottom.value) {
      wrap.scrollTop = wrap.scrollHeight;
      showUnreadBubble.value = false;
      unreadCount.value = 0;
    } else {
      unreadCount.value += 1;
      showUnreadBubble.value = true;
    }
  });
  mounted.value = true;
})

onMounted(async () => {
  await nextTick();
  const wrap = messageScroll.value?.wrapRef as HTMLElement | undefined;
  if (wrap) {
    wrap.scrollTop = wrap.scrollHeight;
  }
});

onBeforeUnmount(async () => {
  await roomOut(props.serverName, props.roomId);
  await roomer.deleteRoom(props.roomId);
})
</script>

<template>
  <div style="height: 100%;width: 100%">
    <el-row :gutter="24" v-if="mounted" style="height: 100%;width: 100%">
      <el-col :span="6" style="height: 100%; width: 100%;border-right: 1px solid #eee;">
        <div style="margin-bottom: 1px;">
          <el-row :gutter="24" style="padding: 2px 5px;">
            <el-col :span="8">
              <div class="room-btn">
                <IconButton :size="24" icon="leaveRoom" @click="router.go(-1)" round></IconButton>
              </div>

            </el-col>
            <el-col :span="8">
              <div class="room-btn">
                <IconButton icon="unlock" :size="24" @click="forbiddenRoom" v-if="curRoom.forbidden.value" round></IconButton>
                <IconButton icon="lock" :size="24" @click="forbiddenRoom" v-else round></IconButton>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="room-btn">
                <IconButton icon="copy" :size="24" @click="copyLink(curRoom.link)" round></IconButton>
              </div>
            </el-col>
          </el-row>
        </div>
        <div style="width: 100%;" v-if="mounted">
          <Member :room-id="props.roomId"></Member>
        </div>
      </el-col>
      <el-col :span="18" style="height: 100%;">
        <div style="height: 70%;display: flex; flex-direction: column; position: relative;">
          <el-scrollbar ref="messageScroll" :always="false" @scroll="onScroll" style="background-color: #eaeaea;height: 70%;flex: 1;border-radius: 10px;padding: 5px; margin-top: 5px;">
            <div v-for="(message, index) in curRoom.messages.value" :key="index">
              <Message :msg="message.text" :time="message.timestamp" :self="message.fromUuid === curRoom.selfUuid"
                       :username="message.fromUsername" v-if="message.fromUuid !== ''"></Message>
              <SystemMessage :message="message.text" :time="message.timestamp" v-else></SystemMessage>
            </div>
          </el-scrollbar>
          <div v-if="showUnreadBubble" class="unread-bubble" @click="scrollToBottom">
            <span>{{ unreadCount }} 条新消息</span>
            <span class="unread-bubble-arrow"></span>
          </div>
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
              <!-- <el-button @click="curRoom.printWg()">打印wg信息</el-button> -->
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

.unread-bubble {
  position: absolute;
  right: 20px;
  bottom: 90px;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  background: #1890ff;
  color: #ffffff;
  font-size: 13px;
  border-radius: 20px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  user-select: none;
}

.unread-bubble:hover {
  background: #096dd9;
}

.unread-bubble-arrow {
  width: 0;
  height: 0;
  margin-left: 8px;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid #ffffff;
}
</style>