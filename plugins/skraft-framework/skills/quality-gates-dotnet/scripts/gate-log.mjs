#!/usr/bin/env node
// Writes the story's evidence log (quality-gates-evidence-contract v7) one gate at a time, so
// no agent ever types a status: a gate's status comes from its command's exit code. The log is
// the only text file of the Git-ignored evidence directory; no stdout, exit or hash file exists.
// Every write stamps repo_root_rev with HEAD and produced_at with the current time; each gate a
// command attests keeps the tree it ran on, so a verdict from before a code change is stale.
//
//   node gate-log.mjs --log <dir>/qg-<story>.json --screenshot <png> [--screenshot <png> …]
//   node gate-log.mjs --log <dir>/qg-<story>.json --not-applicable <gate id> --rationale <text>
//   node gate-log.mjs --log <dir>/qg-<story>.json --restamp
//
// --restamp moves repo_root_rev to HEAD without running anything, and only when HEAD holds the
// very tree the gates ran on (a reworded commit message): any code change needs the gates again.
//
// Commands are recorded by capture.mjs and the no-mocks scan through recordGate.
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCHEMA = 'quality-gates-evidence/v7'
export const IGNORE_LINE = '.copilot-tracking/skraft-plans/*/evidence/'
export const LABELS = Object.freeze({
	'test.acceptance': 'Acceptance test(s) pass',
	'test.unit': 'All unit tests pass',
	'build.compile': 'Build passes',
	'build.lint': 'Static analysis pass',
	'test.no-mocks-core': 'No mocks in Domain/Application core',
	'evidence.screenshots': 'Frontend screenshots captured',
})
// The skill that owns this copy: quality-gates-<stack>/scripts/gate-log.mjs.
const ADAPTER = basename(dirname(dirname(fileURLToPath(import.meta.url))))
const SUMMARY_MAX = 200

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const toPosix = (path) => path.split('\\').join('/')

// The last non-empty line of a command's output, bounded: what a reviewer reads first.
export const summaryOf = (output) => {
	const line = String(output ?? '').split(/\r?\n/).map((text) => text.trim()).filter(Boolean).at(-1) ?? ''
	return line.length > SUMMARY_MAX ? `${line.slice(0, SUMMARY_MAX - 1)}…` : line
}

// The log path names the story (qg-<story>.json) and sits in a Git-ignored evidence directory.
export function logTarget(root, logPath) {
	const path = isAbsolute(logPath) ? logPath : resolve(root, logPath)
	const story = basename(path).match(/^qg-(.+)\.json$/)?.[1]
	if (!story) throw new Error(`--log ${logPath} is not <evidence dir>/qg-<story>.json`)
	const directory = toPosix(relative(root, dirname(path)))
	if (directory.startsWith('..')) throw new Error(`--log ${logPath} is outside the repository`)
	// The log path itself: a pattern such as evidence/ matches only what Git knows to sit in a directory.
	if (spawnSync('git', ['-C', root, 'check-ignore', '-q', '--', toPosix(relative(root, path))]).status !== 0) {
		throw new Error(`${directory} is not ignored by Git: add ${IGNORE_LINE} to .gitignore in a work commit`)
	}
	const ref = directory.slice(Math.max(0, directory.lastIndexOf('evidence/')))
	return { path, story, directory: dirname(path), ref }
}

const readLog = (target) => {
	if (!existsSync(target.path)) return { $schema: SCHEMA, story: target.story, producer: 'software-engineer', tech_adapter: ADAPTER, gates: [] }
	const log = JSON.parse(readFileSync(target.path, 'utf8'))
	if (log.$schema !== SCHEMA) throw new Error(`${target.path} is not a ${SCHEMA} log: remove it and record every gate again`)
	return log
}

const writeLog = (root, target, log, entries) => {
	const gates = (Array.isArray(log.gates) ? log.gates : []).filter((gate) => !entries.some((entry) => entry.id === gate?.id))
	const { gates: _previous, ...header } = log
	const next = { ...header, produced_at: new Date().toISOString(), repo_root_rev: git(root, ['rev-parse', 'HEAD']), gates: [...gates, ...entries] }
	mkdirSync(target.directory, { recursive: true })
	writeFileSync(target.path, `${JSON.stringify(next, null, 2)}\n`)
	return next
}

const known = (id) => {
	if (!Object.hasOwn(LABELS, id)) throw new Error(`${id} is not a gate a command records (${Object.keys(LABELS).join(', ')})`)
	return id
}

// One command attests one or more gates (a single test run may attest test.acceptance and test.unit).
export function recordGate({ root, log, ids, code, output, command, metrics }) {
	const target = logTarget(root, log)
	const tree = git(root, ['rev-parse', 'HEAD^{tree}'])
	const entries = ids.map(known).map((id) => ({
		id, label: LABELS[id], status: code === 0 ? 'pass' : 'fail', command_executed: command, summary: summaryOf(output), tree,
		...(metrics ? { metrics } : {}),
	}))
	return writeLog(root, target, readLog(target), entries)
}

export function recordNotApplicable({ root, log, id, rationale }) {
	if (!rationale?.trim()) throw new Error('--rationale is required with --not-applicable')
	const target = logTarget(root, log)
	return writeLog(root, target, readLog(target), [{ id: known(id), label: LABELS[id], status: 'not_applicable', rationale: rationale.trim() }])
}

// Copies each PNG into <evidence dir>/screenshots/ and records its sha256.
export function recordScreenshots({ root, log, pictures }) {
	const target = logTarget(root, log)
	if (pictures.length === 0) throw new Error('--screenshot <png> is required at least once')
	mkdirSync(join(target.directory, 'screenshots'), { recursive: true })
	const screenshots = pictures.map((picture) => {
		const source = isAbsolute(picture) ? picture : resolve(root, picture)
		if (!existsSync(source)) throw new Error(`--screenshot ${picture} not found`)
		const copy = join(target.directory, 'screenshots', basename(source))
		if (resolve(copy) !== resolve(source)) copyFileSync(source, copy)
		return { ref: `${target.ref}/screenshots/${basename(source)}`, sha256: sha256(readFileSync(source)) }
	})
	const gate = { id: 'evidence.screenshots', label: LABELS['evidence.screenshots'], status: 'pass', screenshots }
	return writeLog(root, target, readLog(target), [gate])
}

export function restamp({ root, log }) {
	const target = logTarget(root, log)
	if (!existsSync(target.path)) throw new Error(`${log} does not exist: record the gates first`)
	const current = readLog(target)
	const tree = (rev) => git(root, ['rev-parse', `${rev}^{tree}`])
	let before
	try { before = tree(current.repo_root_rev) } catch { throw new Error(`repo_root_rev ${current.repo_root_rev} does not resolve: run the gates again`) }
	if (before !== tree('HEAD')) throw new Error('the code changed since the gates ran: run them again')
	return writeLog(root, target, current, [])
}

function cli(argv) {
	const options = { screenshot: [] }
	for (let index = 0; index < argv.length; index += 2) {
		const key = argv[index]?.replace(/^--/, '')
		const value = argv[index + 1]
		if (key === 'restamp') { options.restamp = true; index -= 1; continue }
		if (!['log', 'root', 'screenshot', 'not-applicable', 'rationale'].includes(key) || value === undefined) throw new Error(`Unexpected argument: ${argv[index]}`)
		if (key === 'screenshot') options.screenshot.push(value)
		else options[key] = value
	}
	if (!options.log) throw new Error('--log <evidence dir>/qg-<story>.json is required')
	const root = git(resolve(options.root ?? '.'), ['rev-parse', '--show-toplevel'])
	const log = options.restamp
		? restamp({ root, log: options.log })
		: options['not-applicable']
		? recordNotApplicable({ root, log: options.log, id: options['not-applicable'], rationale: options.rationale })
		: recordScreenshots({ root, log: options.log, pictures: options.screenshot })
	process.stdout.write(`${log.gates.map((gate) => `${gate.id} ${gate.status}`).join('\n')}\n`)
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
	try {
		cli(process.argv.slice(2))
	} catch (error) {
		process.stdout.write(`gate-log blocked: ${error.message}\n`)
		process.exitCode = 2
	}
}
