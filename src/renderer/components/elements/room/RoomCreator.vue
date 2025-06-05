<script setup lang="ts">
  import {ref} from "vue";

  const props = defineProps({
    serverName: {
      type: String,
      required: true,
    }
  })

  const formData = ref({
    title: '',
    description: '',
    maxMember: 16,
    password: '',
    ipBlackList: [],
    userIdBlackList: [],
    deviceBlackList: [],
    autoClose: false,
  });
</script>

<template>
  <el-form :model="formData">

  </el-form>
</template>

<style scoped>

</style>