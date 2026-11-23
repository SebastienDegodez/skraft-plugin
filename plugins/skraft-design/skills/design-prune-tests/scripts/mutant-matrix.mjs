#!/usr/bin/env node
// Reads a full-matrix mutation report (StrykerJS JSON or PIT mutations.xml) and lists the tests
// that add no kill of their own, or compares two reports to prove no kill was lost.
//   list    --report <path> [--tests <prefix>] [--json]  exit 0 listed, 2 refused or unreadable
//   compare --before <path> --after <path> exit 0 every kill kept, 1 kill lost or mutant gone, 2 refused
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export class Refusal extends Error {}

const DETECTED_STRYKER = new Set(['Killed', 'Timeout'])
const COVERED_STRYKER = new Set(['Killed', 'Timeout', 'Survived'])
const DETECTED_PIT = new Set(['KILLED', 'TIMED_OUT', 'MEMORY_ERROR'])

const unique = (values) => [...new Set(values)]

function decode(text) {
	return text.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_, entity) => {
		const named = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }[entity.toLowerCase()]
		if (named) return named
		return String.fromCodePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10))
	})
}

function element(body, tag) {
	const match = body.match(new RegExp(`<${tag}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${tag}>)`))
	return match ? decode((match[1] ?? '').trim()) : null
}

function attribute(attrs, name) {
	const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:'([^']*)'|"([^"]*)")`))
	return match ? decode(match[1] ?? match[2]) : null
}

function shortMutator(mutator) {
	return mutator.split('.').pop()
}

export function parseStryker(text) {
	let json
	try {
		json = JSON.parse(text)
	} catch {
		throw new Refusal('report is neither StrykerJS JSON nor PIT XML')
	}
	if (!json || typeof json.files !== 'object' || json.files === null) throw new Refusal('JSON report has no "files" object; not a StrykerJS mutation report')
	const tests = new Map()
	if (json.testFiles && typeof json.testFiles === 'object') {
		for (const [file, entry] of Object.entries(json.testFiles)) {
			for (const t of entry?.tests ?? []) tests.set(String(t.id), { id: String(t.id), name: t.name ?? String(t.id), file })
		}
	}
	const mutants = []
	for (const [file, entry] of Object.entries(json.files)) {
		for (const m of entry?.mutants ?? []) {
			const line = m.location?.start?.line
			const column = m.location?.start?.column
			const replacement = m.replacement ?? ''
			mutants.push({
				key: `${file}:${line}:${column} ${m.mutatorName} ${JSON.stringify(replacement)}`,
				label: `${file}:${line}:${column} ${m.mutatorName} ${JSON.stringify(replacement)}`,
				site: `${file}:${line} ${m.mutatorName}`,
				status: m.status,
				detected: DETECTED_STRYKER.has(m.status),
				killedBy: unique((m.killedBy ?? []).map(String)),
				coveredBy: unique((m.coveredBy ?? []).map(String)),
				missingCoverage: !Array.isArray(m.coveredBy) && m.static !== true && COVERED_STRYKER.has(m.status),
			})
		}
	}
	return { format: 'stryker', mutants, tests: json.testFiles ? tests : null, config: json.config && typeof json.config === 'object' ? json.config : null }
}

export function parsePit(text) {
	const mutants = []
	let singular = false
	let plural = false
	for (const [, attrs, body] of text.matchAll(/<mutation\b([^>]*)>([\s\S]*?)<\/mutation>/g)) {
		if (/<killingTest\b/.test(body)) singular = true
		if (/<killingTests\b/.test(body)) plural = true
		const status = attribute(attrs, 'status') ?? ''
		const cls = element(body, 'mutatedClass') ?? ''
		const method = element(body, 'mutatedMethod') ?? ''
		const signature = element(body, 'methodDescription') ?? ''
		const line = element(body, 'lineNumber') ?? ''
		const mutator = element(body, 'mutator') ?? ''
		const indexes = [...(body.match(/<indexes>([\s\S]*?)<\/indexes>/)?.[1] ?? '').matchAll(/<index>\s*([^<]*?)\s*<\/index>/g)].map((m) => m[1])
		const description = element(body, 'description') ?? ''
		const split = (value) => (value ? value.split('|').map((s) => s.trim()).filter(Boolean) : [])
		const killedBy = unique(split(element(body, 'killingTests') ?? element(body, 'killingTest')))
		const succeeding = split(element(body, 'succeedingTests'))
		mutants.push({
			key: `${cls}.${method}${signature}:${line} ${mutator} #${indexes.join(',')} ${description}`,
			label: `${cls}.${method}:${line} ${shortMutator(mutator)} #${indexes.join(',')}`,
			site: `${element(body, 'sourceFile') ?? cls}:${line} ${shortMutator(mutator)} (${cls}.${method})`,
			status,
			detected: DETECTED_PIT.has(status),
			killedBy,
			coveredBy: unique([...killedBy, ...succeeding]),
		})
	}
	return { format: 'pit', mutants, tests: null, pit: { singular, plural } }
}

export function parseReport(text) {
	const trimmed = text.trimStart()
	if (trimmed.startsWith('{')) return parseStryker(text)
	if (/^(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<mutations\b/.test(trimmed)) return parsePit(text)
	throw new Refusal('report is neither StrykerJS JSON nor PIT XML')
}

// Returns the reason a report cannot serve per-test analysis, or null.
export function fullMatrixProblem(report) {
	const killed = report.mutants.filter((m) => m.detected && m.killedBy.length > 0)
	if (report.format === 'pit') {
		if (report.pit.singular) return 'PIT report is not a full matrix: <killingTest> names one killer; rerun with -DfullMutationMatrix=true -DoutputFormats=XML'
		if (!report.pit.plural && report.mutants.some((m) => m.detected)) return 'PIT report is not a full matrix: no <killingTests> element; rerun with -DfullMutationMatrix=true -DoutputFormats=XML'
		return null
	}
	const { config } = report
	if (config) {
		if (config.disableBail !== true) return 'Stryker report is not a full matrix: the run did not set disableBail; rerun with --disableBail'
		if (config.coverageAnalysis !== 'perTest') return `Stryker report has no per-test coverage: the run used coverageAnalysis ${config.coverageAnalysis ?? '(default)'}; rerun with --coverageAnalysis perTest`
	} else if (report.mutants.some((m) => m.missingCoverage)) {
		return 'Stryker report has covered mutants without coveredBy: no per-test coverage; rerun with --coverageAnalysis perTest'
	}
	if (report.mutants.some((m) => m.status === 'Killed') && killed.length === 0) return 'Stryker report is not a full matrix: killed mutants name no killedBy test; rerun with --disableBail and the json reporter'
	return null
}

// Returns a doubt about a Stryker report without its run config that names one killer per mutant, or null.
export function fullMatrixWarning(report) {
	if (report.format !== 'stryker' || report.config) return null
	const killed = report.mutants.filter((m) => m.detected && m.killedBy.length > 0)
	if (killed.length > 0 && killed.every((m) => m.killedBy.length === 1) && killed.some((m) => m.coveredBy.length > 1)) {
		return 'every killed mutant names one killer although several tests cover it; check the run used --disableBail'
	}
	return null
}

function testIds(report) {
	const ids = new Set(report.tests ? report.tests.keys() : [])
	for (const m of report.mutants) for (const id of [...m.coveredBy, ...m.killedBy]) ids.add(id)
	return ids
}

const matches = (prefixes) => (t) => !prefixes?.length || prefixes.some((prefix) => (t.file ?? t.name).startsWith(prefix))

export function analyse(report, { tests: prefixes } = {}) {
	const stats = new Map()
	for (const id of testIds(report)) {
		const known = report.tests?.get(id)
		stats.set(id, { id, name: known?.name ?? id, ...(known ? { file: known.file } : {}), covered: 0, killed: 0, killedAlone: 0 })
	}
	for (const m of report.mutants) {
		for (const id of unique([...m.coveredBy, ...m.killedBy])) stats.get(id).covered++
		for (const id of m.killedBy) {
			stats.get(id).killed++
			if (m.killedBy.length === 1) stats.get(id).killedAlone++
		}
	}
	const tests = [...stats.values()].filter(matches(prefixes))
	const notes = []
	let coversNothing = null
	if (report.format === 'pit') notes.push('PIT names only tests that reach a mutant, so it cannot see tests that cover no mutant; review them by reading the test sources.')
	else if (!report.tests) notes.push('Stryker report has no testFiles, so tests that cover no mutant cannot be listed and test ids stand for names.')
	else coversNothing = tests.filter((t) => t.covered === 0)
	return {
		format: report.format,
		testCount: tests.length,
		mutantCount: report.mutants.length,
		notes,
		coversNothing,
		killsNothing: tests.filter((t) => t.covered > 0 && t.killed === 0),
		sharedKillsOnly: tests.filter((t) => t.killed > 0 && t.killedAlone === 0),
		survived: report.mutants.filter((m) => /^surviv/i.test(m.status)).map((m) => m.site),
		noCoverage: report.mutants.filter((m) => /^no_?coverage$/i.test(m.status)).map((m) => m.site),
		tests,
	}
}

export function compareReports(before, after) {
	if (before.format !== after.format) throw new Refusal(`cannot compare a ${before.format} report with a ${after.format} report`)
	const index = (report) => {
		const byKey = new Map()
		for (const m of report.mutants) byKey.set(m.key, [...(byKey.get(m.key) ?? []), m])
		return byKey
	}
	const afterByKey = index(after)
	const lost = []
	const gone = []
	for (const [key, olds] of index(before)) {
		const news = afterByKey.get(key) ?? []
		if (news.length < olds.length) gone.push(olds[0].label)
		const detectedAfter = news.filter((m) => m.detected).length
		const detectedBefore = olds.filter((m) => m.detected).length
		if (news.length >= olds.length && detectedAfter < detectedBefore) lost.push(`${olds[0].label} (${news.find((m) => !m.detected)?.status})`)
	}
	const killed = (report) => report.mutants.filter((m) => m.detected).length
	return {
		ok: lost.length === 0 && gone.length === 0,
		tests: { before: testIds(before).size, after: testIds(after).size },
		killed: { before: killed(before), after: killed(after) },
		lost,
		gone,
	}
}

function testLine(t) {
	return `  ${t.name}${t.file ? ` [${t.file}]` : ''}  (covers ${t.covered}, kills ${t.killed}, alone ${t.killedAlone})`
}

export function formatList(result) {
	const section = (title, items, render) => (items.length ? [`${title} (${items.length}):`, ...items.map(render)] : [`${title} (0)`])
	const lines = [`Report: ${result.format}, ${result.testCount} tests, ${result.mutantCount} mutants`, ...result.notes.map((n) => `Note: ${n}`)]
	if (result.coversNothing) lines.push(...section('Tests covering no mutant', result.coversNothing, testLine))
	lines.push(...section('Tests killing no mutant', result.killsNothing, testLine))
	lines.push(...section('Tests whose kills are all shared', result.sharedKillsOnly, testLine))
	lines.push(...section('Survived mutants', result.survived, (s) => `  ${s}`))
	lines.push(...section('No-coverage mutants', result.noCoverage, (s) => `  ${s}`))
	return `${lines.join('\n')}\n`
}

export function formatCompare(result) {
	const lines = [`Tests: ${result.tests.before} before, ${result.tests.after} after`, `Killed mutants: ${result.killed.before} before, ${result.killed.after} after`]
	lines.push(...result.lost.map((l) => `lost: ${l}`), ...result.gone.map((g) => `gone: ${g}`))
	lines.push(result.ok ? 'Every mutant killed before is killed after.' : `${result.lost.length} kill(s) lost, ${result.gone.length} mutant(s) gone.`)
	return `${lines.join('\n')}\n`
}

function options(argv) {
	const out = { _: [] }
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg === '--json') out.json = true
		else if (arg === '--tests') {
			const value = argv[++i]
			if (value === undefined || value.startsWith('--')) throw new Refusal('--tests needs a value')
			out.tests = [...(out.tests ?? []), ...value.split(',').map((p) => p.trim()).filter(Boolean)]
		}
		else if (arg.startsWith('--')) {
			const value = argv[i + 1]
			if (value === undefined || value.startsWith('--')) throw new Refusal(`${arg} needs a value`)
			out[arg.slice(2)] = value
			i++
		} else out._.push(arg)
	}
	return out
}

function load(path) {
	if (!path) throw new Refusal('missing report path')
	let text
	try {
		text = readFileSync(path, 'utf8')
	} catch {
		throw new Refusal(`cannot read ${path}`)
	}
	return parseReport(text)
}

export function run(argv) {
	try {
		const opts = options(argv)
		const [command] = opts._
		if (command === 'list') {
			const report = load(opts.report)
			const problem = fullMatrixProblem(report)
			if (problem) throw new Refusal(problem)
			const warning = fullMatrixWarning(report)
			const result = analyse(report, { tests: opts.tests })
			return { code: 0, stdout: opts.json ? `${JSON.stringify(result, null, 2)}\n` : formatList(result), stderr: warning ? `Warning: ${warning}\n` : '' }
		}
		if (command === 'compare') {
			const result = compareReports(load(opts.before), load(opts.after))
			return { code: result.ok ? 0 : 1, stdout: opts.json ? `${JSON.stringify(result, null, 2)}\n` : formatCompare(result), stderr: '' }
		}
		throw new Refusal('usage: mutant-matrix.mjs list --report <path> [--tests <prefix>[,<prefix>]] [--json] | compare --before <path> --after <path> [--json]')
	} catch (error) {
		if (error instanceof Refusal) return { code: 2, stdout: '', stderr: `${error.message}\n` }
		throw error
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const { code, stdout, stderr } = run(process.argv.slice(2))
		process.stdout.write(stdout)
		process.stderr.write(stderr)
		process.exitCode = code
	} catch (error) {
		process.stderr.write(`unreadable report: ${error?.message ?? error}\n`)
		process.exitCode = 2
	}
}
