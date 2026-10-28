import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { parseMutationArgs, runMutationGate } from '../../../plugins/skraft-framework/skills/quality-gates-python/scripts/mutation-gate.mjs'
import { runCoverageGate } from '../../../plugins/skraft-framework/skills/quality-gates-python/scripts/coverage-core.mjs'
import { runNoMocksGate } from '../../../plugins/skraft-framework/skills/quality-gates-python/scripts/no-mocks-in-core.mjs'
import { configureMutation } from '../../../plugins/skraft-framework/skills/quality-gates-python/scripts/configure-mutation.mjs'

const fake = fileURLToPath(new URL('./quality-gates-python-fake-python.fixture.mjs', import.meta.url))
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
	await put('.fake-python.json', JSON.stringify({ versions: VERSIONS, ...scenario }))
	execFileSync('git', ['init', '-q', root])
	assert.deepEqual(await configureMutation({ root }), { written: ['cosmic-ray-core.toml', 'cosmic-ray-boundary.toml'], skipped: [] })
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

const CONFIGURE = fileURLToPath(new URL('../../../plugins/skraft-framework/skills/quality-gates-python/scripts/configure-mutation.mjs', import.meta.url))

// A bare repository as a developer has it before the first scaffold: one module per named layer package.
async function bareRepository(t, packages, files = {}) {
	const root = await mkdtemp(join(tmpdir(), 'qg-py-configure-'))
	t.after(() => rm(root, { recursive: true, force: true }))
	const entries = Object.fromEntries(packages.flatMap((path) => [[`${path}/__init__.py`, ''], [`${path}/module.py`, 'VALUE = 1\n']]))
	for (const [name, body] of Object.entries({ ...entries, ...files })) {
		await mkdir(dirname(join(root, name)), { recursive: true })
		await writeFile(join(root, name), body)
	}
	execFileSync('git', ['init', '-q', root])
	return {
		configure: (...args) => spawnSync(process.execPath, [CONFIGURE, '--root', root, ...args], { encoding: 'utf8' }),
		exists: (name) => existsSync(join(root, name)),
		read: (name) => readFile(join(root, name), 'utf8'),
	}
}

const core = (root, extra = {}) => ({ root, scope: 'core', config: 'cosmic-ray-core.toml', evidence: 'evidence', python: fake, ...extra })
const boundary = (root, extra = {}) => ({ root, scope: 'boundary', config: 'cosmic-ray-boundary.toml', evidence: 'evidence', python: fake, ...extra })

test('the scaffold writes one config per scope from the layer packages', async (t) => {
	const { read } = await project(t)
	assert.match(await read('cosmic-ray-core.toml'), /module-path = \["src\/shop\/domain", "src\/shop\/application"\]/)
	assert.match(await read('cosmic-ray-boundary.toml'), /module-path = \["src\/shop\/infrastructure", "src\/shop\/api"\]/)
})

test('the boundary config covers only the boundary packages present; without one the core config is written alone and says so', async (t) => {
	const layered = ['src/shop/domain', 'src/shop/application']
	const layeredCore = /module-path = \["src\/shop\/domain", "src\/shop\/application"\]/
	for (const [packages, args, coreModules, boundaryModules] of [
		[layered, [], layeredCore, null],
		[['src/shop/core'], ['--core', 'src/shop/core'], /module-path = \["src\/shop\/core"\]/, null],
		[[...layered, 'src/shop/infrastructure'], [], layeredCore, /module-path = \["src\/shop\/infrastructure"\]/],
	]) {
		const repository = await bareRepository(t, packages)
		const result = repository.configure(...args)
		assert.equal(result.status, 0, result.stdout)
		assert.equal(result.stdout, boundaryModules
			? 'wrote cosmic-ray-core.toml, cosmic-ray-boundary.toml\n'
			: 'wrote cosmic-ray-core.toml\nno boundary layer: cosmic-ray-boundary.toml not written\n')
		assert.match(await repository.read('cosmic-ray-core.toml'), coreModules)
		assert.equal(repository.exists('cosmic-ray-boundary.toml'), boundaryModules !== null)
		if (boundaryModules) assert.match(await repository.read('cosmic-ray-boundary.toml'), boundaryModules)
	}
})

test('a blocked scaffold writes no config at all', async (t) => {
	const layers = ['domain', 'application', 'infrastructure', 'api'].map((layer) => `src/shop/${layer}`)
	const differing = await bareRepository(t, layers, { 'cosmic-ray-boundary.toml': '[cosmic-ray]\nmodule-path = ["src/custom"]\n' })
	const conflict = differing.configure()
	assert.equal(conflict.status, 2)
	assert.match(conflict.stdout, /configure-mutation blocked: cosmic-ray-boundary\.toml exists and differs/)
	assert.equal(differing.exists('cosmic-ray-core.toml'), false)
	assert.equal(await differing.read('cosmic-ray-boundary.toml'), '[cosmic-ray]\nmodule-path = ["src/custom"]\n')

	const boundaryOnly = await bareRepository(t, ['src/shop/api'])
	const noCore = boundaryOnly.configure('--boundary', 'src/shop/api')
	assert.equal(noCore.status, 2)
	assert.match(noCore.stdout, /configure-mutation blocked: No module path for the core scope/)
	assert.deepEqual([boundaryOnly.exists('cosmic-ray-core.toml'), boundaryOnly.exists('cosmic-ray-boundary.toml')], [false, false])

	const halfCore = await bareRepository(t, ['src/shop/domain', 'src/shop/infrastructure'])
	const missingApplication = halfCore.configure()
	assert.equal(missingApplication.status, 2)
	assert.match(missingApplication.stdout, /configure-mutation blocked: Missing layer packages: src\/shop\/application;/)
	assert.deepEqual([halfCore.exists('cosmic-ray-core.toml'), halfCore.exists('cosmic-ray-boundary.toml')], [false, false])

	const noDomain = boundaryOnly.configure()
	assert.equal(noDomain.status, 2)
	assert.equal(noDomain.stdout, 'configure-mutation blocked: No src/<context>/domain package found: pass --context, or --core (and --boundary if any)\n')
	const noSource = (await bareRepository(t, [])).configure()
	assert.equal(noSource.status, 2)
	assert.equal(noSource.stdout, 'configure-mutation blocked: No src/ directory: pass --core (and --boundary if any) module paths explicitly\n')
})

test('core runs baseline, init, pragma filter, exec and dump, then deposits a passing verdict', async (t) => {
	const p = await project(t, { dump: [killed('src/shop/domain/domain_module.py', 1)] })
	const result = await runMutationGate(core(p.root))
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
	assert.equal((await p.read('evidence/qg-mutation.exit')).trim(), '0')
	assert.match(await p.read('evidence/qg-mutation.stdout'), /core mutation score 100.00% meets 100%/)
	assert.deepEqual(JSON.parse(await p.read('evidence/qg-mutation/mutation-report.json')), { schemaVersion: '1', thresholds: { high: 100, low: 100 }, files: {} })
	const steps = (await p.calls()).filter((call) => call[0] === '-m').map((call) => call[1] === 'cosmic_ray.cli' ? call[2] : call[1])
	assert.deepEqual(steps, ['baseline', 'init', 'cosmic_ray.tools.filters.pragma_no_mutate', 'exec', 'dump'])
	const manifest = JSON.parse(await p.read('evidence/qg-mutation/manifest.json'))
	assert.equal(manifest.cosmic_ray, '8.3.8')
	assert.deepEqual(Object.keys(manifest.sources).sort(), ['src/shop/application/__init__.py', 'src/shop/application/application_module.py', 'src/shop/domain/__init__.py', 'src/shop/domain/domain_module.py'])
})

test('a surviving core mutant fails the gate and is listed', async (t) => {
	const p = await project(t, { dump: [killed('src/shop/domain/domain_module.py', 1), survived('src/shop/domain/domain_module.py', 1)] })
	const result = await runMutationGate(core(p.root))
	assert.equal(result.exitCode, 1)
	assert.match(result.lines.join('\n'), /survived: src\/shop\/domain\/domain_module.py:1 core\/AddNot/)
	assert.equal((await p.read('evidence/qg-mutation.exit')).trim(), '1')
	assert.deepEqual(JSON.parse(await p.read('evidence/qg-mutation/mutation-report.json')).files, {
		'src/shop/domain/domain_module.py': {
			language: 'python',
			source: '',
			mutants: [{ id: '1', mutatorName: 'core/AddNot', location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, status: 'Survived' }],
		},
	})
})

test('a red baseline blocks mutation: every mutant would look killed', async (t) => {
	const p = await project(t, { baselineExit: 1, dump: [killed('src/shop/domain/domain_module.py', 1)] })
	const result = await runMutationGate(core(p.root))
	assert.equal(result.exitCode, 1)
	assert.match(result.lines.join('\n'), /fails without any mutation/)
	assert.equal((await p.calls()).some((call) => call[2] === 'exec'), false)
})

test('a source left mutated by an interrupted run is restored and fails the gate', async (t) => {
	const p = await project(t, { leaveMutant: 'src/shop/domain/domain_module.py', dump: [killed('src/shop/domain/domain_module.py', 1)] })
	const result = await runMutationGate(core(p.root))
	assert.equal(result.exitCode, 1)
	assert.match(result.lines.join('\n'), /left mutated and have been restored: src\/shop\/domain\/domain_module.py/)
	assert.equal(await p.read('src/shop/domain/domain_module.py'), 'VALUE = "domain"\n')
})

test('boundary refuses to run before core passed in the same evidence directory', async (t) => {
	const p = await project(t, { dump: [killed('src/shop/api/api_module.py', 1)] })
	assert.equal((await runMutationGate(boundary(p.root))).exitCode, 2)
	assert.equal((await runMutationGate(core(p.root))).exitCode, 0)
	const result = await runMutationGate(boundary(p.root))
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
	assert.match(await p.read('evidence/qg-mutation-boundary.stdout'), /boundary mutation score 100.00% meets 80%/)
})

test('--since mutates only the scope files changed since the base, untracked ones included', async (t) => {
	const p = await project(t, { dump: [killed('src/shop/domain/new_rule.py', 1)] })
	const unchanged = await runMutationGate(core(p.root, { since: 'HEAD' }))
	assert.equal(unchanged.exitCode, 0)
	assert.match(unchanged.lines.join('\n'), /No core source changed since/)
	await writeFile(join(p.root, 'src/shop/domain/new_rule.py'), 'LIMIT = 3\n')
	const changed = await runMutationGate(core(p.root, { since: 'HEAD' }))
	assert.equal(changed.exitCode, 0, changed.lines.join('\n'))
	assert.match(await p.read('evidence/qg-mutation/cosmic-ray.toml'), /module-path = \["src\/shop\/domain\/new_rule.py"\]/)
})

test('an unexplained no-mutate pragma, an unsupported cosmic-ray or an uncommitted config blocks', async (t) => {
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
