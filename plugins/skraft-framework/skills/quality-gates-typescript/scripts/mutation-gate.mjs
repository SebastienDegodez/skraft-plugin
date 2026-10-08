#!/usr/bin/env node
// G6 for TypeScript: runs StrykerJS with the Vitest runner on one scope from its checked-in
// config and returns the verdict as the exit code (0 pass, 1 gate failed, 2 invalid input or
// tooling). The thresholds live in gate-policy.mjs; none is a caller argument.
import { realpathSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	LIMITS, STRYKER_MAJOR, effectiveConfig, matchSources, mutationVerdict, parseArgs, selectChanged, suppressionProblems, validateConfig,
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

		if (input.scope === 'boundary') {
			const core = await readFile(join(evidence, 'qg-mutation.exit'), 'utf8').catch(() => '')
			ensure(core.trim() === '0', 'The core gate has not passed in this evidence directory; run --scope core first')
		}
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
		manifest.versions = versions
		const stryker = resolveBin(pkg, '@stryker-mutator/core', 'stryker')
		const vitest = resolveBin(pkg, 'vitest')

		const scope = await loadScope({ root, pkg, config: input.config, scope: input.scope, validate: validateConfig, match: matchSources })
		manifest.config = { path: scope.name, sha256: scope.sha256 }
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
		const tests = await snapshot(pkg, (await sourceFiles(pkg, 'tests')).concat((await sourceFiles(pkg, 'src')).filter((name) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(name))))
		manifest.sources = Object.fromEntries(Object.entries(saved).map(([name, bytes]) => [name, sha256(bytes)]))
		manifest.tests = Object.fromEntries(Object.entries(tests).map(([name, bytes]) => [name, sha256(bytes)]))

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
