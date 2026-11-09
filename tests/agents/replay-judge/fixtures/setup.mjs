import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { EXCLUDE, trackingDigest } from './verify.mjs'

// Builds one stimulus's repository in the current folder: its commits, pinned by
// identity and dates so every SHA the brief names is reproducible, and the replay
// logs the engine would have written for them. Then it hides the oracle in .git
// and removes its own inputs, so the judge sees a repository and its run folder.
//
//   node setup.mjs <scenario> <expected HEAD>   build into the current folder (the eval)
//   node setup.mjs --seeds <empty folder>        build every scenario there; print what to pin
//   node setup.mjs --pilot-runner eval …         the runner's Vally, narrowed to STIMULI, 1 run

const fixtures = dirname(fileURLToPath(import.meta.url))
const history = JSON.parse(readFileSync(join(fixtures, 'history.json'), 'utf8'))
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
for (const key of Object.keys(env)) {
  if (/^GIT_(?:AUTHOR_|COMMITTER_|DIR$|WORK_TREE$|INDEX_FILE$|COMMON_DIR$|OBJECT_DIRECTORY$|ALTERNATE_OBJECT_DIRECTORIES$|CONFIG_(?:COUNT|KEY_|VALUE_))/.test(key)) delete env[key]
}
const git = (cwd, args, extra = {}) => execFileSync('git', args, {
  cwd, env: { ...env, ...extra }, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
}).trimEnd()

const filesOf = (root, prefix = '') => readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name
  return entry.isDirectory() ? filesOf(root, path) : [path]
})

const overlay = (root, tree) => filesOf(join(fixtures, tree)).map((path) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  copyFileSync(join(fixtures, tree, path), join(root, path))
  return path
})

const commit = (root, { subject, date, trees }) => {
  const paths = trees.flatMap((tree) => overlay(root, tree))
  git(root, ['-c', 'core.attributesFile=/dev/null', 'add', '--chmod=-x', '--', ...paths])
  git(root, ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '--no-verify', '-m', subject], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date })
  return git(root, ['rev-parse', 'HEAD'])
}

// A replay's log holds the run at one commit; `named`, when given, is the commit whose short SHA
// names the file (the engine names a red's parent log after the red on a green's brief).
const writeReplay = (root, shas, { commit: index, named = index, label, log }) => {
  const sha = shas[index]
  const path = join(history.logs, `replay-${shas[named].slice(0, 7)}-${history.component}-${label}.log`)
  const text = readFileSync(join(fixtures, log), 'utf8').replaceAll('{{sha}}', sha).replaceAll('{{sha7}}', sha.slice(0, 7))
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
  return path.split('\\').join('/')
}

function build(root, scenario) {
  assert.ok(Object.hasOwn(history.scenarios, scenario), `Unknown scenario: ${scenario}`)
  assert.ok(!existsSync(join(root, '.git')), 'Refusing to build over an existing repository')
  const plan = history.scenarios[scenario]
  git(root, ['init', '--quiet', '--object-format=sha1', '--initial-branch=main', '--template='])
  for (const [key, value] of Object.entries({
    'user.name': history.identity.name, 'user.email': history.identity.email, 'core.autocrlf': 'false',
  })) git(root, ['config', key, value])
  mkdirSync(join(root, '.git', 'info'), { recursive: true })
  writeFileSync(join(root, '.git', 'info', 'exclude'), EXCLUDE)
  const shas = plan.commits.map((entry) => commit(root, entry))
  const logs = plan.replays.map((replay) => writeReplay(root, shas, replay))
  const stray = git(root, ['status', '--porcelain=v1', '--untracked-files=all']).split('\n').filter((line) => line && !line.startsWith('?? .fixture-input/'))
  assert.deepEqual(stray, [], 'The fixture left work outside its commits')
  return { scenario, head: shas.at(-1), commits: shas, logs, tracking: trackingDigest(root) }
}

function prepare(scenario, expectedHead) {
  const root = process.cwd()
  assert.equal(resolve(fixtures), resolve(root, '.fixture-input'), 'Run from the workspace root, staged as .fixture-input/setup.mjs')
  const built = build(root, scenario)
  assert.equal(built.head, expectedHead, `The fixture history drifted: built ${built.head}, the brief names ${expectedHead}; re-pin with --seeds`)
  mkdirSync(join(root, '.git', 'skraft-eval'), { recursive: true })
  copyFileSync(join(fixtures, 'verify.mjs'), join(root, '.git', 'skraft-eval', 'verify.mjs'))
  rmSync(fixtures, { recursive: true, force: true })
  return built
}

function seeds(folder) {
  assert.ok(folder, 'Usage: setup.mjs --seeds <empty folder>')
  const base = resolve(folder)
  assert.ok(!existsSync(base) || readdirSync(base).length === 0, 'The seeds folder must be empty')
  for (const scenario of Object.keys(history.scenarios)) {
    const root = join(base, scenario)
    mkdirSync(root, { recursive: true })
    const { head, commits, logs, tracking } = build(root, scenario)
    console.log(JSON.stringify({ scenario, head, commits, logs, tracking, root: relative(process.cwd(), root) }))
  }
}

// The runner narrows no agent suite. Keep it the entry point and append Vally's
// own filters: the one stimulus STIMULI names, one run.
function pilotArgs(args) {
  assert.equal(args[0], 'eval', 'Only the runner\'s eval invocation is supported')
  const value = (flag) => args[args.indexOf(flag) + 1]
  assert.equal(resolve(value('--eval-spec')), resolve(fixtures, '../eval.yaml'), 'Wrong suite')
  const scenario = process.env.STIMULI ?? ''
  assert.ok(Object.hasOwn(history.scenarios, scenario), `STIMULI must name one scenario: ${Object.keys(history.scenarios).join(', ')}`)
  assert.notEqual(process.env.BASELINE_CACHE, '1', 'A pilot never uses a cache')
  return [...args, '--tag', `scenario=${scenario}`, '--runs', '1']
}

const [mode, ...args] = process.argv.slice(2)
if (mode === '--pilot-runner') {
  const result = spawnSync('vally', pilotArgs(args), { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} else if (mode === '--seeds') seeds(args[0])
else console.log(JSON.stringify(prepare(mode, args[0])))
