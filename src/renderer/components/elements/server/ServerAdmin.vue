<script setup lang="ts">
import {ref} from 'vue'
import {Services} from "../../../utils/stores";
import { ElButton, ElIcon, ElMain, ElMessage, ElMessageBox, ElScrollbar, ElTable, ElTableColumn } from 'element-plus';
import { createUsers } from '../../../utils/api/http/user';
import { setPublicRegister } from '../../../utils/api/http/admin';
import { DocumentCopy } from "@element-plus/icons-vue";
import { getErrMsg } from '../../../utils/publicType';

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

async function createUsersF() {
   ElMessageBox.prompt('请输入要生成的账号数量', '生成账号', {
    confirmButtonText: '生成',
    cancelButtonText: '取消',
    inputPattern: /^[1-9]\d*$/,
    inputErrorMessage: '请输入一个正整数'
  }).then(async ({ value }) => {
    var count = parseInt(value);
    if (count > 20) {
      // 选择文件夹并导出为 Excel (CSV 格式)
      try {
        const folder = await (window as any).electron.invoke('select-folder');
        if (!folder) {
          ElMessage({ type: "info", message: "已取消" });
          return;
        }
        const resp = await createUsers(props.serverName, count);
        if (resp.code !== 0) {
          ElMessage({ type: "error", message: getErrMsg(resp.code)});
          return;
        }
        const lines = ['用户名,密码', ...resp.data.map(u => `${u.username},${u.password}`)];
        const csv = lines.join('\r\n');
        const filename = `users_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        const ok = await (window as any).electron.invoke('save-file', folder, filename, csv);
        if (!ok) {
          ElMessage({ type: "error", message: "导出失败" });
          return;
        }
        ElMessage({ type: "success", message: `已导出到 ${folder}\\${filename}` });
        return;
      } catch (e) {
        ElMessage({ type: "error", message: "导出失败" });
        return;
      }
    }
    const resp = await createUsers(props.serverName, count);

    if (resp.code !== 0) {
      ElMessage({
        type: "error",
        message: getErrMsg(resp.code)
      })
      return;
    }
    newUsers.value = resp.data;
    showInfo.value = ShowType.newUsers;
  }).catch(() => {
    ElMessage({
      type: "info",
      message: "已取消"
    })
  });
}

async function setPublicRegisterF(to: boolean) {
  const resp = await setPublicRegister(props.serverName, to);

  if (!resp) {
    ElMessage({
      type: "error",
      message: "设置失败"
    })
    return;
  }
  ElMessage({
    type: "success",
    message: "设置完成"
  })
}

async function copyAcount(name: string, password: string) {
  await navigator.clipboard.writeText(`用户名：${name} 密码：${password}`);
  ElMessage({
    type: "success",
    message: "已复制账号信息"
  })
}

</script>

<template>
  <div>
    <el-scrollbar max-height="90%"></el-scrollbar>
    <el-button @click="createUsersF">生成账号</el-button>
    <el-scrollbar max-height="400px" style="background-color: #eee;width: 100%;padding: 5px;box-sizing: border-box;min-height: 100px;margin-top: 10px;margin-bottom: 10px;">
      <el-table :data="newUsers">
        <el-table-column prop="username" label="用户名"></el-table-column>
        <el-table-column label="复制">
          <template #default="{row}">
            <el-button @click="copyAcount(row.username, row.password)"><el-icon><DocumentCopy /></el-icon></el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-scrollbar>
    <el-button @click="setPublicRegisterF(true)">开启注册</el-button>
    <el-button @click="setPublicRegisterF(false)">关闭注册</el-button>
  </div>

</template>

<style scoped>

</style>