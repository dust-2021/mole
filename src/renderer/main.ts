import { createApp } from 'vue';
import App from './App.vue';
import router from "./route";
import 'element-plus/dist/index.css';
import 'virtual:svg-icons-register';
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import {createPinia} from 'pinia'
import {initStore, saveStore} from "./utils/stores";

const app = createApp(App);
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
}
app.use(router);
app.use(createPinia());
app.mount('#app');
initStore();

app.onUnmount(() => {
    saveStore();
});
