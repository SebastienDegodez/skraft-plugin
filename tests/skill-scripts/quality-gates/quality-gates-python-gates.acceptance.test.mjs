import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { runCoverageGate } from '../../../plugins/skraft-framework/skills/quality-gates-python/scripts/coverage-core.mjs'
import { runNoMocksGate } from '../../../plugins/skraft-framework/skills/quality-gates-python/scripts/no-mocks-in-core.mjs'

const fake = fileURLToPath(new URL('./quality-gates-python-fake-python.fixture.mjs', import.meta.url))
const VERSIONS = { coverage: '7.6.1', pytest: '8.3.3' }

async function project(t, scenario = {}) {
	const root = await mkdtemp(join(tmpdir(), 'qg-py-'))
	t.after(() => rm(root, { recursive: true, force: true }))
	const put = async (name, body) => {
		await mkdir(dirname(join(root, name)), { recursive: true })
		await writeFile(join(root, name), body)
	}
	for (const layer of ['domain', 'application', 'infrastructure', 'api']) {
		await put(`src/shop/${layer}/__init__.py`, '')
		await put(`src/shop/${layer}/${layer}_module.py`, `VALUE = "${layer}"\n`)
	}
	await put('tests/unit/test_core.py', 'def test_core():\n    assert True\n')
	await put('.gitignore', '.venv/\n.fake-python.*\nevidence/\n')
	await put('.fake-python.json', JSON.stringify({ versions: VERSIONS, ...scenario }))
	execFileSync('git', ['init', '-q', root])
	execFileSync('git', ['-C', root, 'add', '.'])
	execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'], { env: { ...process.env, HUSKY: '0' } })
	const scenarioFile = join(root, '.fake-python.json')
	return {
		root,
		read: (name) => readFile(join(root, name), 'utf8'),
		scenario: async (patch) => writeFile(scenarioFile, JSON.stringify({ versions: VERSIONS, ...patch })),
		calls: async () => (await readFile(join(root, '.fake-python.calls'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line)),
	}
}

test('coverage of the core passes at 100% and fails on an uncovered line', async (t) => {
	const files = (missing) => ({ files: {
		'src/shop/domain/__init__.py': { summary: { num_statements: 0, covered_lines: 0, missing_lines: 0 }, missing_lines: [] },
		'src/shop/domain/domain_module.py': { summary: { num_statements: 1, covered_lines: 1 - missing.length, missing_lines: missing.length }, missing_lines: missing },
		'src/shop/application/__init__.py': { summary: { num_statements: 0, covered_lines: 0, missing_lines: 0 }, missing_lines: [] },
		'src/shop/application/application_module.py': { summary: { num_statements: 1, covered_lines: 1, missing_lines: 0 }, missing_lines: [] },
	} })
	const p = await project(t, { coverageReport: files([]) })
	assert.equal((await runCoverageGate({ root: p.root, evidence: 'evidence', python: fake })).exitCode, 0)
	assert.match(await p.read('evidence/qg-coverage.stdout'), /line coverage 100% \(2\/2 statements\)/)
	await p.scenario({ coverageReport: files([1]) })
	assert.equal((await runCoverageGate({ root: p.root, evidence: 'evidence', python: fake })).exitCode, 1)
	assert.match(await p.read('evidence/qg-coverage.stdout'), /missing: src\/shop\/domain\/domain_module.py: 1/)
	await p.scenario({ pytestExit: 1, coverageReport: files([]) })
	assert.equal((await runCoverageGate({ root: p.root, evidence: 'evidence', python: fake })).exitCode, 1)
	assert.equal((await runCoverageGate({ root: p.root, evidence: 'evidence', threshold: '90', python: fake })).exitCode, 2)
	const source = (await p.calls()).find((call) => call.includes('coverage') && call.includes('run')).find((arg) => arg.startsWith('--source='))
	assert.equal(source, '--source=src/shop/application,src/shop/domain')
})

test('the core is found by folder name: without a domain or application folder G7 and G11 block', async (t) => {
	const p = await project(t)
	for (const layer of ['domain', 'application']) execFileSync('git', ['-C', p.root, 'rm', '-rq', `src/shop/${layer}`])
	assert.equal((await runCoverageGate({ root: p.root, evidence: 'evidence', python: fake })).exitCode, 2)
	assert.match(await p.read('evidence/qg-coverage.stdout'), /No Domain or Application source/)
	assert.equal((await runNoMocksGate({ root: p.root, evidence: 'evidence', python: fake })).exitCode, 2)
})

test('a mock in a core source fails G7, wherever the core folder sits', async (t) => {
	const p = await project(t)
	await mkdir(join(p.root, 'billing_domain'), { recursive: true })
	await writeFile(join(p.root, 'billing_domain/rules.py'), 'from unittest.mock import patch\n')
	const result = await runNoMocksGate({ root: p.root, evidence: 'evidence', python: fake })
	assert.equal(result.exitCode, 1)
	assert.equal(result.text, 'billing_domain/rules.py:1: from unittest.mock import patch\n')
})

test('a mocking library in the core or its unit tests fails G7', async (t) => {
	const p = await project(t)
	assert.equal((await runNoMocksGate({ root: p.root, evidence: 'evidence', python: fake })).exitCode, 0)
	assert.equal(await p.read('evidence/qg-mocks.stdout'), '')
	await writeFile(join(p.root, 'tests/unit/test_core.py'), 'from unittest.mock import MagicMock\n')
	const result = await runNoMocksGate({ root: p.root, evidence: 'evidence', python: fake })
	assert.equal(result.exitCode, 1)
	assert.equal(result.text, 'tests/unit/test_core.py:1: from unittest.mock import MagicMock\n')
})
