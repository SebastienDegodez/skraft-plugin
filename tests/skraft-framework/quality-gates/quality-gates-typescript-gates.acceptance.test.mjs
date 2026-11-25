import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { runNoMocksGate } from '../../../plugins/skraft-framework/skills/quality-gates-typescript/scripts/no-mocks-in-core.mjs'
import { runCapture } from '../../../plugins/skraft-framework/skills/quality-gates-typescript/scripts/capture.mjs'

const LOG = 'evidence/qg-todos.json'
const fake = pathToFileURL(fileURLToPath(new URL('./quality-gates-typescript-fake-tools.fixture.mjs', import.meta.url))).href
const VERSIONS = { vitest: '4.1.11', eslint: '9.39.5' }
const BINS = { vitest: ['vitest', 'vitest.mjs'], eslint: ['eslint', 'bin/eslint.mjs'] }

async function project(t, { scenario = {}, pkgDir = '.' } = {}) {
	const root = await mkdtemp(join(tmpdir(), 'qg-ts-'))
	t.after(() => rm(root, { recursive: true, force: true }))
	const pkg = join(root, pkgDir)
	const put = async (name, body) => {
		await mkdir(dirname(join(pkg, name)), { recursive: true })
		await writeFile(join(pkg, name), body)
	}
	for (const [name, version] of Object.entries(VERSIONS)) {
		const [bin, file] = BINS[name] ?? []
		await put(`node_modules/${name}/package.json`, JSON.stringify({ name, version, ...(bin ? { bin: { [bin]: file } } : {}) }))
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
		gate: async (id) => JSON.parse(await readFile(join(root, LOG), 'utf8')).gates.find((gate) => gate.id === id),
		evidenceFiles: () => readdir(join(root, 'evidence')),
		put,
		calls: async () => (await readFile(join(pkg, '.fake-tools.calls'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line)),
	}
}

test('no Vitest double, mocking library or MSW in the core or the unit tests', async (t) => {
	const p = await project(t)
	assert.equal((await runNoMocksGate({ root: p.root, log: LOG })).exitCode, 0)
	assert.deepEqual(await p.evidenceFiles(), ['qg-todos.json'])
	assert.equal((await p.gate('test.no-mocks-core')).status, 'pass')
	await p.put('tests/unit/todos/ui/TodoList.test.tsx', "import { vi } from 'vitest'\nconst onSave = vi.fn()\n")
	await p.put('src/todos/application/ListTodos.ts', "import { http } from 'msw'\n")
	const result = await runNoMocksGate({ root: p.root, log: LOG })
	assert.equal(result.exitCode, 1)
	assert.match(result.text, /tests\/unit\/todos\/ui\/TodoList\.test\.tsx:2: const onSave = vi\.fn\(\)/)
	assert.match(result.text, /src\/todos\/application\/ListTodos\.ts:1/)
})

test('capture runs a package command through node and records its exit code as the gate status', async (t) => {
	const p = await project(t, { scenario: { testsExit: 1 } })
	const result = await runCapture({ root: p.root, log: LOG, gate: 'test.acceptance,test.unit' }, '{bin:vitest}', ['run'])
	assert.equal(result.code, 1)
	assert.match(result.tail, /Tests 1 failed/)
	assert.deepEqual(await p.evidenceFiles(), ['qg-todos.json'])
	const gate = await p.gate('test.unit')
	assert.equal(gate.status, 'fail')
	assert.match(gate.summary, /Tests 1 failed/)
})

test('the core is found by folder name: without a domain or application folder test.no-mocks-core blocks', async (t) => {
	const p = await project(t)
	execFileSync('git', ['-C', p.root, 'rm', '-rq', 'src/todos/application'])
	const result = await runNoMocksGate({ root: p.root, log: LOG })
	assert.equal(result.exitCode, 2)
	assert.match(result.text, /No Domain or Application source/)
})

test('a front end in a subfolder resolves its own node_modules and core', async (t) => {
	const p = await project(t, { pkgDir: 'web', scenario: { lintExit: 1, lintOutput: 'src/todos/ui/TodoList/TodoList.tsx  1:1  error  boundaries/dependencies' } })
	const result = await runNoMocksGate({ root: p.root, package: 'web', log: LOG })
	assert.equal(result.exitCode, 0, result.text)
	const lint = await runCapture({ root: p.root, package: 'web', log: LOG, gate: 'build.lint' }, '{bin:eslint}', ['.', '--max-warnings', '0'])
	assert.equal(lint.code, 1, 'a boundaries violation fails build.lint')
	assert.match((await p.gate('build.lint')).summary, /boundaries\/dependencies/)
	assert.deepEqual((await p.calls()).at(-1), ['eslint', '.', '--max-warnings', '0'])
})
