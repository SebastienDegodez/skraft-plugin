// Real working copies for the integration tests: temp folders, real Git repositories, the
// skill fixtures copied in, stub programs on a PATH of their own, and the skraft CLI run as a
// child process. No doubles.
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
export const PLUGIN_ROOT = join(REPO, 'plugins', 'skraft-framework')
export const CLI = join(PLUGIN_ROOT, 'engine', 'drivers', 'cli', 'skraft.mjs')

/** The skill fixtures `skraft doctor` must pass on. */
export const FIXTURES = Object.freeze({
  payment: join(REPO, 'tests', 'skills', 'clean-architecture-testing', 'fixtures', 'payment'),
  'payment-spring': join(REPO, 'tests', 'skills', 'clean-architecture-testing', 'fixtures', 'payment-spring'),
  'payment-fastapi': join(REPO, 'tests', 'skills', 'clean-architecture-python', 'fixtures', 'payment-fastapi'),
  react: join(REPO, 'tests', 'skills', 'clean-architecture-react', 'fixtures', 'vite-template'),
})

/** A temp folder removed after the test, by its real path (macOS links /var to /private/var). */
export const tempFolder = (t, prefix = 'skraft-it-') => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** @param {string} from @param {string} to */
export const copyFixture = (from, to) => {
  cpSync(from, to, { recursive: true, filter: (path) => !/[\\/](node_modules|bin|obj)([\\/]|$)/.test(path.slice(from.length)) })
  return to
}

/** @param {string} cwd @param {...string} args */
export const git = (cwd, ...args) => {
  const run = spawnSync('git', ['-c', 'user.name=skraft', '-c', 'user.email=skraft@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${run.stderr}`)
  return run.stdout.trim()
}

/** A repository on `main` with everything in it committed. @param {string} dir */
export const commitAll = (dir, message = 'initial') => {
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', message)
  return git(dir, 'rev-parse', 'HEAD')
}

/**
 * A folder of programs that exit 0 (`.cmd` under Windows), to stand for toolchains the
 * machine may not have.
 * @param {string} dir @param {string[]} names
 */
export const stubPrograms = (dir, names) => {
  mkdirSync(dir, { recursive: true })
  for (const name of names) {
    if (process.platform === 'win32') {
      writeFileSync(join(dir, `${name}.cmd`), '@exit /b 0\r\n')
    } else {
      writeFileSync(join(dir, name), '#!/bin/sh\nexit 0\n')
      chmodSync(join(dir, name), 0o755)
    }
  }
  return dir
}

/** process.env with PATH replaced (whatever its case under Windows). @param {string[]} folders */
export const envWithPath = (folders) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH'))
  return { ...env, PATH: folders.join(delimiter) }
}

/** The folders of the programs these tests need for real: node and git. */
export const toolFolders = () => [dirname(process.execPath), ...gitFolder()]
const gitFolder = () => {
  const where = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' })
  return where.status === 0 ? [dirname(where.stdout.split(/\r?\n/)[0].trim())] : []
}

/**
 * @param {string} cwd @param {string[]} args @param {{ env?: NodeJS.ProcessEnv }} [options]
 * @returns {{ status: number | null, stdout: string, stderr: string }}
 */
export const skraft = (cwd, args, { env = process.env } = {}) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env })

export const readJson = (/** @type {string} */ path) => JSON.parse(readFileSync(path, 'utf8'))
export const journal = (/** @type {string} */ cwd, /** @type {string} */ slug) =>
  readFileSync(join(cwd, '.copilot-tracking', 'skraft-plans', slug, 'events.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
