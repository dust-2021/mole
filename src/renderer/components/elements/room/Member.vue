<script setup lang="ts">
import { ElCol, ElIcon, ElRow, ElScrollbar, ElTag, ElText } from 'element-plus';
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

 <ElScrollbar :always="false" v-if="mounted" style="height: 80%;">

            <ElRow style="height: 60px;margin: 5px; border: 1px solid #eee; border-radius: 5px;" 
            :gutter="24" v-for=" [k, v] of room.members.value" :key="k">
            <ElCol :span="16">
                <div style="width: 100%;height: 32px;">
                    <ElText style="height: 100%;" size="large" :type="v.owner ? 'primary' : ''" :truncated="true">{{ v.name }} <ElTag size="small" v-if="v.owner">主机</ElTag></ElText>
                </div>
                <div style="width: 100%;height: 16px;"><ElText style="height: 100%;" size="small"> vlan: {{ `${room.vlanPrefix}.${v.vlan >> 8}.${v.vlan & 0xff}` }}</ElText></div>
            </ElCol>
        <ElCol :span="8">
            <ElTag :type="v.directFlag === 1 ? 'success': 'warning'" v-if="v.uuid !== room.selfUuid" round>
                <ElIcon :class="{'rotating-icon': v.directFlag === 0}" >
            <Refresh v-if="v.directFlag === 0" />
            <Switch v-if="v.directFlag === 1" />
            <Close v-if="v.directFlag === 2" />
            <svg v-if="v.directFlag === undefined">
                <use :href="`#icon-transfer`"></use>
            </svg>
        </ElIcon>
            </ElTag>
        </ElCol>
        </ElRow>
 </ElScrollbar>
</template>

<style scoped>

.rotating-icon {
  animation: rotate 2s linear infinite;
}
</style>