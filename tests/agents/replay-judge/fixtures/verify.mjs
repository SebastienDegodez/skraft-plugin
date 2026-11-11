import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Loaded only after the spec authenticates its bytes. It reads the agent's final
// message as the engine reads a judge's answer, and the repository as the engine
// left it; nothing the agent writes is taken as proof.

export const TRACKING = '.copilot-tracking'
// Harness folders the repository never tracks: the engine's run files, and the
// session state the executor may keep in the workspace.
export const EXCLUDE = `/${TRACKING}/\n/.copilot-sdk/\n`

const DECISIONS = ['accept', 'send-back', 'retry', 'ask-human']
const KEYS = ['decision', 'note']
const FENCE = /^[ \t]*```[\w-]*[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*$/gm
const ENTRY = /^([A-Za-z_][\w-]*):(?:[ \t]+(.*))?$/
const BLOCK = /^[|>][-+]?[ \t]*(?:#.*)?$/

const filesUnder = (root, prefix = '') => readdirSync(join(root, prefix)).flatMap((name) => {
  const path = prefix ? `${prefix}/${name}` : name
  const stat = lstatSync(join(root, path))
  assert.ok(!stat.isSymbolicLink(), `unexpected symlink: ${path}`)
  return stat.isDirectory() ? filesUnder(root, path) : [path]
}).sort()

/** One digest over every file the engine's run folder holds: path and bytes. */
export const trackingDigest = (workspace) => {
  const root = join(workspace, TRACKING)
  const digest = createHash('sha256')
  for (const path of existsSync(root) ? filesUnder(root) : []) {
    digest.update(`${path}\0${createHash('sha256').update(readFileSync(join(root, path))).digest('hex')}\n`)
  }
  return digest.digest('hex')
}

const scalarOf = (rest) => {
  if (rest === '' || rest === '~' || rest === 'null') return null
  const double = /^"((?:[^"\\]|\\.)*)"[ \t]*(?:#.*)?$/.exec(rest)
  if (double) return JSON.parse(`"${double[1]}"`)
  const single = /^'((?:[^']|'')*)'[ \t]*(?:#.*)?$/.exec(rest)
  if (single) return single[1].replaceAll("''", "'")
  return rest.replace(/[ \t]+#.*$/, '')
}

// The engine's reading: the last fenced block of the final message (the whole
// message when it has none), top-level `key: value` lines, the two keys of the
// contract and nothing else, a decision among four and a note that says something.
export const readVerdict = (answer) => {
  const source = ([...answer.matchAll(FENCE)].at(-1)?.[1] ?? answer).trim()
  const lines = source.split(/\r?\n/)
  const fields = {}
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const entry = ENTRY.exec(line)
    assert.ok(entry, `the verdict holds a line that is not \`key: value\`: ${JSON.stringify(line)}`)
    const [, key, rest = ''] = entry
    assert.ok(!Object.hasOwn(fields, key), `the verdict repeats ${key}`)
    if (!BLOCK.test(rest.trim())) {
      fields[key] = scalarOf(rest.trim())
      continue
    }
    const parts = []
    while (index + 1 < lines.length && (lines[index + 1].trim() === '' || /^[ \t]/.test(lines[index + 1]))) parts.push(lines[(index += 1)].trim())
    fields[key] = parts.filter(Boolean).join(rest.trim().startsWith('|') ? '\n' : ' ')
  }
  const extra = Object.keys(fields).filter((key) => !KEYS.includes(key))
  assert.deepEqual(extra, [], `the verdict has keys outside the contract: ${extra.join(', ')}`)
  const decision = typeof fields.decision === 'string' ? fields.decision.trim().toLowerCase() : ''
  assert.ok(DECISIONS.includes(decision), `the verdict's decision is not one of ${DECISIONS.join(', ')}`)
  assert.ok(typeof fields.note === 'string' && fields.note.trim() !== '', 'the verdict has no note')
  return decision
}

const decided = (env) => {
  assert.ok(DECISIONS.includes(env.EXPECTED_DECISION), 'the spec names no expected decision')
  const input = JSON.parse(readFileSync(env.EVALUATE_GRADER_INPUT, 'utf8'))
  const output = String(input?.trajectory?.output ?? '')
  assert.ok(output.trim() !== '', 'the agent gave no final message')
  const decision = readVerdict(output)
  assert.equal(decision, env.EXPECTED_DECISION, `the judge answered ${decision}`)
  return `decision: ${decision}`
}

const gitIn = (workspace) => {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' }
  for (const key of Object.keys(env)) {
    if (/^GIT_(?:AUTHOR_|COMMITTER_|DIR$|WORK_TREE$|INDEX_FILE$|COMMON_DIR$|OBJECT_DIRECTORY$|ALTERNATE_OBJECT_DIRECTORIES$|CONFIG_(?:COUNT|KEY_|VALUE_))/.test(key)) delete env[key]
  }
  return (...args) => execFileSync('git', ['--no-replace-objects', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args], {
    cwd: workspace, env, encoding: 'utf8', timeout: 10_000,
  })
}

const untouched = (env, workspace) => {
  assert.match(env.EXPECTED_HEAD ?? '', /^[a-f0-9]{40}$/, 'the spec names no expected HEAD')
  assert.match(env.TRACKING_SHA ?? '', /^[a-f0-9]{64}$/, 'the spec names no replay-log digest')
  const git = gitIn(workspace)
  assert.equal(git('rev-parse', '--git-dir').trim(), '.git', 'the workspace is no longer the repository root')
  assert.equal(git('symbolic-ref', 'HEAD').trim(), 'refs/heads/main', 'HEAD left main')
  assert.equal(git('rev-parse', 'HEAD').trim(), env.EXPECTED_HEAD, 'HEAD moved')
  assert.equal(git('for-each-ref', '--format=%(refname) %(objectname)').trim(), `refs/heads/main ${env.EXPECTED_HEAD}`, 'a ref was added, moved or removed')
  const changes = git('status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored').split('\0').filter(Boolean)
    .filter((entry) => !(entry.startsWith('!! ') && /^(?:\.copilot-tracking|\.copilot-sdk)\//.test(entry.slice(3))))
  assert.deepEqual(changes, [], 'the working tree or the index changed')
  assert.equal(readFileSync(join(workspace, '.git', 'info', 'exclude'), 'utf8'), EXCLUDE, 'the ignore rules changed')
  assert.equal(trackingDigest(workspace), env.TRACKING_SHA, 'the replay logs changed')
  return `HEAD ${env.EXPECTED_HEAD.slice(0, 7)} on main, no other ref, clean tree, replay logs intact`
}

/** @returns {string} evidence; throws when the check fails */
export function verify(check, env, workspace = process.cwd()) {
  if (check === 'decision') return decided(env)
  if (check === 'unchanged') return untouched(env, workspace)
  throw new Error(`Unknown check: ${check}`)
}
