import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, linkSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { FIXTURES, commitAll, copyFixture, envWithPath, git, readJson, skraft, stubPrograms, tempFolder, toolFolders } from '../support/workspace.mjs'

// The toolchains (dotnet, mvn, python, npm, npx) are stub programs on a PATH of
// their own: doctor must find them where a developer machine would, under Windows as .cmd.
const TOOLCHAINS = ['dotnet', 'mvn', 'python', 'npm', 'npx']

const machine = (t, programs = TOOLCHAINS) => envWithPath([stubPrograms(join(tempFolder(t, 'skraft-bin-'), 'bin'), programs)])

/** The lines of doctor's checks, without its tables. @param {string[]} lines */
const checksOf = (lines) => lines.filter((line) => /^(ok  |WARN|FAIL)  /.test(line))

/** The command lines `/skraft-init` writes for each stack: init detects the components and writes none. */
const COMMANDS = {
  dotnet: { build: 'dotnet build --nologo', test: 'dotnet test --nologo', format: 'dotnet format --verify-no-changes' },
  java: { build: 'mvn -B -q -DskipTests package', test: 'mvn -B -q verify' },
  python: { build: 'python -m compileall -q src', test: 'python -m pytest -q -p no:cacheprovider' },
  react: { build: 'npm run build', lint: 'npm run lint', test: 'npm test' },
}

/**
 * Writes the command lines the developer confirms with `/skraft-init`, to each component of the
 * file that has none, and the answer about Gherkin when `bdd` is given.
 * @param {string} cwd @param {{ bdd?: boolean }} [answer]
 */
const answerAsTheSkillDoes = (cwd, { bdd } = {}) => {
  const file = join(cwd, 'skraft-config.json')
  const config = readJson(file)
  for (const component of config.components) {
    component.commands = { ...COMMANDS[component.stack], ...component.commands }
    if (bdd !== undefined) component.bdd = bdd
  }
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
}

const initThenDoctor = async (cwd, env, add = [], { gherkin = 'declined' } = {}) => {
  const init = await skraft(cwd, ['init', ...add.flatMap((folder) => ['--add', folder])], { env })
  assert.equal(init.status, 0, init.stderr)
  answerAsTheSkillDoes(cwd, gherkin === 'declined' ? { bdd: false } : {})
  return { init, doctor: await skraft(cwd, ['doctor'], { env }) }
}

// The stub PATH holds no container runtime: doctor warns of it after the infrastructure of each
// component's tests, one line per row, never failing. The commands are written after init, as
// `/skraft-init` would; none is a mutation command, so doctor's mutation line says no component declares one.
for (const [fixture, stack, commands, paths] of [
  ['payment', 'dotnet', ['build', 'format', 'test'], { src: ['src/'], tests: ['tests/'] }],
  ['payment-spring', 'java', ['build', 'test'], {
    src: ['payment-domain/', 'payment-application/', 'payment-infrastructure/', 'payment-app/'],
    tests: ['payment-unit-test/', 'payment-integration-test/', 'payment-domain/src/test/', 'payment-application/src/test/', 'payment-infrastructure/src/test/', 'payment-app/src/test/'],
  }],
  ['payment-fastapi', 'python', ['build', 'test'], { src: ['src/'], tests: ['tests/'] }],
  ['react', 'react', ['build', 'lint', 'test'], { src: ['src/'], tests: ['tests/'] }],
]) {
  test(`skraft init then doctor on the ${fixture} fixture: the Gherkin nobody answered is what is left to do, and doctor passes once it is`, async (t) => {
    const cwd = copyFixture(FIXTURES[fixture], join(tempFolder(t), fixture))

    const { init, doctor } = await initThenDoctor(cwd, machine(t), [], { gherkin: 'unanswered' })

    const [component] = readJson(join(cwd, 'skraft-config.json')).components
    assert.deepEqual([component.name, component.root, component.stack, component.paths], [fixture, '.', stack, paths])
    assert.equal(init.stdout, `skraft-config.json: ${fixture} (${stack}, .)\n`)
    assert.equal(component.bdd, undefined, 'the fixture holds no Gherkin, so init writes no pair and answers nothing')
    assert.equal(doctor.status, 1, doctor.stdout)
    const lines = doctor.stdout.trim().split(/\r?\n/)
    assert.deepEqual(checksOf(lines).map((line) => line.split(': ')[0]), [
      'ok    plugin', 'ok    node', 'ok    config', 'WARN  forge', ...commands.map((name) => `ok    ${fixture}/${name}`), `FAIL  ${fixture}/bdd`, 'ok    mutation',
      ...Array.from({ length: stack === 'react' ? 3 : 4 }, () => 'ok    infrastructure'), 'WARN  container-runtime',
      'ok    models/claude-code', 'WARN  models/copilot', 'ok    vscode',
    ])
    assert.match(checksOf(lines).find((line) => line.startsWith('FAIL')), /bdd: the component does not say whether it describes its behaviour in Gherkin; run \/skraft-init, or write "bdd" in skraft-config\.json$/)
    assert.equal(lines.at(-1), 'skraft doctor: 1 checks failed')
    assert.match(lines[0], /^ok {4}plugin: skraft \S+$/)

    const file = join(cwd, 'skraft-config.json')
    const answered = readJson(file)
    answered.components[0].bdd = false
    writeFileSync(file, `${JSON.stringify(answered, null, 2)}\n`)
    const again = await skraft(cwd, ['doctor'], { env: machine(t) })
    assert.equal(again.status, 0, again.stdout)
    assert.equal(again.stdout.trim().split(/\r?\n/).at(-1), `skraft doctor: no check failed, 3 with a warning`)
  })
}

test('init lists skraft-config.local.json in .gitignore, and doctor reads it and the home folder\'s .skraft/config.json over skraft-config.json, naming the file at fault', async (t) => {
  const root = tempFolder(t)
  const cwd = copyFixture(FIXTURES.payment, join(root, 'payment'))
  const home = join(root, 'home')
  const env = machine(t)
  assert.equal((await skraft(cwd, ['init'], { env, home })).status, 0)
  answerAsTheSkillDoes(cwd, { bdd: false })
  assert.match(readFileSync(join(cwd, '.gitignore'), 'utf8'), /^skraft-config\.local\.json$/m)
  const configLine = async () => (await skraft(cwd, ['doctor'], { env, home })).stdout.split(/\r?\n/).find((line) => line.includes(' config: '))

  mkdirSync(join(home, '.skraft'), { recursive: true })
  writeFileSync(join(home, '.skraft', 'config.json'), JSON.stringify({ components: [], models: { 'gpt-codex': { copilot: { model: 'gpt-5.5-codex' } } } }))
  assert.equal(await configLine(), 'FAIL  config: ~/.skraft/config.json is invalid: components belongs in skraft-config.json, never in ~/.skraft/config.json')
  writeFileSync(join(home, '.skraft', 'config.json'), JSON.stringify({ models: { 'gpt-codex': { copilot: { model: 'gpt-5.5-codex' } } } }))
  assert.equal(await configLine(), 'FAIL  config: the merged configuration is invalid: models.gpt-codex is a free family: give it a "tier" (economy, standard, frontier, premium)')
  assert.deepEqual((await skraft(cwd, ['doctor'], { env, home })).stdout.split(/\r?\n/).slice(2), [
    'FAIL  config: the merged configuration is invalid: models.gpt-codex is a free family: give it a "tier" (economy, standard, frontier, premium)',
    `ok    vscode: no Copilot SDK under ${join(home, '.copilot', 'pkg')}: under VS Code, the Skraft - Orchestrator agent conducts skraft next and skraft record; install the Copilot CLI to run the pipeline through its SDK`,
    'skraft doctor: 1 checks failed', '',
  ])
  writeFileSync(join(cwd, 'skraft-config.local.json'), JSON.stringify({ models: { 'gpt-codex': { tier: 'standard' } } }))

  const doctor = await skraft(cwd, ['doctor'], { env, home })

  assert.equal(doctor.status, 0, doctor.stdout)
  assert.equal(await configLine(), 'ok    config: 1 components: payment')
  const lines = doctor.stdout.split(/\r?\n/)
  const copilot = lines.slice(lines.indexOf('models on copilot:'))
  assert.match(copilot[1], /^ {2}step +agent +type +family +tier +model +effort +source \(family\/model\/effort\)$/)
  assert.match(copilot[2], /^ {2}research +solution-researcher +phase +researcher +economy +- +- +agent\/host\/host$/)
  assert.ok(lines.indexOf('models on claude-code:') < lines.indexOf('models on copilot:'))
})

test('doctor\'s tables align each column under its heading, a model list in its order and - where the host decides', async (t) => {
  const root = tempFolder(t)
  const cwd = copyFixture(FIXTURES.payment, join(root, 'payment'))
  const env = machine(t)
  assert.equal((await skraft(cwd, ['init'], { env })).status, 0)
  answerAsTheSkillDoes(cwd, { bdd: false })
  writeFileSync(join(cwd, 'skraft-config.local.json'), JSON.stringify({ models: { implementer: { copilot: { model: ['gpt-6.0', 'gpt-5.5'] } } }, assign: { agents: { 'business-alignment-lens': 'inherit' } } }))

  const lines = (await skraft(cwd, ['doctor'], { env })).stdout.split(/\r?\n/)

  const table = lines.slice(lines.indexOf('models on copilot:') + 1, -2)
  const columns = ['step', 'agent', 'type', 'family', 'tier', 'model', 'effort', 'source'].map((heading) => table[0].indexOf(heading))
  assert.equal(table.length, 21)
  for (const row of table) assert.deepEqual(columns.map((column) => row[column - 1] === ' ' && row[column] !== ' '), columns.map(() => true), row)
  const cells = (agent) => table.find((row) => row.includes(` ${agent} `)).trim().split(/ {2,}/)
  assert.deepEqual(cells('acceptance-designer'), ['distill', 'acceptance-designer', 'phase', 'implementer', 'standard', 'gpt-6.0 → gpt-5.5', '-', 'default/family/host'])
  assert.deepEqual(cells('business-alignment-lens'), ['distill_review', 'business-alignment-lens', 'lens', '-', '-', '-', '-', 'host/host/host'])
})

test('doctor warns of CLAUDE_CODE_EFFORT_LEVEL and of a ~/.copilot/settings.json agent setting that skraft\'s own choice masks', async (t) => {
  const root = tempFolder(t)
  const cwd = copyFixture(FIXTURES.payment, join(root, 'payment'))
  const home = join(root, 'home')
  const env = machine(t)
  assert.equal((await skraft(cwd, ['init'], { env, home })).status, 0)
  answerAsTheSkillDoes(cwd, { bdd: false })
  writeFileSync(join(cwd, 'skraft-config.local.json'), JSON.stringify({ models: { standard: { copilot: { model: 'gpt-5.5' } } } }))
  mkdirSync(join(home, '.copilot'), { recursive: true })
  const warnings = async (settings, more = {}) => {
    writeFileSync(join(home, '.copilot', 'settings.json'), settings)
    return checksOf((await skraft(cwd, ['doctor'], { env: { ...env, ...more }, home })).stdout.split(/\r?\n/)).filter((line) => line.startsWith('WARN  models/') && !line.includes('no model on'))
  }

  assert.deepEqual(await warnings(JSON.stringify({ subagents: { agents: { 'skraft:software-engineer': { model: 'gpt-4.1' }, 'solution-architect': {} } } }), { CLAUDE_CODE_EFFORT_LEVEL: 'high' }), [
    'WARN  models/claude-code: CLAUDE_CODE_EFFORT_LEVEL is set to "high": Claude Code applies it to every agent, over the effort skraft assigns',
    'WARN  models/copilot: ~/.copilot/settings.json sets subagents.agents for software-engineer; skraft passes its own model or effort for them, so those settings are ignored',
  ])
  assert.deepEqual(await warnings('{ not json', { CLAUDE_CODE_EFFORT_LEVEL: '' }), [])
  assert.deepEqual(await warnings(JSON.stringify({ subagents: { agents: ['software-engineer'] } })), [])
})

test('skraft init then doctor pass on a .NET API with its React front in a neighbour repository', async (t) => {
  const root = tempFolder(t)
  const cwd = copyFixture(FIXTURES.payment, join(root, 'payment-api'))
  copyFixture(FIXTURES.react, join(root, 'payment-web'))

  const { init, doctor } = await initThenDoctor(cwd, machine(t), ['../payment-web'])

  assert.equal(init.stdout, 'skraft-config.json: payment-api (dotnet, .), payment-web (react, ../payment-web)\n')
  assert.equal(doctor.status, 0, doctor.stdout)
  assert.match(doctor.stdout, /^ok {4}payment-web\/test: npm test \(parsed; doctor --run starts it\)$/m)
})

test('doctor passes a command whose program is on no PATH, since it only parses it, and --run names the one that does not start', async (t) => {
  const cwd = copyFixture(FIXTURES.payment, join(tempFolder(t), 'payment'))
  const env = machine(t, ['dotnet'])
  assert.equal((await skraft(cwd, ['init'], { env })).status, 0)
  answerAsTheSkillDoes(cwd, { bdd: false })
  const config = readJson(join(cwd, 'skraft-config.json'))
  config.components[0].commands.architecture = 'archunit-cli check'
  writeFileSync(join(cwd, 'skraft-config.json'), JSON.stringify(config, null, 2))
  commitAll(cwd)

  const parsed = await skraft(cwd, ['doctor'], { env })
  const started = await skraft(cwd, ['doctor', '--run'], { env })

  assert.equal(parsed.status, 0, parsed.stdout)
  assert.match(parsed.stdout, /^ok {4}payment\/architecture: archunit-cli check \(parsed; doctor --run starts it\)$/m)
  assert.equal(started.status, 1)
  assert.match(started.stdout, /^FAIL {2}payment\/architecture: archunit-cli did not start for payment\/architecture; install it or change commands\.architecture in skraft-config\.json$/m)
})

test('doctor passes on Microcks components without any container runtime on the machine, warning that their container scenarios will be indeterminate', async (t) => {
  const cwd = copyFixture(FIXTURES['payment-fastapi'], join(tempFolder(t), 'payment-fastapi'))
  const env = machine(t, ['python'])
  assert.equal((await skraft(cwd, ['init'], { env })).status, 0)
  answerAsTheSkillDoes(cwd, { bdd: false })

  const report = await skraft(cwd, ['doctor', '--json'], { env })

  assert.equal(report.status, 0)
  const { checks } = JSON.parse(report.stdout)
  assert.deepEqual(checks.filter(({ status }) => status !== 'ok').map(({ subject }) => subject), ['forge', 'container-runtime', 'models/copilot'])
  assert.equal(checks.find(({ subject }) => subject === 'container-runtime').detail, 'neither docker nor podman is on the PATH; the tests that need Microcks or Testcontainers cannot run until Docker or Podman runs')
  assert.equal(checks.find(({ detail }) => detail.includes('external gateway')).detail, 'payment-fastapi (python) external gateway: microcks (targeted), microcks (walking skeleton) — Microcks uber native image via Testcontainers, one container per test session; source plugin')
})

test('doctor --run starts each command once against the base it is given, main by default', async (t) => {
  const cwd = join(tempFolder(t), 'payment')
  mkdirSync(cwd)
  writeFileSync(join(cwd, 'skraft-config.json'), JSON.stringify({ components: [
    { name: 'payment', root: '.', stack: 'javascript', bdd: false, mocking: { strategy: 'inprocess' }, commands: { test: 'node --version {baseSha}' } },
  ] }))
  const mainSha = commitAll(cwd)
  git(cwd, 'checkout', '-q', '-b', 'develop')
  git(cwd, 'commit', '-q', '--allow-empty', '-m', 'develop')
  const developSha = git(cwd, 'rev-parse', 'HEAD')
  const env = envWithPath(toolFolders())

  const onMain = await skraft(cwd, ['doctor', '--run', '--json'], { env })
  const onDevelop = await skraft(cwd, ['doctor', '--base', 'develop', '--run'], { env })
  const dry = await skraft(cwd, ['doctor', '--base', 'develop', '--json'], { env })

  assert.equal(onMain.status, 0, onMain.stdout)
  assert.deepEqual(JSON.parse(onMain.stdout).checks[3], { subject: 'payment/test', status: 'ok', detail: `node --version ${mainSha} passed` })
  assert.equal(onDevelop.status, 0, onDevelop.stdout)
  assert.equal(onDevelop.stdout.split(/\r?\n/)[4], `ok    payment/test: node --version ${developSha} passed`)
  assert.equal(JSON.parse(dry.stdout).checks[3].detail, 'node --version {baseSha} (parsed; doctor --run starts it)')
})

test('doctor names a component root that is missing or a file; a folder it may not read stops it with the system\'s error', async (t) => {
  const cwd = join(tempFolder(t), 'payment')
  mkdirSync(join(cwd, 'locked'), { recursive: true })
  writeFileSync(join(cwd, 'notes.txt'), 'not a folder\n')
  const component = (name, root) => ({ name, root, stack: 'javascript', mocking: { strategy: 'inprocess' }, commands: { test: 'node --version' } })
  const configure = (components) => writeFileSync(join(cwd, 'skraft-config.json'), JSON.stringify({ components }))
  const env = envWithPath(toolFolders())
  configure([component('gone', 'gone'), component('notes', 'notes.txt')])

  const report = JSON.parse((await skraft(cwd, ['doctor', '--json'], { env })).stdout)

  assert.deepEqual(report.checks.filter((check) => check.status === 'fail'), [
    { subject: 'gone', status: 'fail', detail: 'root gone is not a folder' },
    { subject: 'notes', status: 'fail', detail: 'root notes.txt is not a folder' },
  ])
  if (process.platform === 'win32' || process.getuid?.() === 0) return
  configure([component('locked', 'locked')])
  chmodSync(join(cwd, 'locked'), 0o000)
  try {
    await assert.rejects(skraft(cwd, ['doctor'], { env }), { code: 'EACCES' })
  } finally {
    chmodSync(join(cwd, 'locked'), 0o755)
  }
})
