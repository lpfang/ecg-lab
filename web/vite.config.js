import { defineConfig } from 'vite';

// public/ 下的数据文件不加指纹，用构建号作为 ?v= 参数，防止浏览器读到旧缓存
const BUILD_ID = Date.now().toString(36);

export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: { port: 5188, headers: { 'Cache-Control': 'no-cache' } },
  preview: { port: 5189, headers: { 'Cache-Control': 'no-cache' } },
});
