// TypeScript resolve harness for the test suite. Load it with:
//   node --import ./tests/support/ts-resolve.mjs <file>
// (`npm test` does this for you.)
//
// Node strips TypeScript types natively, but it won't guess file extensions.
// The shared modules import each other the way the app bundlers allow
// (e.g. `from './listingEstimate'`), so resolve an extensionless relative
// import to its `.ts` file when one exists.
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]sx?$/i.test(specifier) && context.parentURL?.startsWith('file:')) {
      try {
        const url = new URL(specifier + '.ts', context.parentURL)
        if (existsSync(fileURLToPath(url))) return nextResolve(specifier + '.ts', context)
      } catch {}
    }
    return nextResolve(specifier, context)
  },
})
