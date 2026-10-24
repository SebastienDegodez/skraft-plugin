import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')

// The one file that pins a versioned model: the evaluation families and the judge.
const DECLARED = 'eng/eval-models.json'
// Eval specs are never read by a test; the scripts beside them are tooling.
const SCOPES = ['eng/', 'scripts/', '.github/workflows/', ':(glob)tests/agents/**/*.mjs', ':(glob)tests/skills/**/*.mjs']
// A gh-aw lock file is compiler output: it carries gh-aw's own model alias map.
const COMPILED = /\.lock\.yml$/
const VERSIONED = new RegExp([
  String.raw`\bgpt-\d[\w.-]*`,
  String.raw`\bclaude-(?:\d[\w.-]*|(?:sonnet|opus|haiku|fable)-\d[\w.]*)`,
  String.raw`\bgemini-\d[\w.-]*`,
  String.raw`\bo[134](?:-mini|-pro)?\b`,
  String.raw`\bgrok-\d[\w.-]*`,
  String.raw`\bkimi-[\w.-]+`,
  String.raw`\b(?:sonnet|opus|haiku|fable) \d[\d.]*`,
].join('|'), 'i')

const trackedTooling = () => {
  const listed = spawnSync('git', ['ls-files', '-z', '--', ...SCOPES], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(listed.status, 0, listed.stderr)
  return listed.stdout.split('\0').filter((path) => path && path !== DECLARED && !COMPILED.test(path))
}

const versionedNames = (path) =>
  readFileSync(join(repoRoot, path), 'utf8')
    .split('\n')
    .flatMap((line, index) => (VERSIONED.test(line) ? [`${path}:${index + 1}: ${line.match(VERSIONED)[0]}`] : []))

test(`repository tooling names no versioned model outside ${DECLARED}`, () => {
  const found = trackedTooling().flatMap(versionedNames)
  assert.deepEqual(found, [], `name a family, or read the model from ${DECLARED}`)
})
