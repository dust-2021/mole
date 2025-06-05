<script setup lang="ts">
import {ref, onBeforeMount} from "vue";
import {server} from '../../utils/ipcTypes'
import {Services} from "../../utils/stores";
import RoomList from "../elements/room/RoomList.vue";
import ServerConfig from "../elements/server/ServerConfig.vue";

const props = defineProps({
  name: {
    type: String,
    required: true,
  }
})
let isMounted = ref(false);
let svr = ref<server>(null);
const services = Services();

onBeforeMount(async () => {
  svr.value = services.get(props.name);
  isMounted.value = true;
});

</script>

<template>
  <div style="height: 100%" v-if="isMounted">
    <el-tabs style="height: 100%; padding: 0 2%">
      <el-tab-pane label="首页">
        <RoomList :server-name="props.name"></RoomList>
      </el-tab-pane>
      <el-tab-pane label="设置">
        <ServerConfig :server-name="props.name"></ServerConfig>
      </el-tab-pane>
    </el-tabs>

  </div>
</template>

<style scoped>

</style>