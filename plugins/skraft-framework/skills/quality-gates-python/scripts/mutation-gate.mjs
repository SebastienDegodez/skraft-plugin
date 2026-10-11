#!/usr/bin/env node
// G6 for Python: runs cosmic-ray on one scope from its checked-in config and returns the
// verdict as the exit code (0 pass, 1 gate failed, 2 invalid input or tooling).
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { COSMIC_RAY_MAJOR, LIMITS, bindInterpreter, mutationVerdict, parseArgs, pragmaProblems, renderConfig, selectChanged, validateConfig } from './gate-policy.mjs'
import {
	capture, changedSince, distributionVersion, ensure, git, inside, pythonEnv, pythonFiles, pythonVersion,
	readToml, repositoryRoot, resolvePython, sha256,
} from './python-toolchain.mjs'

const STEPS = ['baseline', 'init', 'pragma', 'exec', 'dump']

export function parseMutationArgs(argv) {
	const input = parseArgs(argv, { options: ['root', 'scope', 'config', 'evidence', 'python', 'since'] })
	for (const required of ['root', 'scope', 'config', 'evidence']) ensure(input[required], `--${required} is required`)
	ensure(Object.hasOwn(LIMITS, input.scope), '--scope is core or boundary')
	return input
}

async function snapshot(root, files) {
	return Object.fromEntries(await Promise.all(files.map(async (name) => [name, await readFile(join(root, name))])))
}

async function restoreChanged(root, saved) {
	const restored = []
	for (const [name, bytes] of Object.entries(saved)) {
		const current = await readFile(join(root, name)).catch(() => null)
		if (current === null || !current.equals(bytes)) {
			await writeFile(join(root, name), bytes)
			restored.push(name)
		}
	}
	return restored
}

async function trackedTests(root) {
	return git(root, ['ls-files', '-z', '--', '*.py']).split('\0').filter((name) => name && /(^|\/)(tests?|conftest\.py$)/.test(name))
}

export async function runMutationGate(input, { execute = capture } = {}) {
	const lines = []
	const manifest = { scope: input.scope, limit: LIMITS[input.scope], steps: {} }
	let exitCode = 2
	let root
	let prefix
	try {
		root = await repositoryRoot(input.root)
		const evidence = resolve(root, input.evidence)
		await mkdir(evidence, { recursive: true })
		prefix = join(evidence, input.scope === 'core' ? 'qg-mutation' : 'qg-mutation-boundary')
		for (const stale of [`${prefix}.stdout`, `${prefix}.exit`, `${prefix}.stdout.sha256`, prefix]) await rm(stale, { recursive: true, force: true })
		await mkdir(prefix)

		if (input.scope === 'boundary') {
			const core = await readFile(join(evidence, 'qg-mutation.exit'), 'utf8').catch(() => '')
			ensure(core.trim() === '0', 'The core gate has not passed in this evidence directory; run --scope core first')
		}
		const python = resolvePython(root, input.python)
		manifest.python = { path: python, version: pythonVersion(python, root) }
		const version = distributionVersion(python, root, 'cosmic-ray')
		ensure(Number(version.split('.')[0]) === COSMIC_RAY_MAJOR, `cosmic-ray ${COSMIC_RAY_MAJOR}.x required, found ${version}`)
		manifest.cosmic_ray = version

		const configPath = resolve(root, input.config)
		const configName = inside(root, configPath)
		git(root, ['ls-files', '--error-unmatch', '--', configName])
		git(root, ['cat-file', '-e', `HEAD:${configName}`])
		const configBytes = await readFile(configPath)
		const config = validateConfig(readToml(python, root, configPath), input.scope)
		manifest.config = { path: configName, sha256: sha256(configBytes) }

		const scopeFiles = await pythonFiles(root, config.modulePaths)
		ensure(scopeFiles.length > 0, `module-path holds no Python file for ${input.scope}`)
		let selected = scopeFiles
		if (input.since) {
			const changed = changedSince(root, input.since)
			manifest.since = { requested: input.since, merge_base: changed.mergeBase }
			selected = selectChanged(scopeFiles, changed.files)
		}
		manifest.revision = git(root, ['rev-parse', 'HEAD'])
		exitCode = 1

		if (selected.length === 0) {
			lines.push(`No ${input.scope} source changed since ${manifest.since.merge_base}: nothing to mutate.`)
			manifest.verdict = { passed: true, total: 0, reason: 'no changed source' }
			exitCode = 0
			return { exitCode, manifest, lines }
		}

		const saved = await snapshot(root, selected)
		const unexplained = Object.entries(saved).flatMap(([name, bytes]) => pragmaProblems(name, bytes.toString('utf8')))
		ensure(unexplained.length === 0, unexplained.join('; '))
		const tests = await snapshot(root, await trackedTests(root))
		manifest.sources = Object.fromEntries(Object.entries(saved).map(([name, bytes]) => [name, sha256(bytes)]))
		manifest.tests = Object.fromEntries(Object.entries(tests).map(([name, bytes]) => [name, sha256(bytes)]))
		const effective = join(prefix, 'cosmic-ray.toml')
		const testCommand = bindInterpreter(config.testCommand, python)
		manifest.test_command = testCommand
		await writeFile(effective, renderConfig({ ...config, modulePaths: selected, testCommand }))
		const session = join(prefix, 'session.sqlite')
		const argsFor = {
			baseline: [effective, '--session-file', join(prefix, 'baseline.sqlite')],
			init: [effective, session], exec: [effective, session], dump: [session],
		}
		const modules = { pragma: 'cosmic_ray.tools.filters.pragma_no_mutate' }
		let restored = []
		try {
			for (const step of STEPS) {
				const args = modules[step] ? ['-m', modules[step], session] : ['-m', 'cosmic_ray.cli', step, ...argsFor[step]]
				const result = await execute(python, args, { cwd: root, env: pythonEnv(python), stdout: join(prefix, `${step}.stdout`), stderr: join(prefix, `${step}.stderr`) })
				manifest.steps[step] = { command: [python, ...args], ...result }
				if (result.code !== 0 || result.signal || result.error) {
					throw new Error(step === 'baseline'
						? 'The test command fails without any mutation; make the suite green before mutating'
						: `cosmic-ray ${step} failed (exit ${result.code ?? result.signal ?? result.error}); see ${inside(root, join(prefix, `${step}.stderr`))}`)
				}
			}
		} finally {
			restored = await restoreChanged(root, saved)
		}
		ensure(restored.length === 0, `Sources were left mutated and have been restored: ${restored.join(', ')}`)
		ensure((await restoreChanged(root, tests)).length === 0, 'Test files changed during the run and have been restored')
		ensure(git(root, ['rev-parse', 'HEAD']) === manifest.revision, 'Git revision changed during the run')

		const dump = await readFile(join(prefix, 'dump.stdout'), 'utf8')
		const verdict = mutationVerdict(dump.split(/\r?\n/), input.scope)
		manifest.verdict = verdict
		for (const survivor of verdict.survivors) lines.push(`survived: ${survivor.module}:${survivor.line} ${survivor.operator} #${survivor.occurrence}`)
		lines.push(verdict.passed
			? `${input.scope} mutation score ${verdict.score === null ? 'n/a (no mutant generated)' : `${verdict.score.toFixed(2)}%`} meets ${verdict.limit}% (${verdict.killed} killed, ${verdict.survived} survived, ${verdict.incompetent} incompetent, ${verdict.suppressed} suppressed by pragma)`
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
