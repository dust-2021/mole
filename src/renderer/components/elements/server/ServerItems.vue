<script setup lang="ts">
import {useRouter} from "vue-router";
import {Services} from '../../../utils/stores'
import ServerBand from "../server/ServerBand.vue";
import {Plus, ArrowLeft} from '@element-plus/icons-vue'

const svr = Services();
const router = useRouter();
const props = defineProps({
  hideMiddle: {
    type: Function,
  }
})


async function newServer(): Promise<void> {
  await router.push('/addServer')
}
</script>

<template>
  <div style="height: 100%">
    <div style="border-bottom: 1px #eee solid;">
      <el-row :gutter="24" style="width: 100%;height: 100%">
        <el-col :span="8" class="container">
          <el-button  @click="newServer" class="btn">
            <el-icon :size="24"><Plus></Plus></el-icon>
          </el-button>
        </el-col>
        <el-col :span="8" class="container">
          <el-button @click="props.hideMiddle" class="btn"><el-icon :size="24"><ArrowLeft></ArrowLeft></el-icon></el-button>
        </el-col>
      </el-row>
    </div>

    <div style="height: 85%">
      <el-scrollbar :always="false" max-height="100%">
        <ServerBand v-for="item in svr.all" :server-name="item[0]" :cur-server="item[1]">
        </ServerBand>
      </el-scrollbar>
    </div>
  </div>

</template>

<style scoped>
.container {
  display: flex;
  justify-content: center;
  align-items: center;
}
.btn {
  margin: 5px;
  border: 0;
  border-radius: 30%;
}
</style>