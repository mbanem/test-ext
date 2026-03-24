import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'path'

export default defineConfig({
  plugins: [svelte()],
  // css: {
  //   preprocessorOptions: {
  //     scss: {
  //       additionalData: `
  //         @use "${resolve(__dirname, 'src/webview-ui/src/styles/mixins')}" as *;
  //         @use "${resolve(__dirname, 'src/webview-ui/src/styles/variables')}" as *;
  //       `,
  //       // Optional: silence charset warnings, etc.
  //       charset: false,
  //       // api: 'modern-compiler'  // if you want the new dart-sass compiler (optional)
  //     }
  //   }
  // },
  // resolve: {
  //   alias: {
  //     $lib: resolve('./src/webview-ui/src/lib')
  //   }
  // }
})