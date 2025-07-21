<script setup lang="ts">

const props = defineProps({
  self: {
    type: Boolean,
    default: false,
  },
  username: {
    type: String,
  },
  time: {
    type: Number,
    required: true,
  },
  msg: {
    type: String,
    required: true
  }
})
</script>

<template>
  <div class="message-item"
       :class="{ 'self-message': props.self }">
    <div class="message-avatar">
      <el-avatar :size="40" src=""/>
    </div>
    <div class="message-content">
      <div class="message-info">
                  <span class="sender-name" v-if="!props.self">{{
                      props.username
                    }}</span>
        <span class="send-time">{{ (new Date(props.time)).toLocaleTimeString() }}</span>
      </div>
      <div class="message-bubble">
        <div class="message-text">{{ props.msg }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-item {
  display: flex;
  margin-bottom: 15px;
}

.message-item.self-message {
  flex-direction: row-reverse;
}

.message-avatar {
  margin-right: 10px;
  display: flex;
  align-items: center;
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