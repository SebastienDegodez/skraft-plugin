// Internal runner used by mutation-core.mjs and mutation-boundary.mjs.
// Stdout: one JSON verdict. Stderr: diagnostics.
// Exit: 0 gate passed | 1 gate/report failed | 2 usage/config error | 3 toolchain missing
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Exit, absoluteDir, absoluteFile, dotnet, existsSync, fromRoot, parseArguments, requireDotnetStryker, sha256File, usageError } from './dotnet-toolchain.mjs'

const usage = (script) => `Usage: ${script} --root <dir> --evidence <dir> [--config <json>] [--since <git-ref>] [--overlay <json> ...] [--help]

Runs one Stryker.NET solution-context mutation gate from a checked-in root config.`

const PROTECTED = new Set(['solution', 'mutate', 'thresholds', 'reporters', 'report-file-name'])
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right)

function merge(base, overlay, path = '') {
	if (!object(overlay)) throw new Error(`overlay ${path || '<root>'} must be an object`)
	const result = structuredClone(base)
	for (const [key, value] of Object.entries(overlay)) {
		if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error(`unsafe overlay key: ${key}`)
		const current = path ? `${path}.${key}` : key
		if (PROTECTED.has(key)) {
			if (!equal(result[key], value)) throw new Error(`overlay cannot change protected option: ${current}`)
		} else if (object(result[key]) && object(value)) result[key] = merge(result[key], value, current)
		else result[key] = structuredClone(value)
	}
	return result
}

function validate(configPath, expected, reportName, root) {
	let config
	try {
		config = JSON.parse(readFileSync(configPath, 'utf8'))['stryker-config']
	} catch (error) {
		throw usageError(`invalid mutation config ${configPath}: ${error.message}`)
	}
	if (!config || typeof config !== 'object') throw usageError(`${configPath} must contain a stryker-config object`)
	if (config.thresholds?.break !== expected || config.thresholds?.low !== expected || config.thresholds?.high !== expected) {
		throw usageError(`${configPath} must keep thresholds high/low/break at ${expected}`)
	}
	if (config['report-file-name'] !== reportName) throw usageError(`${configPath} must keep report-file-name ${reportName}`)
	if (!Array.isArray(config.reporters) || !config.reporters.map(String).some((x) => x.toLowerCase() === 'json')) {
		throw usageError(`${configPath} must enable the json reporter`)
	}
	if (!Array.isArray(config.mutate) || !config.mutate.some((x) => typeof x === 'string' && !x.startsWith('!'))) {
		throw usageError(`${configPath} must contain at least one inclusive mutate glob`)
	}
	if (typeof config.solution !== 'string' || config.solution.length === 0) throw usageError(`${configPath} must select a solution`)
	const solution = resolve(root, config.solution)
	if (!existsSync(solution)) throw usageError(`solution from ${configPath} does not exist: ${solution}`)
	return solution
}

// The score is recomputed from the tested mutants: Stryker exits 0 when it could not
// compute one, e.g. when no test ran and every mutant stayed Pending.
function judge({ report, stdout, expected, scope, since }) {
	const record = (message) => {
		appendFileSync(stdout, `${message}\n`)
		process.stderr.write(`${message}\n`)
	}
	const fail = (message) => { record(message); return 1 }
	let parsed
	try {
		parsed = JSON.parse(readFileSync(report, 'utf8'))
	} catch (error) {
		return fail(`invalid native mutation report ${report}: ${error.message}`)
	}
	const files = parsed.files && typeof parsed.files === 'object' ? Object.values(parsed.files) : []
	const mutants = files.flatMap((file) => (Array.isArray(file?.mutants) ? file.mutants : []))
	if (mutants.length === 0) return fail(`native mutation report contains no mutants: ${report}`)
	const count = (...statuses) => mutants.filter((mutant) => statuses.includes(mutant.status)).length
	const pending = count('Pending')
	if (pending > 0) return fail(`${pending} mutant(s) were never tested: no test ran against them`)
	const detected = count('Killed', 'Timeout')
	const tested = detected + count('Survived', 'NoCoverage')
	if (tested === 0 && since) {
		record(`No ${scope} mutant changed since ${since}: nothing to test`)
		return 0
	}
	if (tested === 0) return fail(`no ${scope} mutant was tested: the mutation score cannot be computed`)
	const score = (detected / tested) * 100
	const summary = `Mutation score (${scope}): ${detected}/${tested} tested mutants detected = ${Math.floor(score * 100) / 100}%, bar ${expected}%`
	if (score < expected) return fail(summary)
	record(summary)
	return 0
}

export function runMutationGate(argv, { expected, scope, prefix, configName, reportName, script }) {
	const input = parseArguments(argv, {
		values: ['root', 'evidence', 'config', 'since'], repeated: ['overlay'],
		refuse: { '--expected': 'refusing --expected: the bar is not a runtime argument' }, usage: usage(script),
	})
	if (!input.root) throw usageError('--root is required')
	const root = absoluteDir(input.root)
	if (!root) throw usageError(`repository root not found: ${input.root}`)
	if (!input.evidence) throw usageError('--evidence is required')
	const evidence = fromRoot(root, input.evidence)
	const config = absoluteFile(root, input.config ?? configName)
	if (!config) throw usageError(`mutation config not found: ${fromRoot(root, input.config ?? configName)}. Run configure-mutation.mjs first`)
	const since = input.since ?? ''

	let effective = config
	let temp
	let runDir
	try {
		if (input.overlay.length > 0) {
			const tempDir = mkdtempSync(join(root, '.stryker-overlay.'))
			temp = join(tempDir, 'config.json')
			try {
				let result = JSON.parse(readFileSync(config, 'utf8'))
				for (const path of input.overlay) {
					const overlay = JSON.parse(readFileSync(fromRoot(root, path), 'utf8'))
					result['stryker-config'] = merge(result['stryker-config'], overlay['stryker-config'] ?? overlay)
				}
				writeFileSync(temp, `${JSON.stringify(result, null, 2)}\n`)
			} catch (error) {
				throw usageError(error.message)
			}
			effective = temp
		}
		requireDotnetStryker()
		const solution = validate(effective, expected, reportName, root)

		// Stryker's own run folder (HTML, logs, native report) is private to this run and
		// never lands in the evidence: only the referenced report, stdout, exit and manifest do.
		runDir = mkdtempSync(join(tmpdir(), `skraft-${prefix}.`))
		const stdout = join(evidence, `${prefix}.stdout`)
		const report = join(evidence, `${prefix}-report.json`)
		const manifest = join(evidence, `${prefix}.json`)
		mkdirSync(evidence, { recursive: true })
		writeFileSync(stdout, '')
		const args = ['stryker', '--config-file', effective, '--output', runDir]
		if (since) args.push(`--since:${since}`)
		let status = dotnet(args, { cwd: root, output: stdout }).status

		const native = join(runDir, 'reports', `${reportName}.json`)
		if (existsSync(native)) {
			copyFileSync(native, report)
			if (judge({ report, stdout, expected, scope, since }) !== 0) status = 1
		} else {
			appendFileSync(stdout, `native mutation report missing: ${native}\n`)
			process.stderr.write(`native mutation report missing: ${native}\n`)
			status = 1
		}

		writeFileSync(join(evidence, `${prefix}.exit`), `${status}\n`)
		writeFileSync(join(evidence, `${prefix}.stdout.sha256`), `${sha256File(stdout)}\n`)
		const verdict = { gate: 'mutation', scope, expected, solution, config, report, since: since || null, passed: status === 0, exit: status }
		writeFileSync(manifest, `${JSON.stringify(verdict)}\n`)
		process.stdout.write(`${JSON.stringify(verdict)}\n`)
		return status === 0 ? 0 : 1
	} finally {
		if (temp) rmSync(join(temp, '..'), { recursive: true, force: true })
		if (runDir) rmSync(runDir, { recursive: true, force: true })
	}
}

export { Exit }
