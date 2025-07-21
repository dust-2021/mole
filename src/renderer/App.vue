<template>
  <el-container style="height: 100vh; margin: 0;">
    <el-header height="36px" style="padding: 0 0 0 10px; border-bottom: 1px solid #eee">
      <div class="title-bar">
        <div style="width: 70px; padding-left: 10px; padding-top: 2px;padding-bottom: 3px">
          <svg width="40px" height="30px">
            <use :href="`#icon-mole`"></use>
          </svg>
        </div>
        <div class="controls">
          <el-button @click="handle('main-min')">
            <el-icon :size="16">
              <Minus></Minus>
            </el-icon>
          </el-button>
          <!--          <el-button @click="handle('main-max')">-->
          <!--            <el-icon :size="16">-->
          <!--              <Crop></Crop>-->
          <!--            </el-icon>-->
          <!--          </el-button>-->
          <el-button @click="handle('main-close')">
            <el-icon :size="16">
              <Close></Close>
            </el-icon>
          </el-button>
        </div>
      </div>
    </el-header>

    <el-container style="height: 612px">
      <el-aside width="80px" style="border-right: 1px solid #eee">
        <IconButton icon="server" @click="toggleShow(`server`)"></IconButton>
<!--        <IconButton icon="hall" @click="toggleShow(`hall`)"></IconButton>-->
<!--        <IconButton icon="connectGame" @click="toggleShow(`connectGame`)"></IconButton>-->
        <IconButton icon="setting" @click="toggleShow(`setting`)"></IconButton>
      </el-aside>
      <el-aside width="200px" style="border-right: 1px solid #eee" v-show="show !== ''">
        <ServerItems v-show="show === `server`" :hideMiddle="hideMiddle"></ServerItems>
      </el-aside>
      <el-main style="padding: 0;overflow: hidden;height: 100%">
        <router-view :key="$route.fullPath"></router-view>
      </el-main>
    </el-container>
  </el-container>

</template>

<script setup lang="ts">
import IconButton from "./components/elements/IconButton.vue";
import {Close, Crop, Minus} from "@element-plus/icons-vue";
import {ref} from "vue";
import ServerItems from "./components/elements/server/ServerItems.vue";
import {useRouter} from "vue-router";
import {ipcSend, ipcOn} from "./utils/publicType";
import {ElMessage} from 'element-plus'

async function handle(msg: string): Promise<void> {
  await ipcSend(msg);
}

ipcOn('msg', (msg: string, type: string) => {
  ElMessage({
    showClose: true,
    message: msg,
    type: type,
  } as any)
})

let router = useRouter();
let show = ref('');

function toggleShow(target: string) {
  if (show.value === target) {
    router.push('/');
    show.value = '';
    return;
  }
  show.value = target;
}

function hideMiddle() {
  show.value = '';
}

</script>

<style scoped>
.title-bar {
  -webkit-app-region: drag;
  height: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.controls button {
  -webkit-app-region: no-drag;
  background: none;
  border: none;
  cursor: pointer;
  margin: 0;
}
</style>