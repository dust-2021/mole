import {createRouter, createWebHashHistory} from "vue-router";
import ServerPage from "../components/views/ServerPage.vue";

const routes = [
    {
        path: "/server/:name",
        component: ServerPage,
        props: true,
    }
];
const router = createRouter({
    history: createWebHashHistory(),
    routes
})
export default router;