import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { runNoMocksGate } from '../../../plugins/skraft-framework/skills/quality-gates-python/scripts/no-mocks-in-core.mjs'
import { runCapture } from '../../../plugins/skraft-framework/skills/quality-gates-python/scripts/capture.mjs'

const fake = fileURLToPath(new URL('./quality-gates-python-fake-python.fixture.mjs', import.meta.url))
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
	await put('.fake-python.json', JSON.stringify(scenario))
	execFileSync('git', ['init', '-q', root])
	execFileSync('git', ['-C', root, 'add', '.'])
	execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'], { env: { ...process.env, HUSKY: '0' } })
	const scenarioFile = join(root, '.fake-python.json')
	return {
		root,
		read: (name) => readFile(join(root, name), 'utf8'),
		scenario: async (patch) => writeFile(scenarioFile, JSON.stringify(patch)),
	}
}

test('the core is found by folder name: without a domain or application folder test.no-mocks-core blocks', async (t) => {
	const p = await project(t)
	for (const layer of ['domain', 'application']) execFileSync('git', ['-C', p.root, 'rm', '-rq', `src/shop/${layer}`])
	assert.equal((await runNoMocksGate({ root: p.root, evidence: 'evidence', python: fake })).exitCode, 2)
	assert.match(await p.read('evidence/qg-mocks.stdout'), /No Domain or Application source/)
})

test('a mock in a core source fails test.no-mocks-core, wherever the core folder sits', async (t) => {
	const p = await project(t)
	await mkdir(join(p.root, 'billing_domain'), { recursive: true })
	await writeFile(join(p.root, 'billing_domain/rules.py'), 'from unittest.mock import patch\n')
	const result = await runNoMocksGate({ root: p.root, evidence: 'evidence', python: fake })
	assert.equal(result.exitCode, 1)
	assert.equal(result.text, 'billing_domain/rules.py:1: from unittest.mock import patch\n')
})

test('a mocking library in the core or its unit tests fails test.no-mocks-core', async (t) => {
	const p = await project(t)
	assert.equal((await runNoMocksGate({ root: p.root, evidence: 'evidence', python: fake })).exitCode, 0)
	assert.equal(await p.read('evidence/qg-mocks.stdout'), '')
	await writeFile(join(p.root, 'tests/unit/test_core.py'), 'from unittest.mock import MagicMock\n')
	const result = await runNoMocksGate({ root: p.root, evidence: 'evidence', python: fake })
	assert.equal(result.exitCode, 1)
	assert.equal(result.text, 'tests/unit/test_core.py:1: from unittest.mock import MagicMock\n')
})

test('capture runs {python} as the project interpreter and deposits stdout, exit and hash', async (t) => {
	const p = await project(t)
	const result = await runCapture({ root: p.root, evidence: 'evidence', name: 'qg-tests', python: fake }, '{python}', ['-m', 'pytest', '-q'])
	assert.equal(result.code, 0)
	assert.equal((await p.read('evidence/qg-tests.exit')).trim(), '0')
	assert.match(await p.read('evidence/qg-tests.stdout'), /3 passed/)
	assert.match(await p.read('evidence/qg-tests.stdout.sha256'), /^[0-9a-f]{64}\n$/)
	await p.scenario({ pytestExit: 1 })
	assert.equal((await runCapture({ root: p.root, evidence: 'evidence', name: 'qg-tests', python: fake }, '{python}', ['-m', 'pytest'])).code, 1)
	await assert.rejects(() => runCapture({ root: p.root, evidence: 'evidence', name: '../escape', python: fake }, '{python}', []))
})
