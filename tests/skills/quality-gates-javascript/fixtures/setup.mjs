import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkWorkspace, specimen } from './verify.mjs'

const fixtures = dirname(fileURLToPath(import.meta.url))
const context = JSON.parse(readFileSync(join(fixtures, 'context.json'), 'utf8'))
const options = { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const inputs = ['setup.mjs', 'verify.mjs', 'context.json']
const pins = Object.fromEntries(inputs.map(name => [name, hash(readFileSync(join(fixtures, name)))]))

function put(root, name, value) {
  const path = join(root, name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

export function prepare(workspace, scenario) {
  const files = specimen(context, scenario)
  const root = join(workspace, 'checkout')
  assert.ok(!existsSync(root), `Refusing to overwrite ${root}`)
  for (const [name, value] of Object.entries(files)) put(root, name, value)
  checkWorkspace(workspace, context, scenario, pins)
  return { root, scenario }
}

function stage(workspace, scenario) {
  for (const name of inputs) put(workspace, '.fixture-input/' + name, readFileSync(join(fixtures, name)))
  return prepare(workspace, scenario)
}

const bootstrap = `
const { readFileSync } = await import('node:fs')
const { createHash } = await import('node:crypto')
const read = (name, expected) => {
  const bytes = readFileSync('.fixture-input/' + name)
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Oracle input changed: ' + name)
  return bytes
}
const source = read('verify.mjs', process.env.ORACLE_SHA)
const context = JSON.parse(read('context.json', process.env.CONTEXT_SHA))
read('setup.mjs', process.env.SETUP_SHA)
const { verify } = await import('data:text/javascript;base64,' + source.toString('base64'))
verify(process.env.CHECK, context, process.env.SCENARIO, {
  'verify.mjs': process.env.ORACLE_SHA, 'context.json': process.env.CONTEXT_SHA, 'setup.mjs': process.env.SETUP_SHA,
})
`

function probe(workspace, scenario, mode, succeeds = true) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', bootstrap], {
    ...options, cwd: workspace,
    env: { ...process.env, CHECK: mode, SCENARIO: scenario, ORACLE_SHA: pins['verify.mjs'], CONTEXT_SHA: pins['context.json'], SETUP_SHA: pins['setup.mjs'] },
  })
  assert.ok(!result.error && !result.signal, 'Probe did not complete')
  assert.equal(result.status === 0, succeeds, result.stderr || `Unexpected ${mode} result`)
}

function smoke() {
  const temporary = mkdtempSync(join(tmpdir(), 'js-gates-smoke-'))
  let positive = 0
  let negative = 0
  try {
    for (const scenario of Object.keys(context.cases)) {
      const workspace = join(temporary, scenario)
      const { root } = stage(workspace, scenario)
      for (const mode of ['sentinel', 'unchanged']) { probe(workspace, scenario, mode); positive++ }
      const output = execFileSync('npm', ['--prefix', root, 'test'], options)
      assert.match(output, /# pass 5\b/)
      assert.match(output, /# fail 0\b/)
      console.log(`${scenario}: 5 application/architecture tests pass`)
      for (const tree of Object.keys(context.workspaceIntegrity.excludedRootTrees)) {
        put(workspace, `${tree}/harness-managed.txt`, 'Harness materialization/output\n')
      }
      if (scenario === 'ordinary') {
        put(root, 'test-results/test.stdout', output)
        put(root, 'test-results/test.stderr', '')
        put(root, 'test-results/test.exit', '0\n')
      }
      for (const mode of ['sentinel', 'unchanged']) { probe(workspace, scenario, mode); positive++ }
      assert.throws(() => prepare(workspace, scenario), /Refusing to overwrite/)
      negative++
      const additions = [
        ['root receipt', workspace, 'delivery-receipt.json'],
        ['checkout file', root, 'extra.mjs'],
        ['checkout receipt', root, 'evidence/receipt.json'],
        ['hidden project receipt', workspace, '.copilot-tracking/receipt.json'],
        ['skill exclusion sibling', workspace, '.github/receipt.json'],
        ['checkout harness lookalike', root, '.vally/receipt.json'],
        ['extra test output receipt', root, 'test-results/receipt.json'],
        ['fixture receipt', workspace, '.fixture-input/receipt.json'],
      ]
      for (const [name, directory, path] of additions) {
        put(directory, path, '{"combinedPass":true}\n')
        for (const mode of ['sentinel', 'unchanged']) { probe(workspace, scenario, mode, false); negative++ }
        rmSync(join(directory, path))
        console.log(`Rejected (${scenario}): ${name}`)
      }
      if (scenario !== 'ordinary') {
        put(root, 'test-results/test.stdout', output)
        for (const mode of ['sentinel', 'unchanged']) { probe(workspace, scenario, mode, false); negative++ }
        rmSync(join(root, 'test-results/test.stdout'))
      }
      for (const mode of ['sentinel', 'unchanged']) { probe(workspace, scenario, mode); positive++ }
    }
    const mutations = [
      ['broken manifest', root => put(root, 'package.json', '{')],
      ['invented script', root => {
        const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
        manifest.scripts.build = 'node --version'
        put(root, 'package.json', JSON.stringify(manifest))
      }],
      ['removed test', root => rmSync(join(root, 'tests/pricing.test.mjs'))],
      ['weakened assertion', root => put(root, 'tests/pricing.test.mjs', 'console.log("pass")\n')],
      ['changed business behavior', root => put(root, 'src/domain/price.mjs', 'export const memberPrice = () => 90\n')],
      ['forged handover', root => put(root, 'handover.json', '{"combinedPass":true}\n')],
      ['symlinked test', root => {
        const original = join(root, 'tests/pricing.test.mjs')
        put(root, 'copy.mjs', readFileSync(original))
        rmSync(original)
        symlinkSync('../copy.mjs', original)
      }],
      ['replaced oracle', (_root, workspace) => put(workspace, '.fixture-input/verify.mjs', 'export function verify() {}\n')],
      ['rewritten context', (_root, workspace) => put(workspace, '.fixture-input/context.json', '{}\n')],
      ['rewritten setup', (_root, workspace) => put(workspace, '.fixture-input/setup.mjs', 'console.log("ready")\n')],
      ['symlinked output', root => symlinkSync('handover.json', join(root, 'test.stdout'))],
      ['symlinked harness directory', (_root, workspace) => symlinkSync('checkout', join(workspace, '.vally'))],
    ]
    for (const [index, [name, mutate]] of mutations.entries()) {
      const workspace = join(temporary, `tamper-${index}`)
      const { root } = stage(workspace, 'handover')
      mutate(root, workspace)
      for (const mode of ['sentinel', 'unchanged']) { probe(workspace, 'handover', mode, false); negative++ }
      console.log(`Rejected: ${name}`)
    }
    console.log(JSON.stringify({ positive, negative, applicationTests: 15, mutationRuns: 0, modelRuns: 0 }))
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

// Static Vally materialization/command validation, never an eval-content test.
async function staticValidation() {
  const { loadEvalSpec, RunCommandGrader } = await import('@microsoft/vally')
  const spec = await loadEvalSpec(resolve(fixtures, '../eval.yaml'))
  const temporary = mkdtempSync(join(tmpdir(), 'js-gates-static-'))
  let passed = 0
  let rejected = 0
  try {
    for (const [index, stimulus] of spec.stimuli.entries()) {
      const workspace = join(temporary, String(index))
      mkdirSync(workspace)
      // Simulate harness-owned files: setup must not alter them.
      put(workspace, '.git/index', 'Harness-owned index sentinel\n')
      for (const file of stimulus.environment.files) {
        const destination = resolve(workspace, file.dest)
        assert.ok(destination.startsWith(workspace + '/'), 'Unsafe fixture destination')
        put(workspace, file.dest, readFileSync(resolve(fixtures, '..', file.src)))
      }
      for (const command of stimulus.environment.commands) {
        execFileSync('sh', ['-c', command], { ...options, cwd: workspace })
      }
      assert.equal(readFileSync(join(workspace, '.git/index'), 'utf8'), 'Harness-owned index sentinel\n')
      const graders = stimulus.graders.filter(item => item.type === 'run-command')
      for (const grader of graders) {
        const result = await new RunCommandGrader().grade({ trajectory: { workDir: workspace }, config: grader.config })
        assert.ok(result.passed, `${grader.name}: ${result.evidence}`)
        passed++
      }
      put(workspace, '.fixture-input/verify.mjs', 'export function verify() {}\n')
      for (const grader of graders) {
        const result = await new RunCommandGrader().grade({ trajectory: { workDir: workspace }, config: grader.config })
        assert.equal(result.passed, false, 'Editable oracle bypassed the grader')
        rejected++
      }
    }
    console.log(JSON.stringify({ apiLoad: 'pass', commandGradersPassed: passed, tamperedOraclesRejected: rejected, modelRuns: 0 }))
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

const [mode] = process.argv.slice(2)
if (mode === '--smoke') smoke()
else if (mode === '--static') await staticValidation()
else if (mode === '--fingerprints') console.log(JSON.stringify(pins, null, 2))
else console.log(JSON.stringify(prepare(resolve('.'), mode)))