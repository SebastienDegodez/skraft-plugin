import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { runCoverageGate } from '../../../plugins/skraft-framework/skills/quality-gates-typescript/scripts/coverage-core.mjs'
import { runNoMocksGate } from '../../../plugins/skraft-framework/skills/quality-gates-typescript/scripts/no-mocks-in-core.mjs'
import { runArchitectureGate } from '../../../plugins/skraft-framework/skills/quality-gates-typescript/scripts/architecture-gate.mjs'

const fake = pathToFileURL(fileURLToPath(new URL('./quality-gates-typescript-fake-tools.fixture.mjs', import.meta.url))).href
const fakeEslintApi = pathToFileURL(fileURLToPath(new URL('./quality-gates-typescript-fake-eslint-api.fixture.mjs', import.meta.url))).href
const VERSIONS = { vitest: '4.1.11', '@vitest/coverage-v8': '4.1.11', eslint: '9.39.5' }
const BINS = { vitest: ['vitest', 'vitest.mjs'], eslint: ['eslint', 'bin/eslint.mjs'] }

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


test('coverage passes when every core line runs, type-only files aside', async (t) => {
	const p = await project(t, { scenario: { coverage: { 'src/todos/application/ListTodos.ts': { total: 3, covered: 3, skipped: 0, pct: 100 } } } })
	const result = await runCoverageGate({ root: p.root, evidence: 'evidence' })
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
	assert.match(await p.evidence('qg-coverage.stdout'), /Core line coverage 100% \(3\/3 lines, 1 type-only file/)
	const [, ...args] = (await p.calls()).at(-1)
	assert.ok(args.includes('--coverage.include=src/todos/application/**'))
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

test('the core is found by folder name: without a domain or application folder G7 and G11 block', async (t) => {
	const p = await project(t)
	execFileSync('git', ['-C', p.root, 'rm', '-rq', 'src/todos/application'])
	const coverage = await runCoverageGate({ root: p.root, evidence: 'evidence' })
	assert.equal(coverage.exitCode, 2)
	assert.match(coverage.lines.join('\n'), /No Domain or Application source/)
	assert.equal((await runNoMocksGate({ root: p.root, evidence: 'evidence' })).exitCode, 2)
})

test('a front end in a subfolder resolves its own node_modules and core', async (t) => {
	const p = await project(t, { pkgDir: 'web', scenario: { coverage: { 'src/todos/application/ListTodos.ts': { total: 3, covered: 3, skipped: 0, pct: 100 } } } })
	const result = await runCoverageGate({ root: p.root, package: 'web', evidence: 'evidence' })
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
})
