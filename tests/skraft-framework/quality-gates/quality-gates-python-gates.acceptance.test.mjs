import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { parseMutationArgs, runMutationGate } from '../../../plugins/skraft-framework/skills/quality-gates-python/scripts/mutation-gate.mjs'
import { runCoverageGate } from '../../../plugins/skraft-framework/skills/quality-gates-python/scripts/coverage-core.mjs'
import { runNoMocksGate } from '../../../plugins/skraft-framework/skills/quality-gates-python/scripts/no-mocks-in-core.mjs'
import { runCapture } from '../../../plugins/skraft-framework/skills/quality-gates-python/scripts/capture.mjs'
import { configureMutation } from '../../../plugins/skraft-framework/skills/quality-gates-python/scripts/configure-mutation.mjs'

const fake = fileURLToPath(new URL('./quality-gates-python-fake-python.fixture.mjs', import.meta.url))
const posixOnly = { skip: process.platform === 'win32' ? 'fake interpreter is a POSIX shell wrapper' : false }
const VERSIONS = { 'cosmic-ray': '8.3.8', coverage: '7.6.1', pytest: '8.3.3' }
const item = (path, line) => ({ mutations: [{ module_path: path, start_pos: [line, 0], operator_name: 'core/AddNot', occurrence: 0 }] })
const killed = (path, line) => [item(path, line), { worker_outcome: 'normal', test_outcome: 'killed' }]
const survived = (path, line) => [item(path, line), { worker_outcome: 'normal', test_outcome: 'survived' }]

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
	await put('.venv/bin/python', `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`)
	await chmod(join(root, '.venv/bin/python'), 0o755)
	await put('.fake-python.json', JSON.stringify({ versions: VERSIONS, ...scenario }))
	execFileSync('git', ['init', '-q', root])
	assert.deepEqual(await configureMutation({ root }), ['cosmic-ray-core.toml', 'cosmic-ray-boundary.toml'])
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

const core = (root, extra = {}) => ({ root, scope: 'core', config: 'cosmic-ray-core.toml', evidence: 'evidence', ...extra })
const boundary = (root, extra = {}) => ({ root, scope: 'boundary', config: 'cosmic-ray-boundary.toml', evidence: 'evidence', ...extra })

test('the scaffold writes one config per scope from the layer packages', posixOnly, async (t) => {
	const { read } = await project(t)
	assert.match(await read('cosmic-ray-core.toml'), /module-path = \["src\/shop\/domain", "src\/shop\/application"\]/)
	assert.match(await read('cosmic-ray-boundary.toml'), /module-path = \["src\/shop\/infrastructure", "src\/shop\/api"\]/)
})

test('core runs baseline, init, pragma filter, exec and dump, then deposits a passing verdict', posixOnly, async (t) => {
	const p = await project(t, { dump: [killed('src/shop/domain/domain_module.py', 1)] })
	const result = await runMutationGate(core(p.root))
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
	assert.equal((await p.read('evidence/qg-mutation.exit')).trim(), '0')
	assert.match(await p.read('evidence/qg-mutation.stdout'), /core mutation score 100.00% meets 100%/)
	const steps = (await p.calls()).filter((call) => call[0] === '-m').map((call) => call[1] === 'cosmic_ray.cli' ? call[2] : call[1])
	assert.deepEqual(steps, ['baseline', 'init', 'cosmic_ray.tools.filters.pragma_no_mutate', 'exec', 'dump'])
	const manifest = JSON.parse(await p.read('evidence/qg-mutation/manifest.json'))
	assert.equal(manifest.cosmic_ray, '8.3.8')
	assert.deepEqual(Object.keys(manifest.sources).sort(), ['src/shop/application/__init__.py', 'src/shop/application/application_module.py', 'src/shop/domain/__init__.py', 'src/shop/domain/domain_module.py'])
})

test('a surviving core mutant fails the gate and is listed', posixOnly, async (t) => {
	const p = await project(t, { dump: [killed('src/shop/domain/domain_module.py', 1), survived('src/shop/domain/domain_module.py', 1)] })
	const result = await runMutationGate(core(p.root))
	assert.equal(result.exitCode, 1)
	assert.match(result.lines.join('\n'), /survived: src\/shop\/domain\/domain_module.py:1 core\/AddNot/)
	assert.equal((await p.read('evidence/qg-mutation.exit')).trim(), '1')
})

test('a red baseline blocks mutation: every mutant would look killed', posixOnly, async (t) => {
	const p = await project(t, { baselineExit: 1, dump: [killed('src/shop/domain/domain_module.py', 1)] })
	const result = await runMutationGate(core(p.root))
	assert.equal(result.exitCode, 1)
	assert.match(result.lines.join('\n'), /fails without any mutation/)
	assert.equal((await p.calls()).some((call) => call[2] === 'exec'), false)
})

test('a source left mutated by an interrupted run is restored and fails the gate', posixOnly, async (t) => {
	const p = await project(t, { leaveMutant: 'src/shop/domain/domain_module.py', dump: [killed('src/shop/domain/domain_module.py', 1)] })
	const result = await runMutationGate(core(p.root))
	assert.equal(result.exitCode, 1)
	assert.match(result.lines.join('\n'), /left mutated and have been restored: src\/shop\/domain\/domain_module.py/)
	assert.equal(await p.read('src/shop/domain/domain_module.py'), 'VALUE = "domain"\n')
})

test('boundary refuses to run before core passed in the same evidence directory', posixOnly, async (t) => {
	const p = await project(t, { dump: [killed('src/shop/api/api_module.py', 1)] })
	assert.equal((await runMutationGate(boundary(p.root))).exitCode, 2)
	assert.equal((await runMutationGate(core(p.root))).exitCode, 0)
	const result = await runMutationGate(boundary(p.root))
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
	assert.match(await p.read('evidence/qg-mutation-boundary.stdout'), /boundary mutation score 100.00% meets 80%/)
})

test('--since mutates only the scope files changed since the base, untracked ones included', posixOnly, async (t) => {
	const p = await project(t, { dump: [killed('src/shop/domain/new_rule.py', 1)] })
	const unchanged = await runMutationGate(core(p.root, { since: 'HEAD' }))
	assert.equal(unchanged.exitCode, 0)
	assert.match(unchanged.lines.join('\n'), /No core source changed since/)
	await writeFile(join(p.root, 'src/shop/domain/new_rule.py'), 'LIMIT = 3\n')
	const changed = await runMutationGate(core(p.root, { since: 'HEAD' }))
	assert.equal(changed.exitCode, 0, changed.lines.join('\n'))
	assert.match(await p.read('evidence/qg-mutation/cosmic-ray.toml'), /module-path = \["src\/shop\/domain\/new_rule.py"\]/)
})

test('an unexplained no-mutate pragma, an unsupported cosmic-ray or an uncommitted config blocks', posixOnly, async (t) => {
	const p = await project(t, { dump: [] })
	await writeFile(join(p.root, 'src/shop/domain/domain_module.py'), 'VALUE = "domain"  # pragma: no mutate\n')
	assert.equal((await runMutationGate(core(p.root))).exitCode, 1)
	execFileSync('git', ['-C', p.root, 'checkout', '-q', '--', 'src'])
	await p.scenario({ versions: { ...VERSIONS, 'cosmic-ray': '9.0.0' } })
	assert.equal((await runMutationGate(core(p.root))).exitCode, 2)
	await p.scenario({})
	await writeFile(join(p.root, 'local.toml'), await p.read('cosmic-ray-core.toml'))
	assert.equal((await runMutationGate(core(p.root, { config: 'local.toml' }))).exitCode, 2)
	assert.throws(() => parseMutationArgs(['--root', '.', '--scope', 'all', '--config', 'c.toml', '--evidence', 'ev']))
})

test('coverage of the core passes at 100% and fails on an uncovered line', posixOnly, async (t) => {
	const files = (missing) => ({ files: {
		'src/shop/domain/__init__.py': { summary: { num_statements: 0, covered_lines: 0, missing_lines: 0 }, missing_lines: [] },
		'src/shop/domain/domain_module.py': { summary: { num_statements: 1, covered_lines: 1 - missing.length, missing_lines: missing.length }, missing_lines: missing },
		'src/shop/application/__init__.py': { summary: { num_statements: 0, covered_lines: 0, missing_lines: 0 }, missing_lines: [] },
		'src/shop/application/application_module.py': { summary: { num_statements: 1, covered_lines: 1, missing_lines: 0 }, missing_lines: [] },
	} })
	const p = await project(t, { coverageReport: files([]) })
	assert.equal((await runCoverageGate({ root: p.root, evidence: 'evidence' })).exitCode, 0)
	assert.match(await p.read('evidence/qg-coverage.stdout'), /line coverage 100% \(2\/2 statements\)/)
	await p.scenario({ coverageReport: files([1]) })
	assert.equal((await runCoverageGate({ root: p.root, evidence: 'evidence' })).exitCode, 1)
	assert.match(await p.read('evidence/qg-coverage.stdout'), /missing: src\/shop\/domain\/domain_module.py: 1/)
	await p.scenario({ pytestExit: 1, coverageReport: files([]) })
	assert.equal((await runCoverageGate({ root: p.root, evidence: 'evidence' })).exitCode, 1)
	assert.equal((await runCoverageGate({ root: p.root, evidence: 'evidence', threshold: '90' })).exitCode, 2)
})

test('a mocking library in the core or its unit tests fails G7', posixOnly, async (t) => {
	const p = await project(t)
	assert.equal((await runNoMocksGate({ root: p.root, evidence: 'evidence' })).exitCode, 0)
	assert.equal(await p.read('evidence/qg-mocks.stdout'), '')
	await writeFile(join(p.root, 'tests/unit/test_core.py'), 'from unittest.mock import MagicMock\n')
	const result = await runNoMocksGate({ root: p.root, evidence: 'evidence' })
	assert.equal(result.exitCode, 1)
	assert.equal(result.text, 'tests/unit/test_core.py:1: from unittest.mock import MagicMock\n')
})

test('capture runs {python} from the project venv and deposits stdout, exit and hash', posixOnly, async (t) => {
	const p = await project(t)
	const result = await runCapture({ root: p.root, evidence: 'evidence', name: 'qg-tests' }, '{python}', ['-m', 'pytest', '-q'])
	assert.equal(result.code, 0)
	assert.equal((await p.read('evidence/qg-tests.exit')).trim(), '0')
	assert.match(await p.read('evidence/qg-tests.stdout'), /3 passed/)
	assert.match(await p.read('evidence/qg-tests.stdout.sha256'), /^[0-9a-f]{64}\n$/)
	await p.scenario({ pytestExit: 1 })
	assert.equal((await runCapture({ root: p.root, evidence: 'evidence', name: 'qg-tests' }, '{python}', ['-m', 'pytest'])).code, 1)
	await assert.rejects(() => runCapture({ root: p.root, evidence: 'evidence', name: '../escape' }, '{python}', []))
})
