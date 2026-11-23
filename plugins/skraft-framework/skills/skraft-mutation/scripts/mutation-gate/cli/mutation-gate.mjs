#!/usr/bin/env node
// G6 — the mutation gate, run by /skraft-mutation on the developer's demand, never by the
// pipeline. Mutation testing is the developer's responsibility: this runs the command they give
// for each component with SKRAFT_MUTATION_RESULT naming the file it writes its scores and
// survivors to, then holds every scope (core and boundary, or global) to 80% and lists every
// survivor to kill.
//
//   node mutation-gate.mjs --root <repo> --evidence <dir> --run <name>[@<root>]=<command> [--run …] [--since <base>]
//
// A command with no --since, {baseSha}, delta or incremental option mutates the whole component:
// the gate warns before running it.
//
// Writes <evidence>/qg-mutation.stdout, .exit, .stdout.sha256 and qg-mutation/ (each command's
// log and result, manifest.json).
// Exit: 0 pass · 1 gate failed · 2 blocked (no run given, invalid input).
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, openSync, realpathSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { MUTATION_BAR, RESULT_VARIABLE, fullRunWarning, mutationRuns, mutationVerdict, readResult, withBase } from '../domain/mutation-gate-policy.mjs'

export const EXIT = Object.freeze({ pass: 0, fail: 1, blocked: 2 })
const USAGE = 'usage: mutation-gate.mjs --root <repo> --evidence <dir> --run <name>[@<root>]=<command> [--run …] [--since <base>]'

const sha256 = (text) => createHash('sha256').update(text).digest('hex')
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const toPosix = (path) => path.split('\\').join('/')

// Tracked files that differ from HEAD, with a hash of their content, so a run that leaves a
// source modified (a mutant not restored) is caught even in a file already modified before it.
async function trackedChanges(root, ignored) {
	const names = git(root, ['diff', '--name-only', '-z', 'HEAD', '--']).split('\0').filter((name) => name && !ignored(name))
	return new Map(await Promise.all(names.map(async (name) => [name, sha256(await readFile(join(root, name)).catch(() => Buffer.alloc(0)))])))
}

function runCommand(command, { cwd, log, result }) {
	const out = openSync(log, 'w')
	return new Promise((done) => {
		const child = spawn(command, { cwd, shell: true, env: { ...process.env, [RESULT_VARIABLE]: result }, stdio: ['ignore', out, out] })
		child.once('error', (error) => done({ code: 127, error: error.message }))
		child.once('close', (code, signal) => done({ code: code ?? 128, signal }))
	}).finally(() => closeSync(out))
}

export async function runMutationGate({ root: rootInput, evidence: evidenceInput, since, run = [] }) {
	const lines = []
	const manifest = { bar: MUTATION_BAR, components: [] }
	let exitCode = EXIT.blocked
	let prefix
	let root
	try {
		root = resolve(rootInput)
		const evidence = resolve(root, evidenceInput)
		prefix = join(evidence, 'qg-mutation')
		await mkdir(evidence, { recursive: true })
		for (const stale of [`${prefix}.stdout`, `${prefix}.exit`, `${prefix}.stdout.sha256`, prefix]) await rm(stale, { recursive: true, force: true })
		await mkdir(prefix)

		const { components, problems } = mutationRuns(run)
		if (problems.length) throw new Error(problems.join('; '))
		if (components.length === 0) throw new Error(`no component to run: give one --run per component\n${USAGE}`)
		for (const component of components) {
			const warning = fullRunWarning(component)
			if (warning) lines.push(warning)
		}
		const base = since ? git(root, ['rev-parse', '--verify', `${since}^{commit}`]) : undefined
		const commands = components.map((component) => ({ ...component, line: withBase(component.command, base) }))
		manifest.since = since ? { requested: since, base } : null
		manifest.revision = git(root, ['rev-parse', 'HEAD'])

		const evidencePath = toPosix(relative(root, evidence))
		const ignored = (name) => name === evidencePath || name.startsWith(`${evidencePath}/`)
		const before = await trackedChanges(root, ignored)
		manifest.clean = before.size === 0
		exitCode = EXIT.fail

		const runs = []
		for (const component of commands) {
			const cwd = join(root, component.root)
			const resultPath = join(prefix, `${component.name}.result.json`)
			const started = Date.now()
			const result = await runCommand(component.line, { cwd, log: join(prefix, `${component.name}.log`), result: resultPath })
			const text = await readFile(resultPath, 'utf8').catch(() => null)
			const reading = text === null ? { ok: false, reason: `is missing: the command wrote nothing to $${RESULT_VARIABLE}` } : readResult(text)
			runs.push({ name: component.name, root: component.root, exitCode: result.code, reading })
			manifest.components.push({ name: component.name, root: component.root, command: component.line, exit_code: result.code, duration_ms: Date.now() - started, result: reading.ok ? reading.scopes : null })
			lines.push(`${component.name}: ${component.line} (exit ${result.code})`)
		}

		const after = await trackedChanges(root, ignored)
		const touched = [...after.keys(), ...before.keys()].filter((name, index, all) => all.indexOf(name) === index && before.get(name) !== after.get(name))
		const verdict = mutationVerdict(runs)
		if (touched.length) {
			verdict.problems.push(`the mutation commands left tracked files modified: ${touched.join(', ')}`)
			verdict.passed = false
		}
		manifest.verdict = verdict
		for (const s of verdict.scores) lines.push(`${s.component} ${s.scope}: ${s.score.toFixed(2)}% ${s.passed ? 'meets' : 'is below'} ${MUTATION_BAR}%${s.survivorsReported ? '' : ' (survivors not reported)'}`)
		for (const s of verdict.survivors) lines.push(`survived: ${s.file}:${s.line}${s.detail === null ? '' : ` ${s.detail}`} (${s.component} ${s.scope})`)
		lines.push(verdict.passed
			? `mutation scores meet ${MUTATION_BAR}% (${verdict.scores.map((s) => `${s.component} ${s.scope} ${s.score.toFixed(2)}%`).join(', ')})`
			: `mutation gate failed: ${verdict.problems.join('; ')}`)
		exitCode = verdict.passed ? EXIT.pass : EXIT.fail
		return { exitCode, manifest, lines }
	} catch (error) {
		lines.push(`mutation gate ${exitCode === EXIT.blocked ? 'blocked' : 'failed'}: ${error.message}`)
		return { exitCode, manifest, lines }
	} finally {
		if (prefix) {
			manifest.exit_code = exitCode
			const text = `${lines.join('\n')}\n`
			await writeFile(join(prefix, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`).catch(() => {})
			await writeFile(`${prefix}.stdout`, text).catch(() => {})
			await writeFile(`${prefix}.exit`, `${exitCode}\n`).catch(() => {})
			await writeFile(`${prefix}.stdout.sha256`, `${sha256(text)}\n`).catch(() => {})
		}
	}
}

async function main() {
	let result
	try {
		const { values } = parseArgs({ options: { root: { type: 'string', default: '.' }, evidence: { type: 'string' }, since: { type: 'string' }, run: { type: 'string', multiple: true, default: [] } } })
		if (!values.evidence) throw new Error(USAGE)
		result = await runMutationGate(values)
	} catch (error) {
		result = { exitCode: EXIT.blocked, lines: [`mutation gate blocked: ${error.message}`] }
	}
	process.stdout.write(`${result.lines.join('\n')}\n`)
	process.exitCode = result.exitCode
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main()
