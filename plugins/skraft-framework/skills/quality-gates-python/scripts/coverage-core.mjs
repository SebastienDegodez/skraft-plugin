#!/usr/bin/env node
// G11 for Python: line coverage of the Domain and Application sources named by the core
// cosmic-ray config, measured over the whole test suite. The bar (100%) lives here.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { coverageVerdict, noCoverHits, parseArgs, validateConfig } from './gate-policy.mjs'
import { capture, distributionVersion, ensure, pythonEnv, pythonFiles, pythonVersion, readToml, repositoryRoot, resolvePython, sha256 } from './python-toolchain.mjs'

export async function runCoverageGate(input, { execute = capture } = {}) {
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
		const python = resolvePython(root, input.python)
		pythonVersion(python, root)
		distributionVersion(python, root, 'coverage')
		distributionVersion(python, root, 'pytest')
		const config = validateConfig(readToml(python, root, resolve(root, input.config ?? 'cosmic-ray-core.toml')), 'core')
		const files = await pythonFiles(root, config.modulePaths)
		ensure(files.length > 0, 'The core config names no Python file')
		exitCode = 1
		const dataFile = join(prefix, '.coverage')
		const env = pythonEnv(python)
		const run = await execute(python, ['-m', 'coverage', 'run', `--data-file=${dataFile}`, `--source=${config.modulePaths.join(',')}`, '-m', 'pytest', '-q', '-p', 'no:cacheprovider'],
			{ cwd: root, env, stdout: join(prefix, 'run.stdout') })
		const testsOutput = await readFile(join(prefix, 'run.stdout'), 'utf8')
		lines.push(...testsOutput.trimEnd().split(/\r?\n/).slice(-15))
		ensure(run.code === 0 && !run.signal && !run.error, `The test suite failed under coverage (exit ${run.code ?? run.signal ?? run.error})`)
		const report = join(prefix, 'coverage.json')
		const json = await execute(python, ['-m', 'coverage', 'json', `--data-file=${dataFile}`, '-o', report], { cwd: root, env, stdout: join(prefix, 'json.stdout') })
		ensure(json.code === 0, 'coverage json failed')
		const excluded = []
		for (const name of files) excluded.push(...noCoverHits(name, await readFile(join(root, name), 'utf8')))
		const verdict = coverageVerdict(JSON.parse(await readFile(report, 'utf8')), files, excluded)
		lines.push(...verdict.missing.map((entry) => `missing: ${entry}`))
		lines.push(verdict.passed
			? `Domain/Application line coverage 100% (${verdict.covered}/${verdict.statements} statements)`
			: `Domain/Application coverage gate failed: ${verdict.problems.join('; ')}`)
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
		const input = parseArgs(process.argv.slice(2), { options: ['root', 'evidence', 'python', 'config', 'threshold'] })
		for (const required of ['root', 'evidence']) ensure(input[required], `--${required} is required`)
		result = await runCoverageGate(input)
	} catch (error) {
		result = { exitCode: 2, lines: [`coverage gate blocked: ${error.message}`] }
	}
	process.stdout.write(`${result.lines.join('\n')}\n`)
	process.exitCode = result.exitCode
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main()
