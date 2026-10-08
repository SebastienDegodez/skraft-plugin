#!/usr/bin/env node
// G11 for TypeScript: line coverage of the core sources named by the core Stryker config,
// measured by Vitest's v8 provider over the whole suite. The bar (100%) lives here.
import { realpathSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { coverageVerdict, hasRuntimeCode, matchSources, noCoverHits, parseArgs, validateConfig } from './gate-policy.mjs'
import { ensure, inside, loadScope, majorOf, packageRoot, packageVersion, repositoryRoot, resolveBin, runNode, sha256 } from './ts-toolchain.mjs'

export async function runCoverageGate(input, { run = runNode } = {}) {
	const lines = []
	let exitCode = 2
	let prefix
	try {
		ensure(!input.threshold, 'The coverage bar is fixed by the quality bar; --threshold is refused')
		const root = await repositoryRoot(input.root)
		const evidence = resolve(root, input.evidence)
		await mkdir(evidence, { recursive: true })
		prefix = join(evidence, 'qg-coverage')
		for (const stale of [`${prefix}.stdout`, `${prefix}.exit`, `${prefix}.stdout.sha256`, prefix]) await rm(stale, { recursive: true, force: true })
		await mkdir(prefix)
		const pkg = await packageRoot(root, input.package)
		const vitestVersion = packageVersion(pkg, 'vitest')
		const providerVersion = packageVersion(pkg, '@vitest/coverage-v8')
		ensure(majorOf(providerVersion) === majorOf(vitestVersion), `@vitest/coverage-v8 ${providerVersion} does not match vitest ${vitestVersion}`)
		const vitest = resolveBin(pkg, 'vitest')
		const scope = await loadScope({ root, pkg, config: input.config ?? 'stryker.core.json', scope: 'core', validate: validateConfig, match: matchSources })
		exitCode = 1

		const reports = join(prefix, 'coverage')
		const args = [
			'run', '--coverage.enabled', '--coverage.provider=v8', '--coverage.reporter=json-summary',
			`--coverage.reportsDirectory=${relative(pkg, reports).split('\\').join('/')}`,
			...scope.options.mutate.map((pattern) => `--coverage.include=${pattern}`),
			...(scope.options.vitest.configFile ? ['--config', scope.options.vitest.configFile] : []),
			...(scope.options.vitest.dir ? ['--dir', scope.options.vitest.dir] : []),
		]
		const result = await run(vitest, args, { cwd: pkg, stdout: join(prefix, 'run.stdout') })
		const output = await readFile(join(prefix, 'run.stdout'), 'utf8')
		lines.push(...output.trimEnd().split(/\r?\n/).slice(-15))
		ensure(result.code === 0 && !result.signal && !result.error, `The test suite failed under coverage (exit ${result.code ?? result.signal ?? result.error})`)
		const summary = JSON.parse(await readFile(join(reports, 'coverage-summary.json'), 'utf8').catch(() => { throw new Error('Vitest wrote no coverage-summary.json') }))

		const excluded = []
		const typeOnly = []
		for (const name of scope.files) {
			const text = await readFile(join(pkg, name), 'utf8')
			excluded.push(...noCoverHits(name, text))
			if (!hasRuntimeCode(text)) typeOnly.push(name)
		}
		const verdict = coverageVerdict(summary, scope.files, { relative: (name) => inside(pkg, resolve(pkg, name)), excluded, typeOnly })
		lines.push(...verdict.missing.map((entry) => `missing: ${entry}`))
		lines.push(verdict.passed
			? `Core line coverage 100% (${verdict.covered}/${verdict.total} lines, ${typeOnly.length} type-only file(s) with nothing to run)`
			: `Core coverage gate failed: ${verdict.problems.join('; ')}`)
		exitCode = verdict.passed ? 0 : 1
	} catch (error) {
		lines.push(`coverage gate ${exitCode === 2 ? 'blocked' : 'failed'}: ${error.message}`)
	} finally {
		if (prefix) {
			const text = `${lines.join('\n')}\n`
			await writeFile(`${prefix}.stdout`, text).catch(() => {})
			await writeFile(`${prefix}.exit`, `${exitCode}\n`).catch(() => {})
			await writeFile(`${prefix}.stdout.sha256`, `${sha256(text)}\n`).catch(() => {})
		}
	}
	return { exitCode, lines }
}

async function main() {
	let result
	try {
		const input = parseArgs(process.argv.slice(2), { options: ['root', 'package', 'evidence', 'config', 'threshold'] })
		for (const required of ['root', 'evidence']) ensure(input[required], `--${required} is required`)
		result = await runCoverageGate(input)
	} catch (error) {
		result = { exitCode: 2, lines: [`coverage gate blocked: ${error.message}`] }
	}
	process.stdout.write(`${result.lines.join('\n')}\n`)
	process.exitCode = result.exitCode
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main()
