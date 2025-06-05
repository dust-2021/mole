<script setup lang="ts">
import {server} from '../../../utils/ipcTypes'
import {Services} from "../../../utils/stores";
import {ref, onBeforeMount, toRaw} from "vue";
import {useRouter} from "vue-router";
import {Plus} from '@element-plus/icons-vue'
import DangerButton from "../DangerButton.vue";

const isNew = ref(false);
const svr = Services();
const name = ref<string>("");
const newServer = ref<server>(null);
const mounted = ref(false);
const router = useRouter();

// 传递名字则是修改，否则为新建
const props = defineProps({
  serverName: {
    type: String,
    required: false,
  }
})

async function add() {
  if (isNew.value) {
    await svr.set(name.value, toRaw(newServer.value));
    await router.push("/server/" + name.value);
  }
}

async function remove() {
  if (isNew.value) {
    return;
  }
  await svr.delete(props.serverName);
  await router.push("/");
}


onBeforeMount(() => {
  if (props.serverName && svr.has(props.serverName)) {
    newServer.value = svr.get(props.serverName);
  } else {
    isNew.value = true;
    newServer.value = {host: "", port: 80, users: []};
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
        </el-input>
      </el-form-item>
      <el-form-item label="PORT">
        <el-input v-model="newServer.port" type="number" placeholder="80"></el-input>
      </el-form-item>
      <el-form-item label="默认账号">
        <el-select :placeholder="newServer.defaultUser?.username" style="width: 180px">
          <el-option v-for="u in newServer.users" :value="u">{{ u.username }}</el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="账号">
        <span style="padding: 2px" v-for="u in newServer.users"><el-tag>{{ u.username }}</el-tag></span>
        <span style="padding: 2px">
          <el-tag><el-icon><Plus></Plus></el-icon></el-tag></span>
      </el-form-item>
      <el-form-item>
        <el-row :gutter="24">
          <el-col :span="12" v-if="isNew">
            <el-button type="primary" @click="add">提交</el-button>
          </el-col>
          <el-col :span="12" v-if="!isNew">
            <DangerButton box-text="删除" message="是否确认删除该服务器信息？" @success="remove"></DangerButton>
          </el-col>
        </el-row>
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped>

</style>