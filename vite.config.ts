import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons';
import path from 'path';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig({
    plugins: [vue(),
        createSvgIconsPlugin({
            iconDirs: [path.join(process.cwd(), './src/assets/svg')],
            symbolId: 'icon-[name]',
        }),
        AutoImport({
            resolvers: [ElementPlusResolver()],
        }),
        Components({
            resolvers: [ElementPlusResolver()],
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src/renderer'), // 设置别名
        },
    },
    base: './', // 确保静态资源路径正确
    server: {
        port: 3000, // 开发服务器端口
        strictPort: true,
        host: '0.0.0.0',
    },
    build: {
        outDir: 'dist/renderer', // 构建输出目录
        emptyOutDir: true, // 构建前清空输出目录
    },
});