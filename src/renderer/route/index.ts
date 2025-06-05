import {createRouter, createWebHashHistory} from "vue-router";
import ServerPage from "../components/views/ServerPage.vue";
import ServerConfig from "../components/elements/server/ServerConfig.vue";
import Room from "../components/elements/room/Room.vue";

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
        path: "/room/:serverName/:id",
        component: Room,
        props: true,
    }
];
const router = createRouter({
    history: createWebHashHistory(),
    routes
})
export default router;