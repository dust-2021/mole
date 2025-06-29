import {createRouter, createWebHashHistory} from "vue-router";
import ServerPage from "../components/views/ServerPage.vue";
import ServerConfig from "../components/elements/server/ServerConfig.vue";
import Room from "../components/elements/room/Room.vue";
import RoomCreator from "../components/elements/room/RoomCreator.vue";

const routes = [
    {
        path: "/server/:name",
        component: ServerPage,
        props: true,
        // meta: {key: route => route.fullPath},
    },
    {
        path: "/addServer",
        component: ServerConfig,
        props: true,
    },
    {
        path: "/room/page/:serverName/:roomId",
        component: Room,
        props: true,
    },
    {
        path: "/room/create/:serverName",
        component: RoomCreator,
        props: true,
    }
];
const router = createRouter({
    history: createWebHashHistory(),
    routes
})
export default router;