#!/usr/bin/env node
// G6 for TypeScript: runs StrykerJS with the Vitest runner on one scope from its checked-in
// config and returns the verdict as the exit code (0 pass, 1 gate failed, 2 invalid input or
// tooling). The thresholds live in gate-policy.mjs; none is a caller argument.
import { realpathSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	LIMITS, STRYKER_MAJOR, VITEST_MAJOR_FOR_STRYKER, effectiveConfig, matchSources, mutationVerdict, parseArgs, requiredFiles, selectChanged, suppressionProblems, validateConfig,
} from './gate-policy.mjs'
import {
	changedSince, ensure, git, inside, loadScope, majorOf, packageRoot, packageVersion, repositoryRoot, resolveBin, runNode, sha256, sourceFiles,
} from './ts-toolchain.mjs'

export function parseMutationArgs(argv) {
	const input = parseArgs(argv, { options: ['root', 'package', 'scope', 'config', 'evidence', 'since'] })
	for (const required of ['root', 'scope', 'config', 'evidence']) ensure(input[required], `--${required} is required`)
	ensure(Object.hasOwn(LIMITS, input.scope), '--scope is core or boundary')
	return input
}

async function snapshot(base, files) {
	return Object.fromEntries(await Promise.all(files.map(async (name) => [name, await readFile(join(base, name))])))
}

async function restoreChanged(base, saved) {
	const restored = []
	for (const [name, bytes] of Object.entries(saved)) {
		const current = await readFile(join(base, name)).catch(() => null)
		if (current === null || !current.equals(bytes)) {
			await writeFile(join(base, name), bytes)
			restored.push(name)
		}
	}
	return restored
}

async function listTests(pkg) {
	return (await sourceFiles(pkg, 'tests')).concat((await sourceFiles(pkg, 'src')).filter((name) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(name))).sort()
}

async function hashFiles(base, files) {
	return Object.fromEntries(await Promise.all(files.map(async (name) => [name, sha256(await readFile(join(base, name)))])))
}

const sameHashes = (recorded = {}, current = {}) => {
	const names = new Set([...Object.keys(recorded), ...Object.keys(current)])
	return [...names].filter((name) => recorded[name] !== current[name]).sort()
}

// Boundary runs only on top of a core pass that proved the code as it is now: same revision, same
// --since base, same core config, and every core source and every test byte-identical.
async function verifyCoreEvidence({ root, pkg, evidence, since }) {
	const exit = await readFile(join(evidence, 'qg-mutation.exit'), 'utf8').catch(() => '')
	ensure(exit.trim() === '0', 'The core gate has not passed in this evidence directory; run --scope core first')
	const core = JSON.parse(await readFile(join(evidence, 'qg-mutation', 'manifest.json'), 'utf8').catch(() => 'null'))
	ensure(core && core.scope === 'core' && core.exit_code === 0, 'The core evidence has no passing manifest; run --scope core again')
	const stale = []
	if (core.revision !== git(root, ['rev-parse', 'HEAD'])) stale.push('the Git revision moved')
	if ((core.since?.requested ?? null) !== (since ?? null)) stale.push(`core ran with --since ${core.since?.requested ?? '(none)'}, boundary with ${since ?? '(none)'}`)
	const config = await readFile(resolve(root, core.config.path)).catch(() => null)
	if (!config || sha256(config) !== core.config.sha256) stale.push(`${core.config.path} changed`)
	else {
		const current = await loadScope({ root, pkg, config: resolve(root, core.config.path), scope: 'core', validate: validateConfig, match: matchSources, required: requiredFiles })
		const sources = sameHashes(core.scope_files, await hashFiles(pkg, current.files))
		if (sources.length) stale.push(`core sources changed: ${sources.join(', ')}`)
	}
	const tests = sameHashes(core.tests, await hashFiles(pkg, await listTests(pkg)))
	if (tests.length) stale.push(`tests changed: ${tests.join(', ')}`)
	ensure(stale.length === 0, `The core evidence no longer matches the code (${stale.join('; ')}); run --scope core again`)
}

export async function runMutationGate(input, { run = runNode } = {}) {
	const lines = []
	const manifest = { scope: input.scope, limit: LIMITS[input.scope], steps: {} }
	let exitCode = 2
	let prefix
	try {
		const root = await repositoryRoot(input.root)
		const evidence = resolve(root, input.evidence)
		await mkdir(evidence, { recursive: true })
		prefix = join(evidence, input.scope === 'core' ? 'qg-mutation' : 'qg-mutation-boundary')
		for (const stale of [`${prefix}.stdout`, `${prefix}.exit`, `${prefix}.stdout.sha256`, prefix]) await rm(stale, { recursive: true, force: true })
		await mkdir(prefix)

		const pkg = await packageRoot(root, input.package)
		const pkgPrefix = inside(root, pkg)
		const toPackage = (name) => (pkgPrefix ? (name.startsWith(`${pkgPrefix}/`) ? name.slice(pkgPrefix.length + 1) : null) : name)
		const versions = {
			node: process.versions.node,
			'@stryker-mutator/core': packageVersion(pkg, '@stryker-mutator/core'),
			'@stryker-mutator/vitest-runner': packageVersion(pkg, '@stryker-mutator/vitest-runner'),
			vitest: packageVersion(pkg, 'vitest'),
		}
		ensure(majorOf(versions['@stryker-mutator/core']) === STRYKER_MAJOR, `@stryker-mutator/core ${STRYKER_MAJOR}.x required, found ${versions['@stryker-mutator/core']}`)
		ensure(versions['@stryker-mutator/vitest-runner'] === versions['@stryker-mutator/core'], 'The Vitest runner and Stryker core must share one version')
		ensure(majorOf(versions.vitest) === VITEST_MAJOR_FOR_STRYKER, `StrykerJS ${STRYKER_MAJOR} runs on Vitest ${VITEST_MAJOR_FOR_STRYKER}.x; found vitest ${versions.vitest}, under which every mutant reads as survived. Pin vitest and @vitest/coverage-v8 to ${VITEST_MAJOR_FOR_STRYKER}.x`)
		manifest.versions = versions
		const stryker = resolveBin(pkg, '@stryker-mutator/core', 'stryker')
		const vitest = resolveBin(pkg, 'vitest')

		const scope = await loadScope({ root, pkg, config: input.config, scope: input.scope, validate: validateConfig, match: matchSources, required: requiredFiles })
		manifest.config = { path: scope.name, sha256: scope.sha256 }
		const testFiles = await listTests(pkg)
		manifest.scope_files = await hashFiles(pkg, scope.files)
		manifest.tests = await hashFiles(pkg, testFiles)
		if (input.scope === 'boundary') await verifyCoreEvidence({ root, pkg, evidence, since: input.since })
		let selected = scope.files
		if (input.since) {
			const changed = changedSince(root, input.since)
			manifest.since = { requested: input.since, merge_base: changed.mergeBase }
			selected = selectChanged(scope.files, changed.files.map(toPackage).filter(Boolean))
		}
		manifest.revision = git(root, ['rev-parse', 'HEAD'])
		exitCode = 1

		if (selected.length === 0) {
			lines.push(`No ${input.scope} source changed since ${manifest.since.merge_base}: nothing to mutate.`)
			manifest.verdict = { passed: true, total: 0, reason: 'no changed source' }
			exitCode = 0
			return { exitCode, manifest, lines }
		}

		const saved = await snapshot(pkg, selected)
		const unexplained = Object.entries(saved).flatMap(([name, bytes]) => suppressionProblems(name, bytes.toString('utf8')))
		ensure(unexplained.length === 0, unexplained.join('; '))
		const tests = await snapshot(pkg, testFiles)
		manifest.sources = Object.fromEntries(Object.entries(saved).map(([name, bytes]) => [name, sha256(bytes)]))

		const report = join(prefix, 'mutation-report.json')
		const effective = join(prefix, 'stryker.config.json')
		await writeFile(effective, `${JSON.stringify(effectiveConfig(scope.options, selected, relative(pkg, report).split('\\').join('/')), null, 2)}\n`)
		const vitestArgs = ['run', ...(scope.options.vitest.configFile ? ['--config', scope.options.vitest.configFile] : []), ...(scope.options.vitest.dir ? ['--dir', scope.options.vitest.dir] : [])]
		const steps = {
			baseline: [vitest, vitestArgs],
			stryker: [stryker, ['run', relative(pkg, effective)]],
		}
		let restored = []
		try {
			for (const [step, [bin, args]] of Object.entries(steps)) {
				const result = await run(bin, args, { cwd: pkg, stdout: join(prefix, `${step}.stdout`), stderr: join(prefix, `${step}.stderr`) })
				manifest.steps[step] = { command: [process.execPath, bin, ...args], ...result }
				if (result.code !== 0 || result.signal || result.error) {
					throw new Error(step === 'baseline'
						? 'The test suite fails without any mutation; make it green before mutating'
						: `Stryker failed (exit ${result.code ?? result.signal ?? result.error}); see ${inside(root, join(prefix, `${step}.stderr`))}`)
				}
			}
		} finally {
			restored = await restoreChanged(pkg, saved)
		}
		ensure(restored.length === 0, `Sources were left mutated and have been restored: ${restored.join(', ')}`)
		ensure((await restoreChanged(pkg, tests)).length === 0, 'Test files changed during the run and have been restored')
		ensure(git(root, ['rev-parse', 'HEAD']) === manifest.revision, 'Git revision changed during the run')

		const data = JSON.parse(await readFile(report, 'utf8').catch(() => { throw new Error('Stryker wrote no JSON report') }))
		const verdict = mutationVerdict(data, input.scope, (name) => inside(pkg, resolve(pkg, name)))
		const unknown = verdict.survivors.map((s) => s.file).filter((file) => !selected.includes(file))
		ensure(unknown.length === 0, `The report mutates files outside the selection: ${[...new Set(unknown)].join(', ')}`)
		manifest.verdict = verdict
		for (const s of verdict.survivors) lines.push(`${s.status === 'NoCoverage' ? 'no coverage' : 'survived'}: ${s.file}:${s.line} ${s.mutator}`)
		lines.push(verdict.passed
			? `${input.scope} mutation score ${verdict.score === null ? 'n/a (no mutant generated)' : `${verdict.score.toFixed(2)}%`} meets ${verdict.limit}% (${verdict.killed} killed, ${verdict.timeout} timed out, ${verdict.survived} survived, ${verdict.noCoverage} without coverage, ${verdict.suppressed} disabled with a reason)`
			: `${input.scope} mutation gate failed: ${verdict.problems.join('; ')}`)
		exitCode = verdict.passed ? 0 : 1
		return { exitCode, manifest, lines }
	} catch (error) {
		lines.push(`${input.scope ?? 'mutation'} gate ${exitCode === 2 ? 'blocked' : 'failed'}: ${error.message}`)
		return { exitCode, manifest, lines }
	} finally {
		if (prefix) {
			manifest.exit_code = exitCode
			await writeFile(join(prefix, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`).catch(() => {})
			const text = `${lines.join('\n')}\n`
			await writeFile(`${prefix}.stdout`, text).catch(() => {})
			await writeFile(`${prefix}.exit`, `${exitCode}\n`).catch(() => {})
			await writeFile(`${prefix}.stdout.sha256`, `${sha256(text)}\n`).catch(() => {})
		}
	}
}

async function main() {
	let result
	try {
		result = await runMutationGate(parseMutationArgs(process.argv.slice(2)))
	} catch (error) {
		result = { exitCode: 2, lines: [`mutation gate blocked: ${error.message}`] }
	}
	process.stdout.write(`${result.lines.join('\n')}\n`)
	process.exitCode = result.exitCode
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main()
