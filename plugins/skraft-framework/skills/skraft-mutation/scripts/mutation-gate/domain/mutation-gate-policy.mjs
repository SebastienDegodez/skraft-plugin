// Pure rules of the mutation gate (G6). No IO: the CLI runs the commands and reads the files.
//
// Mutation testing is the developer's responsibility. The developer declares a command per
// component in skraft-config.json (`components[].commands.mutation`, the v2 shape) that runs
// their mutation tool and writes its scores and surviving mutants as JSON to the file SKRAFT
// names in SKRAFT_MUTATION_RESULT: core and boundary for a Clean Architecture component, global
// for a single project. SKRAFT runs it, holds every scope to the bar and hands the survivors on
// to be killed; without any command the gate does not run.

// The score every scope must reach, in percent. Not configurable.
export const MUTATION_BAR = 80

// The environment variable naming the file the command writes its result to.
export const RESULT_VARIABLE = 'SKRAFT_MUTATION_RESULT'

// Where /skraft-mutation keeps the developer's last run, for DELIVER to reuse.
export const MANUAL_EVIDENCE = '.copilot-tracking/mutation'

// Whether DELIVER runs G6: yes unless the team set `mutation.pipeline` to false (/skraft-init
// mutation), in which case the developer runs /skraft-mutation.
export const inPipeline = (config) => !(object(config) && object(config.mutation) && config.mutation.pipeline === false)

// A developer run stands for G6 when it judged HEAD, on a working copy whose tracked files all
// matched HEAD, and reached a verdict (pass or fail).
export const reusableRun = (manifest, head) => object(manifest)
	&& manifest.revision === head && manifest.clean === true && [0, 1].includes(manifest.exit_code)

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

// The components whose mutation the gate runs, each with the command to run and its folder.
export function mutationComponents(config) {
	if (!object(config) || config.components === undefined) return { components: [], problems: [] }
	if (!Array.isArray(config.components)) return { components: [], problems: ['components must be a list'] }
	const components = []
	const problems = []
	const names = new Set()
	config.components.forEach((entry, index) => {
		if (!object(entry) || !object(entry.commands) || entry.commands.mutation === undefined) return
		const command = entry.commands.mutation
		const label = text(entry.name) ? entry.name : `components[${index}]`
		const local = []
		if (!text(entry.name)) local.push(`${label}: name is required`)
		else if (names.has(entry.name)) local.push(`${label}: declared twice`)
		const root = insidePath(entry.root ?? '.')
		if (root === null) local.push(`${label}: root must be a folder inside the repository`)
		if (!text(command)) local.push(`${label}: commands.mutation must be a command`)
		names.add(entry.name)
		if (local.length) problems.push(...local)
		else components.push({ name: entry.name, root, command: command.trim() })
	})
	return { components, problems }
}

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
