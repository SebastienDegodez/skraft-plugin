#!/usr/bin/env node
// One engine for the two standalone plugins (#621). Each plugin installs alone, so each ships its
// engine; skraft-design's is the source and skraft-deliver's is its copy, written with the
// plugin's own names, except the files scripts/standalone-engine.json says one plugin owns, and those it
// lists as pending: shared files whose two versions still differ, each to merge into the source.
//
//   node scripts/standalone-engine.mjs --check        lists every copy that differs from its source
//   node scripts/standalone-engine.mjs --sync         writes every copy from its source
//   node scripts/standalone-engine.mjs --diff <path>  shows how one copy differs, path relative to the engine
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SKIPPED = new Set(['node_modules', '.stryker-tmp', 'reports'])

/** The names skraft-design gives what skraft-deliver names otherwise, in the order they are replaced. */
const NAMES = Object.freeze([
  ['skraft-design', 'skraft-deliver'],
  ['skraft_design', 'skraft_deliver'],
  ['SKRAFT_DESIGN', 'SKRAFT_DELIVER'],
  ['Skraft Design', 'Skraft Deliver'],
  ['design-', 'deliver-'],
])

/**
 * Words both plugins write alike though they hold a name: the DESIGN phase's records check, its
 * module and its code; a delivery's light design, its modules, plan and question.
 */
const KEPT = Object.freeze(['design-records', 'light-design'])

/** A source file's text as its copy holds it. @param {string} text */
export const translate = (text) => {
  const held = KEPT.reduce((current, word, index) => current.replaceAll(word, `\u0000${index}\u0000`), text)
  const named = NAMES.reduce((current, [from, to]) => current.replaceAll(from, to), held)
  return KEPT.reduce((current, word, index) => current.replaceAll(`\u0000${index}\u0000`, word), named)
}

/** Every file under a folder, relative to it with `/`, its dependencies and generated folders left out. @param {string} folder */
export const filesUnder = (folder, inner = '') => readdirSync(join(folder, inner), { withFileTypes: true }).flatMap((entry) => {
  if (SKIPPED.has(entry.name)) return []
  const path = inner === '' ? entry.name : `${inner}/${entry.name}`
  return entry.isDirectory() ? filesUnder(folder, path) : [path]
}).sort()

/**
 * What the copy should hold and what it holds otherwise.
 * @param {{ source: string, copy: string, ownedBySource: string[], ownedByCopy: string[], ownedByBoth?: string[], pending?: string[] }} config folders relative to root
 *   ownedByBoth: a file each plugin writes its own version of, such as its MCP tools
 * @param {string} root
 * @returns {{ differing: string[], missing: string[], unowned: string[], expected: Map<string, string> }}
 *   differing: copies whose text is not their source's; missing: copies the copy lacks;
 *   unowned: files only the copy holds that it does not own; expected: each copy's text, by path
 */
export const compareEngines = (config, root = ROOT) => {
  const [source, copy] = [join(root, config.source), join(root, config.copy)]
  const owned = new Set([...config.ownedBySource, ...config.ownedByCopy, ...(config.ownedByBoth ?? []), ...(config.pending ?? [])])
  const shared = filesUnder(source).filter((path) => !owned.has(path))
  const expected = new Map(shared.map((path) => [path, translate(readFileSync(join(source, path), 'utf8'))]))
  const held = new Set(filesUnder(copy))
  return {
    differing: shared.filter((path) => held.has(path) && readFileSync(join(copy, path), 'utf8') !== expected.get(path)),
    missing: shared.filter((path) => !held.has(path)),
    unowned: [...held].filter((path) => !expected.has(path) && !owned.has(path)),
    expected,
  }
}

const readConfig = () => JSON.parse(readFileSync(join(ROOT, 'scripts/standalone-engine.json'), 'utf8'))

const check = (config) => {
  const { differing, missing, unowned } = compareEngines(config)
  const lines = [...differing.map((path) => `differs from its source: ${path}`), ...missing.map((path) => `missing: ${path}`),
    ...unowned.map((path) => `only in ${config.copy}, and not in ownedByCopy: ${path}`)]
  for (const line of lines) console.error(line)
  const pending = config.pending?.length ? `; ${config.pending.length} file(s) still to merge (pending)` : ''
  console.log(lines.length === 0 ? `Standalone engines: in step${pending}` : `Standalone engines: ${lines.length} problem(s); run npm run standalone:sync, or list a file a plugin owns in scripts/standalone-engine.json`)
  return lines.length === 0 ? 0 : 1
}

const sync = (config) => {
  const { differing, missing, unowned, expected } = compareEngines(config)
  for (const path of [...differing, ...missing]) {
    const target = join(ROOT, config.copy, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, /** @type {string} */ (expected.get(path)))
  }
  console.log(`Standalone engines: ${differing.length + missing.length} file(s) written`)
  for (const path of unowned) console.error(`only in ${config.copy}, and not in ownedByCopy: ${path}`)
  return unowned.length === 0 ? 0 : 1
}

const showDiff = (config, path) => {
  const { expected } = compareEngines({ ...config, pending: (config.pending ?? []).filter((one) => one !== path) })
  if (!expected.has(path)) return console.error(`${path} is no shared file`), 1
  const scratch = join(ROOT, 'artifacts', 'standalone-engine', path)
  mkdirSync(dirname(scratch), { recursive: true })
  writeFileSync(scratch, /** @type {string} */ (expected.get(path)))
  const copy = join(ROOT, config.copy, path)
  const shown = spawnSync('git', ['diff', '--no-index', '--', relative(ROOT, scratch), existsSync(copy) ? relative(ROOT, copy) : '/dev/null'], { cwd: ROOT, stdio: 'inherit' })
  return shown.status === 0 ? 0 : 0
}

const main = () => {
  const [mode, path] = process.argv.slice(2)
  const config = readConfig()
  if (mode === '--check') return check(config)
  if (mode === '--sync') return sync(config)
  if (mode === '--diff' && path) return showDiff(config, path)
  console.error('usage: node scripts/standalone-engine.mjs --check | --sync | --diff <path>')
  return 2
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main()
