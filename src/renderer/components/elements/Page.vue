<template>
  <el-page-header @back="back" :icon="ArrowLeft">
    <template #content>
      <span class="text-large font-600 mr-3"> {{title}} </span>
    </template>
  </el-page-header>
  <component is="{{props.title}}"></component>
</template>

<script lang="ts" setup>
import { ArrowLeft } from '@element-plus/icons-vue'
import {useRouter} from "vue-router";

const props = defineProps({
  title: {
    type: String,
    required: true,
  }
})
const router = useRouter();

function back(){
  router.back();
}
</script>

<style scoped>

</style>