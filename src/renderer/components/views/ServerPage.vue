<script setup lang="ts">
import {ref, onBeforeMount, computed} from "vue";
import {server} from '../../utils/publicType'
import {Services} from "../../utils/stores";
import RoomList from "../elements/room/RoomList.vue";
import ServerConfig from "../elements/server/ServerConfig.vue";
import ServerAdmin from "../elements/server/ServerAdmin.vue";

const props = defineProps({
  serverName: {
    type: String,
    required: true,
  }
})
let isMounted = ref(false);
let svr = ref<server>(null);
const services = Services();

onBeforeMount(async () => {
  svr.value = services.get(props.serverName);
  isMounted.value = true;
});

</script>

<template>
  <div style="height: 100%" v-if="isMounted">
    <el-tabs style="height: 100%; padding: 0 2%">
      <el-tab-pane label="首页" style="height: 100%">
        <RoomList :server-name="props.serverName"></RoomList>
      </el-tab-pane>
      <el-tab-pane label="管理" v-if="false">
        <ServerAdmin :server-name="props.serverName"></ServerAdmin>
      </el-tab-pane>
      <el-tab-pane label="设置">
        <ServerConfig :server-name="props.serverName"></ServerConfig>
      </el-tab-pane>
    </el-tabs>

  </div>
</template>

<style scoped>

</style>