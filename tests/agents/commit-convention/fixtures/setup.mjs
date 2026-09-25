import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixtures = dirname(fileURLToPath(import.meta.url))
const context = JSON.parse(readFileSync(join(fixtures, 'context.json'), 'utf8'))
const options = { encoding: 'utf8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] }
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
for (const key of Object.keys(env)) {
  if (/^GIT_(?:AUTHOR_|COMMITTER_|DIR$|WORK_TREE$|INDEX_FILE$|COMMON_DIR$|OBJECT_DIRECTORY$|ALTERNATE_OBJECT_DIRECTORIES$|CONFIG_(?:COUNT|KEY_|VALUE_))/.test(key)) delete env[key]
}
const git = (cwd, args, input) => execFileSync('git', args, { ...options, cwd, env, input }).trimEnd()
const put = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

function prepare(workspace, scenario) {
  assert.ok(Object.hasOwn(context.cases, scenario), 'Unknown scenario')
  const root = join(workspace, 'checkout')
  assert.ok(!existsSync(root), 'Refusing to replace an existing checkout')
  mkdirSync(root)
  git(root, ['init', '--quiet', '--object-format=sha1', '--initial-branch=main', '--template='])
  for (const [key, value] of Object.entries({
    'user.name': context.identity.name, 'user.email': context.identity.email,
    'commit.gpgsign': 'false', 'core.autocrlf': 'false', 'core.hooksPath': '/dev/null',
  })) git(root, ['config', key, value])
  put(root, 'handoff.txt', context.common + '\n\n' + context.cases[scenario] + '\n')
  put(root, context.guidePath, context.before)
  put(root, context.protectedPath, context.protectedText)
  git(root, ['-c', 'core.attributesFile=/dev/null', 'add', '--chmod=-x', '--', 'handoff.txt', 'docs'])
  execFileSync('git', ['commit', '--quiet', '-m', 'Seed customer handbook'], {
    ...options, cwd: root, env: { ...env, GIT_AUTHOR_DATE: '2001-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2001-01-01T00:00:00Z' },
  })
  const base = git(root, ['rev-parse', 'HEAD'])
  put(root, context.guidePath, context.after)
  git(root, ['add', '--', context.guidePath])
  git(root, ['diff', '--cached', '--check'])
  return { root, base, scenario }
}

const validMessage = scenario => 'docs(loyalty-discount): clarify expired membership pricing' + ({
  intermediate: '\n\nRefs: #42', completion: '\n\nCloses #42', unknown: '',
}[scenario])
const commit = (s, message = validMessage(s.scenario), sign = true) => git(s.root, ['commit', '--quiet', ...(sign ? ['-s'] : []), '-F', '-'], message)

async function smoke() {
  const { verify } = await import('./verify.mjs')
  const { loadEvalSpec, RunCommandGrader } = await import('@microsoft/vally')
  const spec = await loadEvalSpec(resolve(fixtures, '../eval.yaml'))
  const workspace = mkdtempSync(join(tmpdir(), 'commit-convention-'))
  let checks = 0
  const check = (s, mode, pass = true) => {
    const run = () => verify(mode, context, s.scenario, s.base, dirname(s.root))
    if (pass) run()
    else assert.throws(run, assert.AssertionError)
    checks++
  }
  try {
    // Vally may already own a repository. Never reset or adopt its index.
    git(workspace, ['init', '--quiet', '--template='])
    put(workspace, 'harness.txt', 'Outer workspace must survive\n')
    git(workspace, ['add', '--', 'harness.txt'])
    const index = readFileSync(join(workspace, '.git/index'))
    for (const stimulus of spec.stimuli) {
      const scenario = stimulus.tags.scenario
      const directory = join(workspace, scenario)
      mkdirSync(directory)
      for (const file of stimulus.environment.files) put(directory, file.dest, readFileSync(resolve(fixtures, '..', file.src)))
      // Exercise actual environment commands, not a second fixture recipe.
      let output
      for (const command of stimulus.environment.commands) output = execFileSync('sh', ['-c', command], { ...options, cwd: directory, env })
      const s = JSON.parse(output)
      assert.equal(s.base, stimulus.graders.find(g => g.type === 'run-command').config.env.BASE_SHA)
      check(s, 'sentinel')
      check(s, 'tree', false)
      check(s, 'message', false)
      commit(s)
      for (const grader of stimulus.graders.filter(g => g.type === 'run-command')) {
        const result = await new RunCommandGrader().grade({ trajectory: { workDir: directory }, config: grader.config })
        assert.ok(result.passed, grader.name + ': ' + result.evidence)
        checks++
      }
      console.log(scenario + ': pinned seed ' + s.base + '; staged fixture and Vally graders passed')
    }
    const probes = [
      ['wrong-scope', 'intermediate', m => m.replace('(loyalty-discount)', '(docs)'), 'message'],
      ['premature-close', 'intermediate', m => m.replace('Refs: #42', 'Closes #42'), 'message'],
      ['hidden-close', 'intermediate', m => m + '\nFixes #42', 'message'],
      ['wrong-issue', 'intermediate', m => m.replace('#42', '#43'), 'message'],
      ['invented-issue', 'unknown', m => m + '\n\nRefs: #42', 'message'],
      ['missing-reference', 'intermediate', m => m.split('\n')[0], 'message'],
      ['missed-completion', 'completion', m => m.replace('Closes', 'Refs:'), 'message'],
      ['inline-reference', 'intermediate', m => m.replace('Refs: #42', 'Customer guidance, Refs #42.'), 'message'],
      ['inline-closure', 'completion', m => m.replace('Closes #42', 'Customer guidance, Closes #42.'), 'message'],
      ['duplicate-reference', 'intermediate', m => m + '\nRefs: #42', 'message'],
      ['duplicate-closure', 'completion', m => m + '\nCloses #42', 'message'],
      ['nonfinal-reference', 'intermediate', m => m + '\nCustomer guidance follows.', 'message'],
      ['nonfinal-closure', 'completion', m => m + '\nCustomer guidance follows.', 'message'],
      ['reference-without-colon', 'intermediate', m => m.replace('Refs:', 'Refs'), 'message'],
      ['closure-with-colon', 'completion', m => m.replace('Closes', 'Closes:'), 'message'],
      ['missing-signoff', 'completion', m => m, 'message'],
      ['wrong-signoff', 'completion', m => m + '\n\nSigned-off-by: Other <other@example.invalid>', 'message'],
      ['unrelated-commit', 'completion', m => m, 'tree'],
      ['untracked-file', 'completion', m => m, 'sentinel'],
      ['changed-guide', 'completion', m => m, 'sentinel'],
      ['changed-identity', 'completion', m => m, 'message'],
      ['extra-commit', 'completion', m => m, 'tree'],
      ['rewritten-seed', 'completion', m => m, 'sentinel'],
    ]
    for (const [name, scenario, transform, mode] of probes) {
      const directory = join(workspace, name)
      mkdirSync(directory)
      const s = prepare(directory, scenario)
      if (name === 'unrelated-commit') {
        put(s.root, context.protectedPath, 'Unrelated edit\n')
        git(s.root, ['add', '--', context.protectedPath])
      }
      if (name === 'changed-identity') git(s.root, ['config', 'user.name', 'Other'])
      if (name === 'rewritten-seed') git(s.root, ['commit', '--quiet', '--amend', '-m', 'Rewritten seed'])
      else commit(s, transform(validMessage(scenario)), name !== 'missing-signoff')
      if (name === 'untracked-file') put(s.root, 'scratch.txt', 'Unexpected\n')
      if (name === 'changed-guide') put(s.root, context.guidePath, context.before)
      if (name === 'extra-commit') git(s.root, ['commit', '--quiet', '--allow-empty', '-m', 'Extra'])
      check(s, mode, false)
      console.log('Rejected: ' + name)
    }
    // Standard Git trailers need no bespoke blank-line convention around Refs.
    for (const [name, scenario, message, sign] of [
      ['compact', 'intermediate', validMessage('intermediate') + '\nSigned-off-by: SKRAFT Eval <eval@example.invalid>\n', false],
      ['standard-git-s-reference', 'intermediate', validMessage('intermediate'), true],
      ['standard-git-s-closure', 'completion', validMessage('completion'), true],
      ['other-trailer', 'completion', validMessage('completion') + '\n\nReviewed-by: Reviewer <reviewer@example.invalid>', true],
    ]) {
      mkdirSync(join(workspace, name))
      const s = prepare(join(workspace, name), scenario)
      commit(s, message, sign)
      if (name === 'standard-git-s-reference') {
        assert.ok(git(s.root, ['show', '-s', '--format=%B']).includes('Refs: #42\nSigned-off-by: '), 'Exercise adjacent git -s sign-off')
      }
      check(s, 'message')
      console.log('Accepted: ' + name)
    }
    // Tampering must fail the actual pinned Vally bootstrap before importing it.
    const stimulus = spec.stimuli[0]
    for (const name of ['setup.mjs', 'verify.mjs', 'context.json']) {
      const target = join(workspace, stimulus.tags.scenario, '.fixture-input', name)
      const original = readFileSync(target)
      writeFileSync(target, 'tampered')
      const grader = stimulus.graders.find(g => g.type === 'run-command')
      const result = await new RunCommandGrader().grade({ trajectory: { workDir: join(workspace, stimulus.tags.scenario) }, config: grader.config })
      assert.equal(result.passed, false, 'Accepted changed oracle input: ' + name)
      writeFileSync(target, original)
      checks++
    }
    assert.deepEqual(readFileSync(join(workspace, '.git/index')), index)
    assert.equal(readFileSync(join(workspace, 'harness.txt'), 'utf8'), 'Outer workspace must survive\n')
    console.log('Offline smoke: ' + checks + ' assertions passed; no model sessions')
  } finally { rmSync(workspace, { recursive: true, force: true }) }
}

// The repository runner has no agent stimulus selector. Preserve its single
// entrypoint; append Vally's supported filters instead of mutating the spec.
function pilotArgs(args) {
  assert.equal(args[0], 'eval', 'Only runner eval invocation is supported')
  const value = flag => args[args.indexOf(flag) + 1]
  assert.equal(resolve(value('--eval-spec')), resolve(fixtures, '../eval.yaml'), 'Wrong suite')
  assert.equal(value('--workers'), '1')
  assert.equal(value('--max-retries'), '0')
  assert.equal(process.env.BASELINE_CACHE, '0', 'Pilot must not use cache')
  return [...args, '--tag', 'scenario=completion', '--runs', '1', '--model', 'gpt-5.6-luna']
}

const [mode, ...args] = process.argv.slice(2)
if (mode === '--pilot-runner') {
  const result = spawnSync('vally', pilotArgs(args), { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} else if (mode === '--smoke') await smoke()
else if (mode === '--inspect') {
  const { loadEvalSpec } = await import('@microsoft/vally')
  const { loadAgentDescriptor } = await import('../../../../eng/vally-agent-executor/agent-descriptor.mjs')
  const spec = await loadEvalSpec(resolve(fixtures, '../eval.yaml'))
  const agent = loadAgentDescriptor(resolve(fixtures, '../../../..'), 'software-engineer')
  assert.ok(spec.stimuli.every(s => s.tags.agent === agent.id))
  assert.equal(spec.defaults.executor, 'skraft-agent-runner')
  assert.equal(spec.stimuli.filter(s => s.tags.scenario === 'completion').length, 1)
  console.log('Real agent: ' + agent.id + ' SHA256 ' + agent.sha256)
  for (const file of ['../eval.yaml', 'setup.mjs', 'verify.mjs', 'context.json']) console.log(file + ' SHA256 ' + createHash('sha256').update(readFileSync(join(fixtures, file))).digest('hex'))
  console.log('Pilot argv: ' + JSON.stringify(pilotArgs(['eval', '--eval-spec', resolve(fixtures, '../eval.yaml'), '--workers', '1', '--max-retries', '0'])))
} else if (mode === '--seeds') {
  const directory = mkdtempSync(join(tmpdir(), 'commit-seeds-'))
  try {
    for (const scenario of Object.keys(context.cases)) {
      mkdirSync(join(directory, scenario))
      console.log(JSON.stringify(prepare(join(directory, scenario), scenario)))
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
} else console.log(JSON.stringify(prepare(process.cwd(), mode)))