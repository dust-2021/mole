import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";
import LoginView from "../components/LoginView.vue";
import MainLayout from "../components/MainLayout.vue";
import ServerHome from "../components/ServerHome.vue";
import RoomsList from "../components/RoomsList.vue";
import RoomView from "../components/RoomView.vue";
import RoomCreate from "../components/RoomCreate.vue";
import Settings from "../components/Settings.vue";

const routes: RouteRecordRaw[] = [
    {
        path: "/",
        name: "login",
        component: LoginView,
    },
    {
        path: "/main/:serverName",
        component: MainLayout,
        props: true,
        children: [
            { path: "", redirect: (to) => `/main/${to.params.serverName}/home` },
            { path: "home", component: ServerHome, props: true },
            { path: "rooms", component: RoomsList, props: true },
            { path: "settings", component: Settings, props: true },
            { path: "room/create", component: RoomCreate, props: true },
            { path: "room/:roomId", component: RoomView, props: true, name: "room" },
        ],
    },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

export default router;