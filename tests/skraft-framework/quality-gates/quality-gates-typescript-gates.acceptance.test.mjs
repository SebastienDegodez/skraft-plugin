import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { parseMutationArgs, runMutationGate } from '../../../plugins/skraft-framework/skills/quality-gates-typescript/scripts/mutation-gate.mjs'
import { runCoverageGate } from '../../../plugins/skraft-framework/skills/quality-gates-typescript/scripts/coverage-core.mjs'
import { runNoMocksGate } from '../../../plugins/skraft-framework/skills/quality-gates-typescript/scripts/no-mocks-in-core.mjs'
import { runArchitectureGate } from '../../../plugins/skraft-framework/skills/quality-gates-typescript/scripts/architecture-gate.mjs'
import { runCapture } from '../../../plugins/skraft-framework/skills/quality-gates-typescript/scripts/capture.mjs'
import { configureMutation } from '../../../plugins/skraft-framework/skills/quality-gates-typescript/scripts/configure-mutation.mjs'

const fake = pathToFileURL(fileURLToPath(new URL('./quality-gates-typescript-fake-tools.fixture.mjs', import.meta.url))).href
const fakeEslintApi = pathToFileURL(fileURLToPath(new URL('./quality-gates-typescript-fake-eslint-api.fixture.mjs', import.meta.url))).href
const VERSIONS = { vitest: '4.1.11', '@vitest/coverage-v8': '4.1.11', '@stryker-mutator/core': '10.0.0', '@stryker-mutator/vitest-runner': '10.0.0', eslint: '9.39.5' }
const BINS = { vitest: ['vitest', 'vitest.mjs'], '@stryker-mutator/core': ['stryker', 'bin/stryker.mjs'], eslint: ['eslint', 'bin/eslint.mjs'] }
const mutant = (line, status) => ({ id: `${line}-${status}`, mutatorName: 'ConditionalExpression', status, location: { start: { line, column: 1 }, end: { line, column: 9 } } })

async function project(t, { versions = {}, scenario = {}, pkgDir = '.' } = {}) {
	const root = await mkdtemp(join(tmpdir(), 'qg-ts-'))
	t.after(() => rm(root, { recursive: true, force: true }))
	const pkg = join(root, pkgDir)
	const put = async (name, body) => {
		await mkdir(dirname(join(pkg, name)), { recursive: true })
		await writeFile(join(pkg, name), body)
	}
	for (const [name, version] of Object.entries({ ...VERSIONS, ...versions })) {
		const [bin, file] = BINS[name] ?? []
		await put(`node_modules/${name}/package.json`, JSON.stringify({ name, version, ...(bin ? { bin: { [bin]: file } } : {}), ...(name === 'eslint' ? { main: 'api.mjs' } : {}) }))
		if (name === 'eslint') await put('node_modules/eslint/api.mjs', `export * from ${JSON.stringify(fakeEslintApi)}\n`)
		if (bin) await put(`node_modules/${name}/${file}`, `process.argv.splice(2, 0, ${JSON.stringify(bin)})\nawait import(${JSON.stringify(fake)})\n`)
	}
	await put('package.json', JSON.stringify({ name: 'front', private: true }))
	await put('src/todos/application/ListTodos.ts', 'export class ListTodos {\n  execute() {\n    return []\n  }\n}\n')
	await put('src/todos/application/TodoGateway.ts', 'export interface TodoGateway {\n  list(): Promise<string[]>\n}\n')
	await put('src/todos/infrastructure/HttpTodoGateway.ts', 'export class HttpTodoGateway {}\n')
	await put('src/todos/ui/TodoList/TodoList.tsx', 'export const TodoList = () => null\n')
	await put('src/app/App/App.tsx', 'export const App = () => null\n')
	await put('tests/unit/todos/ListTodos.test.ts', "import { describe, expect, it } from 'vitest'\ndescribe('ListTodos', () => { it('should list', () => expect([]).toEqual([])) })\n")
	await writeFile(join(root, '.gitignore'), 'node_modules/\n.fake-tools.*\nevidence/\n')
	await put('.fake-tools.json', JSON.stringify(scenario))
	execFileSync('git', ['init', '-q', root])
	assert.deepEqual(await configureMutation({ root, package: pkgDir }), ['stryker.core.json', 'stryker.boundary.json'])
	execFileSync('git', ['-C', root, 'add', '.'])
	execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'], { env: { ...process.env, HUSKY: '0' } })
	return {
		root,
		pkg,
		read: (name) => readFile(join(pkg, name), 'utf8'),
		evidence: (name) => readFile(join(root, 'evidence', name), 'utf8'),
		put,
		scenario: (patch) => writeFile(join(pkg, '.fake-tools.json'), JSON.stringify(patch)),
		calls: async () => (await readFile(join(pkg, '.fake-tools.calls'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line)),
		commit: () => execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qam', 'work'], { env: { ...process.env, HUSKY: '0' } }),
	}
}

const core = (root, extra = {}) => ({ root, scope: 'core', config: 'stryker.core.json', evidence: 'evidence', ...extra })
const boundary = (root, extra = {}) => ({ root, scope: 'boundary', config: 'stryker.boundary.json', evidence: 'evidence', ...extra })

test('the scaffold writes one Stryker config per scope from the feature folders', async (t) => {
	const { read } = await project(t)
	assert.deepEqual(JSON.parse(await read('stryker.core.json')).mutate, ['src/*/application/**/*.{ts,tsx}'])
	assert.deepEqual(JSON.parse(await read('stryker.boundary.json')).mutate, ['src/*/infrastructure/**/*.{ts,tsx}', 'src/*/ui/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'])
})

test('core runs the suite unmutated, then Stryker on the core files, and deposits a passing verdict', async (t) => {
	const p = await project(t, { scenario: { report: { 'src/todos/application/ListTodos.ts': { mutants: [mutant(3, 'Killed'), mutant(2, 'Timeout')] } } } })
	const result = await runMutationGate(core(p.root))
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
	assert.match(await p.evidence('qg-mutation.stdout'), /core mutation score 100\.00% meets 100%/)
	assert.equal((await p.evidence('qg-mutation.exit')).trim(), '0')
	const calls = await p.calls()
	assert.deepEqual(calls.map(([tool]) => tool), ['vitest', 'stryker'])
	const effective = JSON.parse(await p.read('.fake-tools.stryker-config.json'))
	assert.deepEqual(effective.mutate, ['src/todos/application/ListTodos.ts', 'src/todos/application/TodoGateway.ts'])
	assert.equal(effective.testRunner, 'vitest')
	assert.equal(effective.incremental, false)
	const manifest = JSON.parse(await p.evidence('qg-mutation/manifest.json'))
	assert.equal(manifest.versions['@stryker-mutator/core'], '10.0.0')
})

test('a survivor below the bar fails the gate and is listed by file and line', async (t) => {
	const p = await project(t, { scenario: { report: { 'src/todos/application/ListTodos.ts': { mutants: [mutant(3, 'Killed'), mutant(2, 'Survived'), mutant(4, 'NoCoverage')] } } } })
	const result = await runMutationGate(core(p.root))
	assert.equal(result.exitCode, 1)
	const text = await p.evidence('qg-mutation.stdout')
	assert.match(text, /survived: src\/todos\/application\/ListTodos\.ts:2 ConditionalExpression/)
	assert.match(text, /no coverage: src\/todos\/application\/ListTodos\.ts:4/)
	assert.match(text, /score 33\.33% is below 100%/)
})

test('boundary refuses to start until core passed in the same evidence directory', async (t) => {
	const p = await project(t)
	const result = await runMutationGate(boundary(p.root))
	assert.equal(result.exitCode, 2)
	assert.match(result.lines.join('\n'), /run --scope core first/)
})

test('boundary passes at 80% once core passed', async (t) => {
	const p = await project(t, { scenario: { report: { 'src/todos/application/ListTodos.ts': { mutants: [mutant(3, 'Killed')] } } } })
	assert.equal((await runMutationGate(core(p.root))).exitCode, 0)
	const mutants = [1, 2, 3, 4].map((line) => mutant(line, 'Killed')).concat([mutant(5, 'Survived')])
	await p.scenario({ report: { 'src/todos/ui/TodoList/TodoList.tsx': { mutants } } })
	const result = await runMutationGate(boundary(p.root))
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
	assert.match(await p.evidence('qg-mutation-boundary.stdout'), /boundary mutation score 80\.00% meets 80%/)
})

test('--since mutates only the core files the story changed, untracked ones included', async (t) => {
	const p = await project(t, { scenario: { report: { 'src/todos/application/CompleteTodo.ts': { mutants: [mutant(1, 'Killed')] } } } })
	const base = execFileSync('git', ['-C', p.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
	await p.put('src/todos/application/CompleteTodo.ts', 'export class CompleteTodo {}\n')
	const result = await runMutationGate(core(p.root, { since: base }))
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
	assert.deepEqual(JSON.parse(await p.read('.fake-tools.stryker-config.json')).mutate, ['src/todos/application/CompleteTodo.ts'])
})

test('--since with no core change passes without running anything', async (t) => {
	const p = await project(t)
	const base = execFileSync('git', ['-C', p.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
	const result = await runMutationGate(core(p.root, { since: base }))
	assert.equal(result.exitCode, 0)
	assert.match(result.lines.join('\n'), /No core source changed/)
})

test('a red suite blocks before any mutant runs', async (t) => {
	const p = await project(t, { scenario: { testsExit: 1 } })
	const result = await runMutationGate(core(p.root))
	assert.equal(result.exitCode, 1)
	assert.match(result.lines.join('\n'), /fails without any mutation/)
	assert.deepEqual((await p.calls()).map(([tool]) => tool), ['vitest'])
})

test('a Stryker disable comment without a reason, or for a whole file, blocks the run', async (t) => {
	const p = await project(t)
	await p.put('src/todos/application/ListTodos.ts', '// Stryker disable next-line all\nexport class ListTodos {}\n')
	assert.match((await runMutationGate(core(p.root))).lines.join('\n'), /disable one line only, with a reason/)
	await p.put('src/todos/application/ListTodos.ts', '// Stryker disable all: legacy code\nexport class ListTodos {}\n')
	assert.match((await runMutationGate(core(p.root))).lines.join('\n'), /disable one line only, with a reason/)
	await p.put('src/todos/application/ListTodos.ts', '// Stryker disable next-line StringLiteral: the label is never read by any behaviour\nexport class ListTodos {}\n')
	await p.scenario({ report: { 'src/todos/application/ListTodos.ts': { mutants: [mutant(2, 'Killed'), mutant(2, 'Ignored')] } } })
	assert.equal((await runMutationGate(core(p.root))).exitCode, 0)
})

test('a config that adds options, negative patterns or another runner is refused', async (t) => {
	const p = await project(t)
	for (const config of [
		{ testRunner: 'vitest', mutate: ['src/*/application/**/*.ts'], thresholds: { break: 50 } },
		{ testRunner: 'vitest', mutate: ['src/*/application/**/*.ts', '!src/todos/application/ListTodos.ts'] },
		{ testRunner: 'jest', mutate: ['src/*/application/**/*.ts'] },
		{ testRunner: 'vitest', mutate: ['src/*/domain/**/*.ts'] },
	]) {
		await p.put('stryker.core.json', JSON.stringify(config))
		p.commit()
		assert.equal((await runMutationGate(core(p.root))).exitCode, 2, JSON.stringify(config))
	}
})

test('an uncommitted config is refused', async (t) => {
	const p = await project(t)
	await p.put('stryker.other.json', JSON.stringify({ testRunner: 'vitest', mutate: ['src/*/application/**/*.ts'] }))
	const result = await runMutationGate(core(p.root, { config: 'stryker.other.json' }))
	assert.equal(result.exitCode, 2)
})

test('Vitest 5 under StrykerJS 10 blocks instead of reporting every mutant as survived', async (t) => {
	const p = await project(t, { versions: { vitest: '5.0.3', '@vitest/coverage-v8': '5.0.3' } })
	const result = await runMutationGate(core(p.root))
	assert.equal(result.exitCode, 2)
	assert.match(result.lines.join('\n'), /StrykerJS 10 runs on Vitest 4\.x; found vitest 5\.0\.3/)
})

test('another Stryker major or mismatched runner version blocks', async (t) => {
	const p = await project(t, { versions: { '@stryker-mutator/core': '9.6.1', '@stryker-mutator/vitest-runner': '9.6.1' } })
	assert.match((await runMutationGate(core(p.root))).lines.join('\n'), /@stryker-mutator\/core 10\.x required/)
	const q = await project(t, { versions: { '@stryker-mutator/vitest-runner': '10.0.1' } })
	assert.match((await runMutationGate(core(q.root))).lines.join('\n'), /share one version/)
})

test('a source left mutated is restored and fails the gate', async (t) => {
	const p = await project(t, { scenario: { leaveMutant: 'src/todos/application/ListTodos.ts', report: {} } })
	const result = await runMutationGate(core(p.root))
	assert.equal(result.exitCode, 1)
	assert.match(result.lines.join('\n'), /left mutated and have been restored/)
	assert.equal(await p.read('src/todos/application/ListTodos.ts'), 'export class ListTodos {\n  execute() {\n    return []\n  }\n}\n')
})

test('Stryker without a report fails', async (t) => {
	const p = await project(t, { scenario: { noReport: true } })
	assert.match((await runMutationGate(core(p.root))).lines.join('\n'), /no JSON report/)
})

test('a front end in a subfolder resolves its own node_modules and paths', async (t) => {
	const p = await project(t, { pkgDir: 'web', scenario: { report: { 'src/todos/application/ListTodos.ts': { mutants: [mutant(1, 'Killed')] } } } })
	const result = await runMutationGate(core(p.root, { package: 'web' }))
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
})

test('argument parsing refuses unknown scopes and options', () => {
	assert.throws(() => parseMutationArgs(['--root', '.', '--scope', 'ui', '--config', 'x', '--evidence', 'e']), /core or boundary/)
	assert.throws(() => parseMutationArgs(['--root', '.', '--scope', 'core', '--config', 'x', '--evidence', 'e', '--threshold', '50']), /Unknown option/)
})

test('coverage passes when every core line runs, type-only files aside', async (t) => {
	const p = await project(t, { scenario: { coverage: { 'src/todos/application/ListTodos.ts': { total: 3, covered: 3, skipped: 0, pct: 100 } } } })
	const result = await runCoverageGate({ root: p.root, evidence: 'evidence' })
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
	assert.match(await p.evidence('qg-coverage.stdout'), /Core line coverage 100% \(3\/3 lines, 1 type-only file/)
	const [, ...args] = (await p.calls()).at(-1)
	assert.ok(args.includes('--coverage.include=src/*/application/**/*.{ts,tsx}'))
})

test('coverage fails on an uncovered line, an unmeasured file or an ignore comment', async (t) => {
	const p = await project(t, { scenario: { coverage: { 'src/todos/application/ListTodos.ts': { total: 3, covered: 2, skipped: 0, pct: 66 } } } })
	assert.match((await runCoverageGate({ root: p.root, evidence: 'evidence' })).lines.join('\n'), /uncovered lines in 1 file/)
	await p.scenario({ coverage: {} })
	assert.match((await runCoverageGate({ root: p.root, evidence: 'evidence' })).lines.join('\n'), /never measured: src\/todos\/application\/ListTodos\.ts/)
	await p.put('src/todos/application/ListTodos.ts', '/* v8 ignore next */\nexport const x = 1\n')
	await p.scenario({ coverage: { 'src/todos/application/ListTodos.ts': { total: 1, covered: 1, skipped: 0, pct: 100 } } })
	assert.match((await runCoverageGate({ root: p.root, evidence: 'evidence' })).lines.join('\n'), /coverage exclusions in the core/)
	assert.match((await runCoverageGate({ root: p.root, evidence: 'evidence', threshold: '90' })).lines.join('\n'), /--threshold is refused/)
})

test('coverage requires the v8 provider of the same major as vitest', async (t) => {
	const p = await project(t, { versions: { '@vitest/coverage-v8': '3.2.0' } })
	assert.match((await runCoverageGate({ root: p.root, evidence: 'evidence' })).lines.join('\n'), /does not match vitest/)
})

test('no Vitest double, mocking library or MSW in the core or the unit tests', async (t) => {
	const p = await project(t)
	assert.equal((await runNoMocksGate({ root: p.root, evidence: 'evidence' })).exitCode, 0)
	assert.equal(await p.evidence('qg-mocks.stdout'), '')
	await p.put('tests/unit/todos/ui/TodoList.test.tsx', "import { vi } from 'vitest'\nconst onSave = vi.fn()\n")
	await p.put('src/todos/application/ListTodos.ts', "import { http } from 'msw'\n")
	const result = await runNoMocksGate({ root: p.root, evidence: 'evidence' })
	assert.equal(result.exitCode, 1)
	assert.match(result.text, /tests\/unit\/todos\/ui\/TodoList\.test\.tsx:2: const onSave = vi\.fn\(\)/)
	assert.match(result.text, /src\/todos\/application\/ListTodos\.ts:1/)
})

test('architecture: the boundaries rules must be active, then ESLint must be clean', async (t) => {
	const p = await project(t)
	assert.equal((await runArchitectureGate({ root: p.root, evidence: 'evidence' })).exitCode, 0)
	await p.scenario({ rules: { 'boundaries/dependencies': 'off' } })
	const missing = await runArchitectureGate({ root: p.root, evidence: 'evidence' })
	assert.equal(missing.exitCode, 1)
	assert.match(missing.lines.join('\n'), /boundaries\/dependencies is not an error rule; boundaries\/no-unknown-files is not an error rule/)
	await p.scenario({ rulesByFile: { 'src/todos/ui/TodoList/TodoList.tsx': { 'boundaries/dependencies': 'off', 'boundaries/no-unknown-files': 'off' } } })
	const overridden = await runArchitectureGate({ root: p.root, evidence: 'evidence' })
	assert.equal(overridden.exitCode, 1, 'an override that switches the rules off for one file fails the gate')
	assert.match(overridden.lines.join('\n'), /lacks the architecture rules for 1 of 5 source file\(s\): src\/todos\/ui\/TodoList\/TodoList\.tsx/)
	await p.scenario({ lintExit: 1, lintOutput: 'src/todos/ui/TodoList/TodoList.tsx  1:1  error  feature todos imports feature projects' })
	const dirty = await runArchitectureGate({ root: p.root, evidence: 'evidence' })
	assert.equal(dirty.exitCode, 1)
	assert.match(await p.evidence('qg-arch.stdout'), /feature todos imports feature projects/)
})

test('capture runs a package command through node and records its exit code', async (t) => {
	const p = await project(t, { scenario: { testsExit: 1 } })
	const result = await runCapture({ root: p.root, evidence: 'evidence', name: 'qg-tests' }, '{bin:vitest}', ['run'])
	assert.equal(result.code, 1)
	assert.equal((await p.evidence('qg-tests.exit')).trim(), '1')
	assert.match(await p.evidence('qg-tests.stdout'), /Tests 1 failed/)
	assert.match(await p.evidence('qg-tests.stdout.sha256'), /^[0-9a-f]{64}\n$/)
})

test('a config that mutates only part of the core layers is refused', async (t) => {
	const p = await project(t)
	await p.put('stryker.core.json', JSON.stringify({ testRunner: 'vitest', mutate: ['src/todos/application/ListTodos.ts'] }))
	p.commit()
	const result = await runMutationGate(core(p.root))
	assert.equal(result.exitCode, 2)
	assert.match(result.lines.join('\n'), /leaves core code out of mutation: src\/todos\/application\/TodoGateway\.ts/)
})

test('boundary refuses core evidence the code has moved past', async (t) => {
	const killedCore = { 'src/todos/application/ListTodos.ts': { mutants: [mutant(3, 'Killed')] } }
	const killedUi = { 'src/todos/ui/TodoList/TodoList.tsx': { mutants: [mutant(1, 'Killed')] } }
	for (const [label, change, extra] of [
		['a core source', (p) => p.put('src/todos/application/ListTodos.ts', 'export class ListTodos {}\n'), {}],
		['a test', (p) => p.put('tests/unit/todos/ListTodos.test.ts', "import { it } from 'vitest'\nit('should run', () => {})\n"), {}],
		['the --since base', () => {}, { since: 'HEAD' }],
	]) {
		const p = await project(t, { scenario: { report: killedCore } })
		assert.equal((await runMutationGate(core(p.root))).exitCode, 0, label)
		await change(p)
		await p.scenario({ report: killedUi })
		const result = await runMutationGate(boundary(p.root, extra))
		assert.equal(result.exitCode, 2, label)
		assert.match(result.lines.join('\n'), /core evidence no longer matches the code/, label)
	}
})
