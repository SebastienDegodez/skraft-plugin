import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/**
 * `require` in a cell: the packages of `.repl/` first (`.repl/package.json`, installed by the
 * developer under `.repl/node_modules/`), then those of the working copy.
 * @param {string} root the working copy @returns {(id: string) => unknown}
 */
export const projectRequire = (root) => {
  const fromRepl = createRequire(join(root, '.repl', 'package.json'))
  const fromRoot = createRequire(join(root, 'package.json'))
  return (id) => {
    try {
      return fromRepl(id)
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'MODULE_NOT_FOUND') throw error
      return fromRoot(id)
    }
  }
}

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
