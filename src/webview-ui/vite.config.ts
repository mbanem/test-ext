import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    svelte({
      // Important for Svelte 5 + SCSS
      preprocess: {
        style: ({ content, attributes }) => {
          if (attributes.lang !== 'scss') {
            return
          }
          // We let Vite handle SCSS via css.preprocessorOptions
          return { code: content }
        },
      },
    }),
  ],

  base: './',

  resolve: {
    alias: {
      $lib: resolve(__dirname, 'src/lib'),
    },
  },

  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `
          @use "${resolve(__dirname, 'src/lib/styles/variables.scss')}" as *;
          @use "${resolve(__dirname, 'src/lib/styles/mixins.scss')}" as *;
        `,
      },
    },
  },

  build: {
    outDir: resolve(__dirname, '../../out/webview-assets'),
    emptyOutDir: true,
    sourcemap: 'inline',
    minify: false,
  },

  server: {
    port: 5174,
    strictPort: true,
    hmr: true,
    // === ADD THESE ===
    cors: true, // simplest way
    // or more explicit:
    // cors: {
    //   origin: '*',
    // },
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
})
