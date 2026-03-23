import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'path'

export default defineConfig({
  plugins: [svelte({

    onwarn: (warning, handler) => {
      if (warning.code === 'tsconfig.json' && warning.message.includes('Cannot find base config file')) {
        return // silence this specific warning
      }
      handler(warning)
    }
  })],
  resolve: {
    alias: {
      $lib: resolve(__dirname, './src/lib')
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `
          @use "$lib/styles/variables" as *;
          @use "$lib/styles/mixins" as *;
        `,
        // additionalData: `
        //   @use "${resolve(__dirname, 'src/lib/styles/mixins')}" as *;
        //   @use "${resolve(__dirname, 'src/lib/styles/variables')}" as *;
        // `,
        // Optional: silence charset warnings, etc.
        charset: false,
      }
    }
  },
  build: {
    outDir: resolve(__dirname, '../../out/webview-assets'),   // important: output inside extension's out folder
    emptyOutDir: true,
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: true,
    manifest: true,
    rollupOptions: {
      input: {
        OrmZero: resolve(__dirname, 'OrmZero.html'),
        OrmOne: resolve(__dirname, 'OrmOne.html'),
        OrmTwo: resolve(__dirname, 'OrmTwo.html'),
        OrmThree: resolve(__dirname, 'OrmThree.html'),
      },
      output: {
        // Optional: cleaner asset names (without too long hashes)
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },

  // Optional: better paths in dev
  server: {
    port: 5173,
    strictPort: true,
  },
})