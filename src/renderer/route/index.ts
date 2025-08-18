import {createRouter, createWebHashHistory, RouteRecordRaw} from "vue-router";
import ServerPage from "../components/views/ServerPage.vue";
import ServerConfig from "../components/elements/server/ServerConfig.vue";
import Room from "../components/views/Room.vue";
import RoomCreator from "../components/elements/room/RoomCreator.vue";
import Setting from "../components/elements/system/Setting.vue";
import ServerItems from "../components/elements/server/ServerItems.vue";

const routes: RouteRecordRaw[] = [
    {
        path: "/server",
        children: [
            {path: '', components: {middle: ServerItems}},
            {path: 'add', components: {default: ServerConfig, middle: ServerItems}, props: true},
            {path: 'page/:serverName', components: {default: ServerPage, middle: ServerItems}, props: true},
            {
                path: "room",
                children: [
                    {path: 'page/:serverName/:roomId', components: {default: Room, middle: ServerItems}, props: true},
                    {path: 'create/:serverName', components: {default: RoomCreator, middle: ServerItems}, props: true},
                ]
            }
        ],
    },
    {
        path: "/test",
        children: []
    },
    {
        path: "/setting",
        component: Setting,
    }
];
const router = createRouter({
    history: createWebHashHistory(),
    routes
})
export default router;