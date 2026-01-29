<script setup lang="ts">
import { ElCol, ElIcon, ElRow, ElScrollbar, ElText } from 'element-plus';
import {onBeforeMount, ref} from 'vue';
import { Room, roomer } from '../../../utils/roomController';
import { Close, Refresh, Switch } from '@element-plus/icons-vue';

    const props = defineProps({
        roomId: {
            type: String,
            required: true,
        }
    })

    const mounted = ref(false);
    let room :Room;
    onBeforeMount(async() => {
        const r =  await roomer.getRoom(props.roomId);
        if (r === undefined) {
            return;
        }
        room = r;
        mounted.value = true;
        
    })
</script>

<template>

 <ElScrollbar :always="false" v-if="mounted" style="width: 100%;">
    
        <div style="width: 100%;">
            <ElRow :gutter="24" v-for=" [k, v] of room.members.value" :key="k" style="height: 40px; margin: 5px; align-items: center;">
            <ElCol :span="16">
                <ElText size="large" :type="v.owner ? 'primary' : ''" :truncated="true">{{ v.name }}</ElText>
            </ElCol>
        <ElCol :span="8">
            <ElIcon :class="{'rotating-icon': v.directFlag === 0}" v-if="v.uuid !== room.selfUuid">
            <Refresh v-if="v.directFlag === 0" />
            <Switch v-if="v.directFlag === 1" />
            <Close v-if="v.directFlag === 2" />
            <svg v-if="v.directFlag === undefined">
                <use :href="`#icon-transfer`"></use>
            </svg>
        </ElIcon>
        </ElCol>
        </ElRow>
        </div>
 </ElScrollbar>
</template>

<style scoped>
.rotating-icon {
  animation: rotate 2s linear infinite;
}
</style>