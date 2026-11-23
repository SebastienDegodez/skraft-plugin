// Pure rules of the mutation gate (G6). No IO: the CLI runs the commands and reads the files.
//
// Mutation testing is the developer's responsibility and never runs in the pipeline: DELIVER
// records G6 `not_run`. The developer runs /skraft-mutation, which asks them for the command of
// each component and passes it here. The command runs their mutation tool and writes its scores
// and surviving mutants as JSON to the file SKRAFT names in SKRAFT_MUTATION_RESULT: core and
// boundary for a Clean Architecture component, global for a single project. SKRAFT holds every
// scope to the bar and hands the survivors on to be killed.

// The score every scope must reach, in percent. Not configurable.
export const MUTATION_BAR = 80

// The environment variable naming the file the command writes its result to.
export const RESULT_VARIABLE = 'SKRAFT_MUTATION_RESULT'

// G6 in a delivery: never run by the pipeline.
export const PIPELINE_NOT_RUN = 'G6 not run: mutation testing runs outside the pipeline; the developer runs /skraft-mutation.'

// The scope sets a result may carry, in report order.
const SCOPE_SETS = Object.freeze([['core', 'boundary'], ['global']])

const text = (value) => typeof value === 'string' && value.trim().length > 0
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const toPosix = (value) => value.replaceAll('\\', '/')
const isAbsolute = (value) => value.startsWith('/') || /^[A-Za-z]:/.test(value)

// A folder that stays inside the repository: relative, no `..` segment. `.` is the root.
const insidePath = (value) => {
	if (!text(value) || isAbsolute(value)) return null
	const parts = toPosix(value).split('/').filter((part) => part !== '' && part !== '.')
	return parts.includes('..') ? null : (parts.join('/') || '.')
}

// `<name>=<command>` or `<name>@<root>=<command>`: the component, the folder its command runs
// in (the repository root by default) and the command.
const RUN = /^([^@=]+?)(?:@([^=]*))?=(.*)$/s

// The runs the developer gave, each `--run` value parsed and checked.
export function mutationRuns(specs) {
	const components = []
	const problems = []
	const names = new Set()
	for (const spec of specs) {
		const match = RUN.exec(spec ?? '')
		if (!match) {
			problems.push(`--run ${spec}: expected <name>[@<root>]=<command>`)
			continue
		}
		const [, rawName, rawRoot, rawCommand] = match
		const name = rawName.trim()
		const local = []
		if (!text(name)) local.push(`--run ${spec}: the component name is required`)
		else if (names.has(name)) local.push(`${name}: given twice`)
		const root = insidePath(rawRoot === undefined || rawRoot.trim() === '' ? '.' : rawRoot)
		if (root === null) local.push(`${name}: root must be a folder inside the repository`)
		if (!text(rawCommand)) local.push(`${name}: the mutation command is empty`)
		names.add(name)
		if (local.length) problems.push(...local)
		else components.push({ name, root, command: rawCommand.trim() })
	}
	return { components, problems }
}

// A command that tests only what changed names a base or an incremental mode.
const INCREMENTAL = /\{baseSha\}|--since|delta|incremental|--diff|git[- ]diff|changed|withHistory/i

// The alert to raise before a run that mutates the whole component, or null.
export const fullRunWarning = ({ name, command }) => (INCREMENTAL.test(command)
	? null
	: `warning: ${name} runs a full mutation (no --since, {baseSha}, delta or incremental option): every mutant of the component is tested`)

// `{baseSha}` in a command takes the base revision, as in v2.
export function withBase(command, base) {
	if (!command.includes('{baseSha}')) return command
	if (!text(base)) throw new Error(`"${command}" uses {baseSha}: pass --since <base>`)
	return command.replaceAll('{baseSha}', base)
}

// One survivor per line, `file:line detail` as compilers and linters print it, the file relative
// to the component root and the detail free text (mutator, replacement): short to write and read.
const SURVIVOR_LINE = /^(.+?):(\d+)(?:\s+(.*?))?\s*$/

function readSurvivor(entry) {
	const match = typeof entry === 'string' ? SURVIVOR_LINE.exec(entry) : null
	const file = match ? insidePath(match[1]) : null
	const line = match ? Number(match[2]) : 0
	if (file === null || file === '.' || line < 1) return null
	return { file, line, detail: match[3] || null }
}

// The scores and survivors a command wrote: { scopes: [{ name, score, survivors? }] }, core and
// boundary or global. `survivors` is optional, a team may leave it out: it reads as null (not
// reported), distinct from [] (none survived).
export function readResult(content) {
	if (!text(content)) return { ok: false, reason: 'is empty' }
	let json
	try {
		json = JSON.parse(content)
	} catch {
		return { ok: false, reason: 'is not JSON' }
	}
	if (!object(json) || !Array.isArray(json.scopes)) return { ok: false, reason: 'has no scopes list' }
	const scopes = []
	for (const scope of json.scopes) {
		if (!object(scope) || !text(scope.name) || !Number.isFinite(scope.score)) {
			return { ok: false, reason: 'holds a scope without a name and a score' }
		}
		if (scope.score < 0 || scope.score > 100) return { ok: false, reason: `scores ${scope.name} ${scope.score}, not between 0 and 100` }
		if (scope.survivors === undefined || scope.survivors === null) {
			scopes.push({ name: scope.name, score: scope.score, survivors: null })
			continue
		}
		if (!Array.isArray(scope.survivors)) return { ok: false, reason: `${scope.name} survivors is not a list` }
		const read = scope.survivors.map(readSurvivor)
		if (read.includes(null)) return { ok: false, reason: `${scope.name} lists a survivor that is not "file:line detail" with the file inside the component` }
		if (scope.score === 100 && read.length > 0) return { ok: false, reason: `${scope.name} scores 100% yet lists ${read.length} survivor(s)` }
		scopes.push({ name: scope.name, score: scope.score, survivors: read })
	}
	const names = scopes.map((scope) => scope.name)
	const set = SCOPE_SETS.find((wanted) => wanted.length === names.length && wanted.every((name) => names.includes(name)))
	if (!set) return { ok: false, reason: `scopes ${names.join(', ') || '(none)'}; expected core and boundary, or global` }
	return { ok: true, scopes: set.map((name) => scopes.find((scope) => scope.name === name)) }
}

// runs: [{ name, root, exitCode, reading }] with reading from readResult. Survivors come out
// relative to the repository, for the developer or the agent to kill.
export function mutationVerdict(runs) {
	const problems = []
	const scores = []
	const survivors = []
	for (const { name, root = '.', exitCode, reading } of runs) {
		if (exitCode !== 0) problems.push(`${name}: the mutation command exited ${exitCode}`)
		if (!reading.ok) {
			problems.push(`${name}: the mutation result ${reading.reason}`)
			continue
		}
		for (const { name: scope, score, survivors: found } of reading.scopes) {
			const passed = score >= MUTATION_BAR
			scores.push({ component: name, scope, score, passed, survivorsReported: found !== null })
			if (!passed) problems.push(`${name}: ${scope} ${score}% is below ${MUTATION_BAR}%`)
			for (const survivor of found ?? []) survivors.push({ component: name, scope, ...survivor, file: root === '.' ? survivor.file : `${root}/${survivor.file}` })
		}
	}
	return { passed: problems.length === 0, scores, survivors, problems }
}
