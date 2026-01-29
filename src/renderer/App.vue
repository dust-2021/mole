<template>
  <el-container style="height: 100vh; margin: 0;">
    <el-header height="36px" style="padding: 0 0 0 10px;">
      <div class="title-bar">
        <div style="width: 70px; padding-left: 10px; padding-top: 2px;padding-bottom: 3px">
          <svg width="40px" height="30px">
            <use :href="`#icon-mole`"></use>
          </svg>
        </div>
        <div class="controls">
          <el-button @click="ipcSend('main-min')">
            <el-icon :size="16">
              <Minus></Minus>
            </el-icon>
          </el-button>
          <!--          <el-button @click="handle('main-max')">-->
          <!--            <el-icon :size="16">-->
          <!--              <Crop></Crop>-->
          <!--            </el-icon>-->
          <!--          </el-button>-->
          <el-button @click="shutdown">
            <el-icon :size="16">
              <Close></Close>
            </el-icon>
          </el-button>
        </div>
      </div>
    </el-header>

    <el-container style="height: 612px;display: flex;justify-content: center;">
      <el-aside width="80px" style="border-right: 1px solid #eee;justify-items: center">
        <div class="icon-container">
          <IconButton icon="server" @click="router.push('/server'); show = true" btn-size="large"></IconButton>
        </div>
        <div class="icon-container">
          <IconButton icon="setting" @click="router.push('/setting'); show= true" btn-size="large"></IconButton>
        </div>
      </el-aside>
      <!--      悬浮按钮-->
      <el-button size="small" class="float-btn" @click="show = !show">
        <el-icon>
          <ArrowRight v-if="show"></ArrowRight>
          <ArrowDown v-else></ArrowDown>
        </el-icon>
      </el-button>
      <el-aside width="200px" style="border-right: 1px solid #eee" v-show="show">
        <router-view name="middle" v-slot="{Component}">
          <keep-alive><component :is="Component"></component></keep-alive>
        </router-view>
      </el-aside>
      <el-main style="padding: 0;overflow: hidden;height: 100%">
        <router-view :key="$route.fullPath"></router-view>
      </el-main>
    </el-container>
  </el-container>

</template>

<script setup lang="ts">
import IconButton from "./components/elements/IconButton.vue";
import {Close, Minus, ArrowDown, ArrowRight} from "@element-plus/icons-vue";
import {useRouter} from "vue-router";
import {ipcSend} from "./utils/publicType";
import {saveStore} from "./utils/stores";
import {ref} from "vue";

function shutdown() {
  saveStore();
  ipcSend('main-close').then(() => {
  })
}

let router = useRouter();
const show = ref<boolean>(false);

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

.icon-container {
  margin-top: 5px;
}

.float-btn {
  width: 28px;
  height: 28px;
  position: absolute;
  top: 50%;
  left: 80px;
  z-index: 100;
  transform: translate(-50%, -50%);
  background-color: lightgray;
  color: white;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}
</style>