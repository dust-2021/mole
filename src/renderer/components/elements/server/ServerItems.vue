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
    <div style="height: 10%; border-bottom: 1px #eee solid;">
      <el-row :gutter="24">
        <el-col :span="8">
          <el-button  @click="newServer">
            <el-icon><Plus></Plus></el-icon>
          </el-button>
        </el-col>
        <el-col :span="8">
          <el-button @click="props.hideMiddle"><el-icon><ArrowLeft></ArrowLeft></el-icon></el-button>
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

</style>