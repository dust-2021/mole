<script setup lang="ts">
import {getErrMsg, server, user} from '../../../utils/publicType'
import {Services} from "../../../utils/stores";
import {login, registerUser} from '../../../utils/api/http/user';
import {wgInfo} from '../../../utils/api/http/server';
import {ref, onBeforeMount, toRaw} from "vue";
import {useRouter} from "vue-router";
import {Plus, Refresh} from '@element-plus/icons-vue'
import DangerButton from "../DangerButton.vue";
import {ElMessageBox, ElMessage, ElFormItem, ElButton, ElInput} from "element-plus";

const isNew = ref(false);
const svr = Services();
const name = ref<string>("");
const newServer = ref<server>({
  host: "",
  port: 0,
  certify: false,
  users: []
});
const mounted = ref(false);
const router = useRouter();

// 弹出框控制
const newUserFlag = ref<boolean>(false);
const newUserInfo = ref<user>({
  username: '', password: '', userUuid: ''
});

// 注册弹出框
const registerFlag = ref<boolean>(false);
const registerInfo = ref({
  username: '', password: '', phone: '', email: ''
});

async function commitRegister() {
  if (!props.serverName) return;
  const resp = await registerUser(props.serverName, registerInfo.value.username, registerInfo.value.password,
    registerInfo.value.phone ? registerInfo.value.phone : '', registerInfo.value.email ? registerInfo.value.email : ''
  );
  if (resp !== 0) {
    ElMessage({
      type:"error", message: getErrMsg(resp)
    });
    
  } else {
    newServer.value.users.push({
      username: registerInfo.value.username,
      password: registerInfo.value.password,
      userUuid: ''
    });
  }
  registerInfo.value = {username: '', password: '', phone: '', email: ''};
  registerFlag.value = false;
}

function addNewUser() {
  newUserFlag.value = false;
  for (const u of newServer.value.users) {
    if (u.username === newUserInfo.value.username) {
      ElMessage({
        type: 'error',
        message: `用户${u.username}已存在!`
      })
      return;
    }
  }
  newServer.value.users.push(toRaw(newUserInfo.value));
  ElMessage({
    type: 'success',
    message: `账号添加成功`,
  })
  newUserInfo.value = {username: '', password: '', userUuid: ''}
}

// 传递名字则是修改，否则为新建
const props = defineProps({
  serverName: {
    type: String,
    required: false,
  }
})

async function add() {
  if (isNew.value) {
    svr.set(name.value, toRaw(newServer.value));
    await router.push("/server/page/" + name.value);
  }
}

async function remove() {
  if (isNew.value || !props.serverName) {
    return;
  }
  svr.delete(props.serverName);
  await router.push("/server");
}

// 选项卡切换默认账号时重新登录并修改
async function changeDefaultUser(u: user) {
  if (newServer.value.defaultUser && u.username === newServer.value.defaultUser.username || !props.serverName) {
    return;
  }
  const resp = await login(props.serverName, u.username, u.password);
  if (resp.code !== 0) {
    ElMessage({
      type: 'error',
      message: getErrMsg(resp.code),
    })
    return;
  }
  if (!resp.data) return;
  newServer.value.token = resp.data;
  // 登录后更新用户UUID，前端无法添加uuid
  u.userUuid = resp.data.userUuid;
  newServer.value.defaultUser = u;
  ElMessage({
    type: 'success',
    message: '账号信息切换至：' + newServer.value.defaultUser.username
  })
}

async function reLogin() {
  if (!props.serverName || !newServer.value.defaultUser) return;
  const resp = await login(props.serverName, newServer.value.defaultUser?.username, newServer.value.defaultUser?.password);
  if (resp.code !== 0) {
    ElMessage({
      type: 'error',
      message: getErrMsg(resp.code),
    })
    return;
  }
  if (!resp.data) return;
  newServer.value.token = resp.data;
  // 更新uuid信息
  newServer.value.defaultUser!.userUuid = resp.data.userUuid;
  ElMessage({
    type: 'success',
    message: 'token已刷新'
  });
  // 刷新wg信息
  const resp2 = await wgInfo(props.serverName);
  if (resp2.code !== 0) return;
  newServer.value.wgInfo = resp2.data;
}

async function deleteUser(index: number) {
  ElMessageBox.confirm(
      '是否删除该账号信息？',
      '',
      {
        confirmButtonText: "确认",
        cancelButtonText: "取消",
        type: 'warning',
      }
  )
      .then(() => {
        newServer.value.users.splice(index, 1);
      })
      .catch(() => {
      })
}


onBeforeMount(() => {
  if (props.serverName && svr.has(props.serverName)) {
    const s = svr.get(props.serverName);
    if (s) newServer.value = s;
  } else {
    isNew.value = true;
    newServer.value = {certify: false, host: "", port: 80, users: []};
  }
  mounted.value = true;
})

</script>

<template>
  <div style="padding: 10px">
    <el-form :model="newServer" style="max-width: 60%" label-width="auto" v-if="mounted">
      <el-form-item label="名称">
        <el-input v-model="name" :maxlength="8" :minlength="2" :disabled="!isNew"
                  :placeholder="props.serverName"></el-input>
      </el-form-item>
      <el-form-item label="HOST">
        <el-input v-model="newServer.host">
          <template #prepend>
            <el-select v-model="newServer.certify" style="width: 120px">
              <el-option :value="false" label="http://"></el-option>
              <el-option :value="true" label="https://"></el-option>
            </el-select>
          </template>
        </el-input>
      </el-form-item>
      <el-form-item label="PORT">
        <el-input-number v-model="newServer.port" :placeholder="newServer.certify ? '443': '80'" :min="0"
                         :max="2**16 -1"></el-input-number>
      </el-form-item>
      <el-form-item label="默认账号">
        <el-select :placeholder="newServer.defaultUser?.username"
                   @change="changeDefaultUser"
                   style="width: 180px">
          <el-option v-for="u in newServer.users" :value="u">{{ u.username }}</el-option>
        </el-select>
        <el-button :type="'primary'" @click="reLogin" style="margin-left: 5px">
          <el-icon>
            <Refresh></Refresh>
          </el-icon>
        </el-button>
      </el-form-item>
      <el-form-item label="账号">
        <span style="padding: 2px" v-for="(u, i) in newServer.users" :key="i"><el-tag
            @click="deleteUser(i)">{{ u.username }}</el-tag></span>
        <span style="padding: 2px">
          <el-tag><el-icon @click="newUserFlag = true"><Plus></Plus></el-icon></el-tag></span>
        <el-dialog title="添加账号" v-model="newUserFlag" width="400">
          <el-form :model="newUserInfo" label-width="auto" style="max-width: 60%">
            <el-form-item label="用户名：">
              <el-input v-model="newUserInfo.username" :maxlength="32"></el-input>
            </el-form-item>
            <el-form-item label="密码：">
              <el-input :type="'password'" v-model="newUserInfo.password" style="width: 160px; margin-top: 5px"
                        :minlength="6"
                        :maxlength="16"></el-input>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="newUserFlag = false">取消</el-button>
            <el-button :type="'primary'" @click="addNewUser">添加</el-button>
          </template>
        </el-dialog>
      </el-form-item>
      <!-- <el-form-item label="公钥">
        <ElText>{{ newServer.wgInfo?.publicKey }}</ElText>
      </el-form-item>
      <ElFormItem label="wg端口">{{ newServer.wgInfo?.listenPort }}</ElFormItem>
      <ElFormItem label="vlan网段">{{ `${newServer.wgInfo?.vlanIp[0]}.${newServer.wgInfo?.vlanIp[1]}.0.0/16` }}</ElFormItem> -->
      <el-form-item>
        <el-row :gutter="24">
          <el-col :span="12" v-if="isNew">
            <el-button type="primary" @click="add">提交</el-button>
          </el-col>
          <el-col :span="12" v-if="!isNew" style="display: flex;">
            <div style="margin-right: 5px;"><ElButton type="primary" @click="registerFlag = true">注册账号</ElButton>
            <el-dialog title="注册账号" v-model="registerFlag" width="400">
          <el-form :model="registerInfo" label-width="auto" style="max-width: 60%">
            <el-form-item label="用户名：" style="margin-top: 5px;">
              <el-input v-model="registerInfo.username" :maxlength="32"></el-input>
            </el-form-item>
            <el-form-item label="密码：" style="margin-top: 5px;">
              <el-input :type="'password'" v-model="registerInfo.password"
                        :minlength="6"
                        :maxlength="16"></el-input>
            </el-form-item>
            <ElFormItem label="手机号码：" style="margin-top: 5px;"><ElInput v-model="registerInfo.phone" :maxlength="11"></ElInput></ElFormItem>
            <ElFormItem label="邮箱：" style="margin-top: 5px;"><ElInput v-model="registerInfo.email" :maxlength="32"></ElInput></ElFormItem>
          </el-form>
          <template #footer>
            <el-button @click="registerFlag = false">取消</el-button>
            <el-button :type="'primary'" @click="commitRegister">注册</el-button>
          </template>
        </el-dialog></div>
            <div><DangerButton box-text="删除" message="是否确认删除该服务器信息？" @success="remove"></DangerButton></div>
          </el-col>
        </el-row>
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped>

</style>