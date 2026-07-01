<template>
  <router-view v-slot="{ Component, route: r }">
    <transition name="login" mode="out-in" v-if="r.path === '/'">
      <component :is="Component" />
    </transition>
    <component :is="Component" v-else />
  </router-view>
</template>

<script setup lang="ts">
// App 根组件，仅负责路由出口
// 登录页使用 fade+scale 过渡，主界面直接渲染
</script>

<style>
@import './styles/variables.css';
@import './styles/global.css';
@import './styles/transitions.css';
</style>