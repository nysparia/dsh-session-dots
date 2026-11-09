// Build both halves. Prefers esbuild (same toolchain as upstream) and falls
// back to build-plain.mjs when the environment cannot spawn esbuild's service
// process (locked-down sandboxes report EPERM).
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

mkdirSync('lib', { recursive: true })

const dshExternal = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-*']

async function withEsbuild() {
  const { build } = await import('esbuild')

  await build({
    entryPoints: ['src/index.js'],
    outfile: 'lib/index.js',
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node22'],
    sourcemap: true,
    external: dshExternal,
    logLevel: 'info',
  })

  await build({
    entryPoints: ['src/client/index.js'],
    outfile: 'lib/client.js',
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['es2022'],
    sourcemap: true,
    external: [...dshExternal, 'react', 'react-dom'],
    banner: {
      js: "window.__ModuleLoader__.load({ id: 'dsh-session-dots', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
    },
    footer: {
      js: 'return module.exports; } });',
    },
    logLevel: 'info',
  })
}

try {
  await withEsbuild()
  console.log('build complete via esbuild')
} catch (error) {
  console.warn('[build] esbuild unavailable (' + (error && error.code ? error.code : error) + '), using build-plain.mjs')
  await import(pathToFileURL('./build-plain.mjs').href)
}
