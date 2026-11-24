// Which installs a checkout lacks before the local CI runs: a fresh worktree has none, and its
// failures would otherwise read as broken tests. The root lockfile is ignored (.gitignore), so
// the root installs with `npm install`; the engine's and the handbook's lockfiles are committed,
// so `npm ci`.
import { join } from 'node:path'

const ENGINE = join('plugins', 'skraft-framework', 'engine')
const posix = (path) => path.split('\\').join('/')

const INSTALLS = [
  { dir: 'node_modules', command: 'npm install', needs: 'Playwright, the repository tooling, dashboard and backlog tests' },
  { dir: join(ENGINE, 'node_modules'), command: `npm ci --prefix ${posix(ENGINE)}`, needs: 'the engine lint, the skill script tests and the configuration schema parity test' },
  { dir: join('docs', 'website', 'node_modules'), command: 'npm ci --prefix docs/website', needs: 'the workflow viewer test and the handbook build' },
]

/** @param {(dir: string) => boolean} exists */
export const missingInstalls = (exists) =>
  INSTALLS.filter((install) => !exists(install.dir)).map((install) => ({
    command: install.command,
    text: `${install.needs} need packages that are not installed: run \`${install.command}\` first, or expect them to fail.`,
  }))
