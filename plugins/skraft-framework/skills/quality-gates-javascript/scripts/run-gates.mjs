import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, open, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { applyOverlays, coreOutsideScope, effectiveOptions, parseArgs, validateConfig, validateReport } from './gate-policy.mjs'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const json = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

function ensure(condition, message) {
	if (!condition) throw new Error(message)
}

function inside(root, path) {
	const name = relative(root, path)
	ensure(name !== '..' && !name.startsWith(`..${sep}`) && !isAbsolute(name), `Path outside root: ${path}`)
	return name.split(sep).join('/')
}

async function rootFile(root, path) {
	const absolute = resolve(root, path)
	inside(root, absolute)
	const canonical = await realpath(absolute)
	inside(root, canonical)
	ensure((await lstat(absolute)).isFile(), `Expected regular file: ${absolute}`)
	return absolute
}

export async function resolveToolchain(packagePath) {
	const packageFile = join(packagePath, 'package.json')
	const manifest = await readJson(packageFile)
	const dependencies = { ...manifest.dependencies, ...manifest.devDependencies }
	for (const name of ['@stryker-mutator/core', '@stryker-mutator/tap-runner']) ensure(dependencies[name], `Declare installed local dependency ${name}`)
	const require = createRequire(packageFile)
	const coreFile = require.resolve('@stryker-mutator/core/package.json')
	const tapFile = require.resolve('@stryker-mutator/tap-runner/package.json')
	const core = await readJson(coreFile)
	const tap = await readJson(tapFile)
	ensure(core.version === '9.6.1' && tap.version === core.version, 'Supported toolchain: StrykerJS and TAP 9.6.1')
	ensure(Number(process.versions.node.split('.')[0]) >= 20, 'Node >=20 required')
	return {
		version: core.version, tapVersion: tap.version, packageFile,
		bin: await realpath(resolve(dirname(coreFile), core.bin.stryker)),
		tap: require.resolve('@stryker-mutator/tap-runner'),
		globModule: createRequire(tapFile).resolve('glob'),
	}
}

async function loadConfig(root, name, scope) {
	const path = await rootFile(root, name)
	const relativePath = inside(root, path)
	git(root, ['ls-files', '--error-unmatch', '--', relativePath])
	git(root, ['cat-file', '-e', `HEAD:${relativePath}`])
	const bytes = await readFile(path)
	ensure(['.json', '.mjs'].includes(extname(path)), 'Config must be checked-in .json or .mjs')
	const config = extname(path) === '.json' ? JSON.parse(bytes.toString()) : (await import(`${pathToFileURL(path)}?sha=${sha256(bytes)}`)).default
	validateConfig(config, scope)
	return { path, sha256: sha256(bytes), config, scope }
}

async function loadOverlays(root, names) {
	return Promise.all(names.map(async (name) => {
		const path = await rootFile(root, name)
		return JSON.parse(await readFile(path, 'utf8'))
	}))
}

// The files changed since the merge base that still exist: a deleted one (a rename's old path
// too, under diff.renames=false) has nothing left to mutate.
function changedFiles(root, since) {
	const mergeBase = git(root, ['merge-base', since, 'HEAD'])
	const changed = git(root, ['diff', '--name-only', '--diff-filter=d', '-z', mergeBase, '--']).split('\0').filter(Boolean)
	const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--']).split('\0').filter(Boolean)
	const files = [...new Set([...changed, ...untracked])]
	return { mergeBase, files }
}

async function expand(root, patterns, glob) {
	const names = new Set()
	for (const pattern of patterns) {
		const matches = await glob(pattern, { cwd: root, nodir: true, dot: true, follow: false })
		ensure(matches.length > 0, `Pattern matched no files: ${pattern}`)
		for (const match of matches) names.add(inside(root, await rootFile(root, match)))
	}
	return [...names].sort()
}

async function sourceSnapshot(root, files) {
	const entries = await Promise.all(files.map(async (name) => [name, await readFile(join(root, name), 'utf8')]))
	return Object.fromEntries(entries)
}

async function prepareScope(root, config, glob) {
	const files = await expand(root, config.config.mutate, glob)
	ensure(files.every((file) => ['.js', '.mjs', '.cjs'].includes(extname(file))), 'Only JavaScript sources are supported')
	const sources = await sourceSnapshot(root, files)
	ensure(Object.values(sources).every((text) => !/Stryker\s+(disable|restore)/i.test(text)), 'Source mutation suppressions are unsupported')
	const tests = await expand(root, config.config.tap.testFiles, glob)
	const testSources = await sourceSnapshot(root, tests)
	return { ...config, files, sources, testSources }
}

async function prepare(input, component) {
	const root = await realpath(input.root)
	ensure(await realpath(git(root, ['rev-parse', '--show-toplevel'])) === root, '--root must be Git repository root')
	const packagePath = await realpath(resolve(root, input.package))
	inside(root, packagePath)
	const toolchain = await resolveToolchain(packagePath)
	const { glob } = await import(pathToFileURL(toolchain.globModule))
	const names = input.coreOnly ? ['core'] : ['core', 'boundary']
	const overlays = await loadOverlays(root, input.overlays ?? [])
	const differential = input.since ? changedFiles(root, input.since) : null
	const scopes = []
	for (const scope of names) {
		const loaded = await loadConfig(root, input[scope], scope)
		const config = applyOverlays(loaded.config, overlays)
		validateConfig(config, scope)
		const prepared = await prepareScope(root, { ...loaded, config }, glob)
		if (differential) {
			const outside = scope === 'core' ? coreOutsideScope(differential.files, prepared.files, Object.keys(prepared.testSources), inside(root, component)) : []
			ensure(outside.length === 0, `Changed core sources outside ${input.core}: ${outside.join(', ')}; the engine judges them core, so add them to its mutate patterns`)
			const selected = prepared.files.filter((file) => differential.files.includes(file))
			prepared.files = selected
			prepared.sources = await sourceSnapshot(root, selected)
		}
		scopes.push(prepared)
	}
	const allFiles = scopes.flatMap((scope) => scope.files)
	ensure(new Set(allFiles).size === allFiles.length, 'Core and boundary sources overlap')
	return { root, toolchain, scopes, revision: git(root, ['rev-parse', 'HEAD']), since: input.since ?? null, mergeBase: differential?.mergeBase ?? null, overlays: input.overlays ?? [] }
}

export async function executeChild(command, args, { cwd, stdout, stderr }) {
	const out = await open(stdout, 'wx')
	let err
	try {
		err = await open(stderr, 'wx')
		return await new Promise((done) => {
			const child = spawn(command, args, { cwd, shell: false, stdio: ['ignore', out.fd, err.fd] })
			child.once('error', (error) => done({ code: null, signal: null, error: error.message }))
			child.once('close', (code, signal) => done({ code, signal }))
		})
	} finally {
		await out.close()
		await err?.close()
	}
}

async function assertUnchanged(root, scope) {
	ensure(sha256(await readFile(scope.path)) === scope.sha256, 'Config changed during run')
	for (const [name, text] of Object.entries({ ...scope.sources, ...scope.testSources })) {
		ensure(await readFile(join(root, name), 'utf8') === text, `Source/test changed during run: ${name}`)
	}
}

async function collectReport(gate, options, context, scope) {
	ensure((await lstat(gate.report_ref)).isFile(), 'Report must be a fresh regular file')
	const bytes = await readFile(gate.report_ref)
	gate.report_sha256 = sha256(bytes)
	const report = JSON.parse(bytes.toString())
	gate.metrics = validateReport(report, { root: context.root, options, sources: scope.sources })
	for (const candidate of context.scopes) await assertUnchanged(context.root, candidate)
	ensure(git(context.root, ['rev-parse', 'HEAD']) === context.revision, 'Git revision changed during run')
	// StrykerJS exits 1 under its break threshold: a failed child stands only beside a missed score.
	const brokeOnScore = !gate.metrics.passed && gate.childExitCode === 1 && !gate.signal && !gate.childError
	ensure((gate.childExitCode === 0 && !gate.signal && !gate.childError) || brokeOnScore, 'Stryker child failed')
	// judgeable: the run is sound, so only its score can fail it.
	gate.judgeable = true
	ensure(gate.metrics.passed, 'Mutation score below scope threshold')
}

// A scope with no source changed since --since has nothing to mutate: it passes on a report
// with no mutant, without starting Stryker.
async function passUnchanged(gate, scope) {
	await json(gate.report_ref, { schemaVersion: '1.0', thresholds: structuredClone(scope.config.thresholds), files: {} })
	gate.report_sha256 = sha256(await readFile(gate.report_ref))
	gate.metrics = { total: 0, killed: 0, timeout: 0, survived: 0, noCoverage: 0, score: null, passed: true }
	gate.reason = 'no changed source'
	gate.passed = true
	await writeFile(gate.gate_exit_ref, '0\n')
	return gate
}

async function runScope(context, scope, directory, execute) {
	const prefix = join(directory, scope.scope)
	const gate = {
		scope: scope.scope, passed: false,
		stdout_ref: `${prefix}.stdout`, stderr_ref: `${prefix}.stderr`,
		exit_ref: `${prefix}.exit`, gate_exit_ref: `${prefix}.gate.exit`,
		report_ref: `${prefix}.report.json`, config_ref: `${prefix}.config.json`,
		original_config: { path: scope.path, sha256: scope.sha256 },
		source_sha256: Object.fromEntries(Object.entries(scope.sources).map(([name, text]) => [name, sha256(text)])),
		test_sha256: Object.fromEntries(Object.entries(scope.testSources).map(([name, text]) => [name, sha256(text)])),
	}
	if (scope.files.length === 0) return passUnchanged(gate, scope)
	const options = effectiveOptions(scope.config, scope.files, gate.report_ref, context.toolchain.tap)
	// Snapshot options so Stryker cannot discover a different config on the second read.
	await json(gate.config_ref, options)
	gate.config_sha256 = sha256(await readFile(gate.config_ref))
	gate.command = [process.execPath, context.toolchain.bin, 'run', gate.config_ref]
	gate.started_at = new Date().toISOString()
	try {
		await assertUnchanged(context.root, scope)
		const child = await execute(gate.command[0], gate.command.slice(1), {
			cwd: context.root, stdout: gate.stdout_ref, stderr: gate.stderr_ref,
		})
		gate.childExitCode = child.code
		gate.signal = child.signal
		gate.childError = child.error
		await writeFile(gate.exit_ref, `${child.code ?? 'null'}\n`)
		gate.stdout_sha256 = sha256(await readFile(gate.stdout_ref))
		gate.stderr_sha256 = sha256(await readFile(gate.stderr_ref))
		ensure(sha256(await readFile(gate.config_ref)) === gate.config_sha256, 'Effective config changed during run')
		await collectReport(gate, options, context, scope)
		gate.passed = true
	} catch (error) {
		gate.error = error.message
	}
	gate.finished_at = new Date().toISOString()
	await writeFile(gate.gate_exit_ref, `${gate.passed ? 0 : 1}\n`)
	return gate
}

// The engine reads one report for the component, where StrykerJS writes it by default under the
// component root, each file named from there; Stryker names them from --root. It holds the files
// of every scope run, and only from a sound run: each scope passed or failed on its score alone.
const engineReport = (component) => join(component, 'reports', 'mutation', 'mutation.json')

async function publishReport({ root, component }, gates) {
	if (!gates.every((gate) => gate.passed || gate.judgeable)) return
	const reports = await Promise.all(gates.map((gate) => readJson(gate.report_ref)))
	const named = reports.flatMap((report) => Object.entries(report.files)).map(([name, file]) => [relative(component, resolve(root, name)).split(sep).join('/'), file])
	await mkdir(dirname(engineReport(component)), { recursive: true })
	await json(engineReport(component), { schemaVersion: '1.0', files: Object.fromEntries(named) })
}

// componentRoot: the folder the gate command runs in; --root when not given. A report an earlier
// run left there is removed first.
export async function runGates(input, { execute = executeChild, componentRoot } = {}) {
	const result = { status: 'blocked', exitCode: 2, combinedPass: false, gates: [] }
	try {
		const component = await realpath(componentRoot ?? input.root)
		await rm(engineReport(component), { force: true })
		const context = await prepare(input, component)
		const evidence = resolve(context.root, input.evidence)
		await mkdir(evidence, { recursive: true })
		result.directory = await mkdtemp(join(await realpath(evidence), 'qg-js-'))
		result.manifest = join(result.directory, 'manifest.json')
		result.repo_root_rev = context.revision
		result.requested_since = context.since
		result.merge_base = context.mergeBase
		result.overlays = context.overlays
		result.toolchain = context.toolchain
		result.node_version = process.versions.node
		result.status = 'fail'
		result.exitCode = 1
		for (const scope of context.scopes) {
			const gate = await runScope(context, scope, result.directory, execute)
			result.gates.push(gate)
			if (!gate.passed) break
		}
		await publishReport({ root: context.root, component }, result.gates)
		if (result.gates.length === context.scopes.length && result.gates.every((gate) => gate.passed)) {
			result.exitCode = 0
			result.status = input.coreOnly ? 'core-only' : 'pass'
			result.combinedPass = !input.coreOnly
		}
		await json(result.manifest, result)
	} catch (error) {
		result.status = 'blocked'
		result.exitCode = 2
		result.combinedPass = false
		result.error = error.message
	}
	return result
}

async function main() {
	let result
	try {
		result = await runGates(parseArgs(process.argv.slice(2)), { componentRoot: process.cwd() })
	} catch (error) {
		result = { status: 'blocked', exitCode: 2, combinedPass: false, error: error.message }
	}
	process.stdout.write(`${JSON.stringify(result)}\n`)
	process.exitCode = result.exitCode
}

async function isMain() {
	if (!process.argv[1]) return false
	try { return await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url)) }
	catch { return false }
}

if (await isMain()) await main()