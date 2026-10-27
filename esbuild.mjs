import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'fs';

// Codicons ship with the extension (no CDN); copied from the dev dependency.
mkdirSync('media/codicons', { recursive: true });
for (const f of ['codicon.css', 'codicon.ttf']) {
  cpSync(`node_modules/@vscode/codicons/dist/${f}`, `media/codicons/${f}`);
}

const production = process.argv.includes('--production');

await build({
  entryPoints: ['src/host/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  // jsonc-parser's default (UMD) entry loads its parts with a dynamic require that cannot be bundled; its ESM build can.
  mainFields: ['module', 'main'],
  sourcemap: true,
  minify: production,
});

// The webview script lives in media/, the only folder the webview may load from.
await build({
  entryPoints: ['src/webview/main.ts'],
  outfile: 'media/webview.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  sourcemap: !production,
  minify: production,
});
