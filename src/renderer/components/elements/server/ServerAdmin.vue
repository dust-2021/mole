<script setup lang="ts">
import {ref, watch} from 'vue'
import {Services} from "../../../utils/stores";
import { ElButton, ElMain, ElMessage, ElTable, ElTableColumn } from 'element-plus';
import { createUsers } from '../../../utils/api/http/user';
import { setPublicRegister } from '../../../utils/api/http/admin';

const svr = Services();
const props = defineProps({
  serverName: {
    type: String,
    required: true,
  }
})

enum ShowType {
  nothing = "",
  newUsers = "newUsers"
}

const showInfo = ref<string>(ShowType.nothing);
const newUsers = ref<{ username: string, password: string }[]>([]);

async function createUsersF(count: number) {
  const resp = await createUsers(props.serverName, count);

  if (resp.length === 0) {
    ElMessage({
      type: "error",
      message: "创建用户失败"
    })
    return;
  }
  newUsers.value = resp;
  showInfo.value = ShowType.newUsers;
}

async function setPublicRegisterF(to: boolean) {
  const resp = await setPublicRegister(props.serverName, to);

  if (!resp) {
    ElMessage({
      type: "error",
      message: "设置公共注册失败"
    })
    return;
  }
}

</script>

<template>
  <div>
    <el-button @click="createUsersF(10)">添加用户</el-button>
    <el-button @click="setPublicRegisterF(true)">开启注册</el-button>
    <el-button @click="setPublicRegisterF(false)">关闭注册</el-button>
    <el-main>
      <div>
        <el-table :data="newUsers" v-if="showInfo === ShowType.newUsers">
          <el-table-column prop="username" label="用户名"></el-table-column>
          <el-table-column prop="password" label="密码"></el-table-column>
        </el-table>
      </div>
    </el-main>
  </div>

</template>

<style scoped>

</style>