// Fallback build with no external tooling.
//
// esbuild drives its service through a child process; in a locked-down
// environment that cannot spawn children with piped stdio, the build fails with
// EPERM. Our client half is two small first-party files with no third-party
// imports, so a deterministic text bundle is enough: strip the `export` keywords
// and the local `import` line, then wrap the result in the ModuleLoader
// handshake the web shell expects.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

mkdirSync('lib', { recursive: true })

writeFileSync('lib/index.js', readFileSync('src/index.js', 'utf8'))

const logic = readFileSync('src/client/logic.js', 'utf8').replace(/^export /gm, '')
const client = readFileSync('src/client/index.js', 'utf8').replace(/^import .*$/gm, '')

const banner =
  "window.__ModuleLoader__.load({ id: 'dsh-session-dots', factory: (require) => { var module = { exports: {} }; var exports = module.exports;\n"
const footer = '\nreturn module.exports; } });\n'

writeFileSync('lib/client.js', banner + logic + '\n' + client + footer)

console.log('fallback build complete: lib/index.js + lib/client.js')
