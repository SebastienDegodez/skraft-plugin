import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/**
 * `require` in a cell: the packages of `.repl/` first (`.repl/package.json`, installed by the
 * developer under `.repl/node_modules/`), then, as Node walks up from there, those of the working
 * copy. A package found that fails to load its own dependency fails: no other one stands in for it.
 * @param {string} root the working copy @returns {(id: string) => unknown}
 */
export const projectRequire = (root) => createRequire(join(root, '.repl', 'package.json'))

/**
 * Whether `.repl/package.json` names packages that are not installed: it has dependencies and
 * `.repl/node_modules/` is absent.
 * @param {string} root the working copy
 */
export const notInstalled = (root) => {
  const manifest = join(root, '.repl', 'package.json')
  return existsSync(manifest) && namesPackages(manifest) && !existsSync(join(root, '.repl', 'node_modules'))
}

/** @param {string} manifest */
const namesPackages = (manifest) => {
  try {
    const { dependencies } = JSON.parse(readFileSync(manifest, 'utf8'))
    return typeof dependencies === 'object' && dependencies !== null && Object.keys(dependencies).length > 0
  } catch {
    return false
  }
}
