import esbuild from 'esbuild';

async function run() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    platform: 'node',
    format: 'cjs',
    sourcemap: true,
    minify: false,

    // === ADD THIS INJECTION LINE ===
    define: {
      'globalThis.navigator': 'undefined',
      'navigator': 'undefined'
    },

    external: [
      'vscode'
    ],
    logLevel: 'info',
  });

  if (process.argv.includes('--watch')) {
    await ctx.watch();
    console.log('[esbuild] Watch mode active...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('[esbuild] Extension backend bundled successfully!');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
