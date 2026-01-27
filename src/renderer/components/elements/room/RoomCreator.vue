<script setup lang="ts">
import {ref, Ref, toRaw, watch} from "vue";
import {wsResp} from "../../../utils/publicType";
import {roomCreate, roomOut} from "../../../utils/api/ws/room";
import DangerButton from "../../elements/DangerButton.vue";
import {useRouter} from "vue-router";
import {ElMessage} from "element-plus";
import { roomer, member } from "../../../utils/roomController";
import { Connection } from "../../../utils/conn";

const props = defineProps({
  serverName: {
    type: String,
    required: true,
  }
})

const formData: Ref<{title: string, description: string, maxMember: number, ipBlackList: string[],
  userIdBlackList: number[], deviceBlackList: string[], autoClose: boolean, password?: string
}> = ref({
  title: '',
  description: '',
  maxMember: 16,
  ipBlackList: [],
  userIdBlackList: [],
  deviceBlackList: [],
  autoClose: false,
});

const router = useRouter();
const withPassword = ref(false);

watch(withPassword, (o: boolean, n: boolean) => {
  if (n){
    formData.value.password = '';
  } else {
    delete formData.value.password;
  }
})

async function submit() {
  await roomCreate(props.serverName,toRaw(formData.value),async (r: wsResp) => {
    if (r.statusCode !== 0) {
      ElMessage({
        type: "error", message: "创建失败:" + r.data
      })
      return
    };
    const data: {roomId: string, mates: member[]} = r.data;
    if (data.mates.length !== 1) {
      ElMessage({
        type: "error", message: "获取虚拟网络IP失败"
      })
      roomOut(props.serverName, data.roomId);
      return;
    }
    const room = await roomer.createRoom(Connection.getInstance(props.serverName), data.roomId, props.serverName, data.mates[0].vlan);
    if (room === null) {
      ElMessage({
        type: "error",
        message: "创建局域网失败",
      })
      return
    }
    await room.addMembers(data.mates);
    router.push(`/server/room/page/${props.serverName}/${data.roomId}`);
  })
}
</script>

<template>
  <div style="padding: 10px">
    <el-form :model="formData" style="max-width: 60%;" label-width="auto">
      <el-form-item label="标题">
        <el-input :maxlength="12" v-model="formData.title" style="width: 240px"></el-input>
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="formData.description" :type="'textarea'" placeholder="输入房间描述"></el-input>
      </el-form-item>
      <el-form-item label="最大成员数">
        <el-input-number v-model="formData.maxMember" :max="32" :min="2"></el-input-number>
      </el-form-item>
      <el-form-item label="房间密码">
        <div><el-switch v-model="withPassword"></el-switch></div>
        <div v-if="withPassword" style="margin-left: 5px">
          <el-input :type="'password'" v-model="formData.password" style="width: 120px"></el-input>
        </div>
      </el-form-item>
      <el-form-item label="房间自动关闭">
        <el-switch v-model="formData.autoClose"></el-switch>
      </el-form-item>
    </el-form>
    <DangerButton box-text="创建" message="是否创建房间?" @success="submit"></DangerButton>
  </div>
</template>

<style scoped>

</style>