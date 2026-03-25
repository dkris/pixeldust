/**
 * SDK build script — invoked via `npm run build:sdk`
 * Bundles src/sdk/pixeldust-sdk.ts into a single IIFE for browser use.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const esbuild = require('esbuild') as typeof import('esbuild');
import path from 'path';

const outfile = path.resolve(__dirname, '../../dist/sdk/pixeldust.min.js');

esbuild
  .build({
    entryPoints: [path.resolve(__dirname, 'pixeldust-sdk.ts')],
    bundle: true,
    minify: true,
    format: 'iife',
    globalName: 'PixelDustSDK',
    target: ['es2020', 'chrome80', 'firefox75', 'safari13'],
    platform: 'browser',
    outfile,
    sourcemap: false,
    treeShaking: true,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  })
  .then(() => {
    console.log(`SDK bundle written to ${outfile}`);
  })
  .catch((err: Error) => {
    console.error('SDK build failed:', err);
    process.exit(1);
  });
