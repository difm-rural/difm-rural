// Runs before `npm test` (the "pretest" script). A couple of tests render
// provider-web components with provider-web's own React, so its dependencies
// must be installed. On a fresh checkout they aren't — install them once from
// the lockfile. When they're already there this does nothing.
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const web = fileURLToPath(new URL('../../provider-web', import.meta.url))
const needed = ['react', 'react-dom'].map(name => `${web}/node_modules/${name}/package.json`)

if (!needed.every(existsSync)) {
  console.log('provider-web dependencies missing — installing them once (npm ci in provider-web)…')
  execSync('npm ci --no-audit --no-fund', { cwd: web, stdio: 'inherit' })
}
