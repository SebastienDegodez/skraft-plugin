// Pure rules of the TypeScript quality gates: arguments, Stryker configs, mutation and coverage
// verdicts, suppression and mock detection. No I/O here; the runners own processes and files.
import * as nodePath from 'node:path'

export const LIMITS = Object.freeze({ core: 100, boundary: 80 })
export const STRYKER_MAJOR = 10
// StrykerJS 10's Vitest runner reads Vitest's internal run state as Vitest 4 shapes it; under Vitest 5
// it sees no failing test and reports every mutant as survived. Its own suite runs on Vitest 4.1.
export const VITEST_MAJOR_FOR_STRYKER = 4
export const SOURCE = /\.(ts|tsx|js|jsx|mts|cts)$/

const CONFIG_KEYS = ['$schema', 'testRunner', 'mutate', 'vitest', 'coverageAnalysis', 'timeoutMS', 'concurrency']
const VITEST_KEYS = ['configFile', 'dir', 'related']

function ensure(condition, message) {
	if (!condition) throw new Error(message)
}

const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const camel = (name) => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())

export function parseArgs(argv, { flags = [], options = [], repeatable = [] } = {}) {
	const result = {}
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index]
		ensure(token.startsWith('--'), `Unexpected argument: ${token}`)
		const name = token.slice(2)
		if (flags.includes(name)) {
			result[camel(name)] = true
			continue
		}
		ensure(options.includes(name) || repeatable.includes(name), `Unknown option: ${token}`)
		const value = argv[index + 1]
		ensure(value !== undefined && !value.startsWith('--'), `Missing value for ${token}`)
		index += 1
		if (repeatable.includes(name)) (result[camel(name)] ??= []).push(value)
		else {
			ensure(result[camel(name)] === undefined, `Repeated option: ${token}`)
			result[camel(name)] = value
		}
	}
	return result
}

function relativePattern(value) {
	ensure(typeof value === 'string' && value.trim() === value && value.length > 0, 'mutate holds nonempty patterns')
	const parts = value.replaceAll('\\', '/').split('/')
	ensure(!value.startsWith('!'), `mutate takes no negative pattern: ${value}; exclusions are not a way to reach the bar`)
	ensure(!value.startsWith('/') && !/^[A-Za-z]:/.test(value) && !parts.includes('..'), `mutate must stay inside the package: ${value}`)
	ensure(!/:\d/.test(value), `mutate takes files, not line ranges: ${value}`)
	return parts.filter((part) => part && part !== '.').join('/')
}

// `config` is the parsed JSON of one checked-in Stryker config.
export function validateConfig(config, scope) {
	ensure(Object.hasOwn(LIMITS, scope), `Unknown mutation scope: ${scope}`)
	ensure(plainObject(config), 'The Stryker config is a JSON object')
	const unknown = Object.keys(config).filter((key) => !CONFIG_KEYS.includes(key))
	ensure(unknown.length === 0, `Unsupported Stryker option ${unknown.join(', ')}; allowed: ${CONFIG_KEYS.join(', ')}`)
	ensure(config.testRunner === 'vitest', 'testRunner must be "vitest"')
	ensure(Array.isArray(config.mutate) && config.mutate.length > 0, 'mutate lists at least one pattern')
	const mutate = config.mutate.map(relativePattern)
	ensure(new Set(mutate).size === mutate.length, 'mutate lists a pattern twice')
	const vitest = config.vitest ?? {}
	ensure(plainObject(vitest) && Object.keys(vitest).every((key) => VITEST_KEYS.includes(key)), `vitest accepts only ${VITEST_KEYS.join(', ')}`)
	if (config.coverageAnalysis !== undefined) ensure(['perTest', 'all', 'off'].includes(config.coverageAnalysis), 'coverageAnalysis is perTest, all or off')
	for (const key of ['timeoutMS', 'concurrency']) {
		if (config[key] !== undefined) ensure(Number.isInteger(config[key]) && config[key] > 0, `${key} must be a positive integer`)
	}
	return { mutate, vitest, coverageAnalysis: config.coverageAnalysis ?? 'perTest', timeoutMS: config.timeoutMS, concurrency: config.concurrency }
}

// path.matchesGlob arrived in Node 22.5; refuse older runtimes with a message, not a link error.
function matchesGlob(file, pattern) {
	ensure(typeof nodePath.matchesGlob === 'function', `Node 22.5 or later is required (path.matchesGlob); found ${process.versions.node}`)
	return nodePath.matchesGlob(file, pattern)
}

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/
const isProductionSource = (file) => SOURCE.test(file) && !/\.d\.[cm]?ts$/.test(file) && !TEST_FILE.test(file)

export function matchSources(files, patterns) {
	return files.filter((file) => isProductionSource(file) && patterns.some((pattern) => matchesGlob(file, pattern))).sort()
}

// Every production file of a scope's layers, feature-first or layer-first. A checked-in config must
// mutate all of them: a narrower `mutate` buys the score by leaving code out, as an exclusion would.
const SCOPE_LAYERS = {
	core: ['src/*/application/**', 'src/application/**', 'src/*/domain/**', 'src/domain/**'],
	boundary: ['src/*/infrastructure/**', 'src/infrastructure/**', 'src/*/ui/**', 'src/ui/**', 'src/*/api/**', 'src/api/**', 'src/app/**', 'src/shared/**'],
}

export function requiredFiles(files, scope) {
	ensure(Object.hasOwn(SCOPE_LAYERS, scope), `Unknown mutation scope: ${scope}`)
	const other = scope === 'core' ? SCOPE_LAYERS.boundary : SCOPE_LAYERS.core
	return files.filter((file) => isProductionSource(file) && SCOPE_LAYERS[scope].some((pattern) => matchesGlob(file, pattern))
		&& !(scope === 'boundary' && other.some((pattern) => matchesGlob(file, pattern)))).sort()
}

export function scopeGaps(selected, required) {
	const chosen = new Set(selected)
	return required.filter((file) => !chosen.has(file))
}

export function selectChanged(files, changed) {
	const wanted = new Set(changed.map((name) => name.replaceAll('\\', '/')))
	return files.filter((file) => wanted.has(file))
}

// The effective config the gate hands to Stryker: the checked-in options, the selected files,
// a JSON report the gate reads, no incremental reuse and no threshold of Stryker's own.
export function effectiveConfig(config, files, reportFile) {
	ensure(files.length > 0, 'Nothing to mutate')
	return {
		testRunner: 'vitest',
		vitest: config.vitest,
		mutate: files,
		coverageAnalysis: config.coverageAnalysis,
		...(config.timeoutMS ? { timeoutMS: config.timeoutMS } : {}),
		...(config.concurrency ? { concurrency: config.concurrency } : {}),
		reporters: ['json', 'clear-text'],
		jsonReporter: { fileName: reportFile },
		thresholds: { high: 100, low: 0, break: null },
		incremental: false,
		ignoreStatic: false,
		tempDirName: '.stryker-tmp',
		cleanTempDir: true,
	}
}

const DETECTED = new Set(['Killed', 'Timeout'])
const UNDETECTED = new Set(['Survived', 'NoCoverage'])

// `report` is Stryker's mutation-testing-report JSON; `relative` maps its keys onto package paths.
export function mutationVerdict(report, scope, relative = (name) => name) {
	const limit = LIMITS[scope]
	ensure(limit !== undefined, `Unknown mutation scope: ${scope}`)
	ensure(plainObject(report) && plainObject(report.files), 'The Stryker report holds no files')
	const counts = { total: 0, killed: 0, timeout: 0, survived: 0, noCoverage: 0, suppressed: 0, invalid: 0, pending: 0 }
	const survivors = []
	for (const [name, file] of Object.entries(report.files)) {
		for (const mutant of file.mutants ?? []) {
			counts.total += 1
			const at = { file: relative(name), line: mutant.location?.start?.line, mutator: mutant.mutatorName, status: mutant.status }
			if (mutant.status === 'Killed') counts.killed += 1
			else if (mutant.status === 'Timeout') counts.timeout += 1
			else if (mutant.status === 'Survived') { counts.survived += 1; survivors.push(at) }
			else if (mutant.status === 'NoCoverage') { counts.noCoverage += 1; survivors.push(at) }
			else if (mutant.status === 'Ignored') counts.suppressed += 1
			else if (mutant.status === 'Pending') counts.pending += 1
			else counts.invalid += 1
		}
	}
	const detected = counts.killed + counts.timeout
	const tested = detected + counts.survived + counts.noCoverage
	const score = tested === 0 ? null : (100 * detected) / tested
	const problems = []
	if (counts.pending) problems.push(`${counts.pending} mutant(s) never ran`)
	if (counts.invalid) problems.push(`${counts.invalid} mutant(s) ended in a compile or runtime error`)
	if (counts.total > 0 && tested === 0) problems.push('no mutant was tested')
	if (score !== null && score < limit) problems.push(`score ${score.toFixed(2)}% is below ${limit}%`)
	return { ...counts, detected, tested, score, limit, survivors, passed: problems.length === 0, problems }
}

// `// Stryker disable next-line <mutators>: <reason>` is the only suppression: one line, a reason.
export function suppressionProblems(name, text) {
	return text.split(/\r?\n/).flatMap((line, index) => {
		if (!/Stryker\s+(disable|restore)/.test(line)) return []
		const where = `${name}:${index + 1}`
		if (/Stryker\s+restore/.test(line)) return [`${where}: "Stryker restore" belongs to a disabled block; disable one line with "// Stryker disable next-line <mutator>: <reason>"`]
		if (!/Stryker\s+disable\s+next-line\s+[\w,]+\s*:\s*\S.{8,}/.test(line)) return [`${where}: "${line.trim()}" — disable one line only, with a reason: // Stryker disable next-line <mutator>: <why the mutant is equivalent>`]
		return []
	})
}

export function noCoverHits(name, text) {
	return text.split(/\r?\n/).flatMap((line, index) => /\b(v8|c8|istanbul)\s+ignore\b|@vitest\/coverage.*ignore/.test(line) ? [`${name}:${index + 1}: ${line.trim()}`] : [])
}

// A file that only declares types is erased at runtime: coverage has nothing to measure in it.
// Erased forms: interfaces, type aliases, `declare` statements, and imports or exports whose every
// specifier is a type (`import type`, `import { type A }`, `export { type A }`, `export type *`).
const TYPE_ONLY_SPECIFIERS = (list) => list.split(',').map((part) => part.trim()).filter(Boolean).every((part) => /^type\s/.test(part))

export function hasRuntimeCode(text) {
	const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
	// Join each statement onto one logical line so multi-line braces read as one unit.
	const statements = []
	let current = ''
	let depth = 0
	for (const raw of code.split(/\r?\n/)) {
		const line = raw.trim()
		if (!line && depth === 0) continue
		current += (current ? ' ' : '') + line
		depth += (line.match(/[{([]/g) ?? []).length - (line.match(/[})\]]/g) ?? []).length
		if (depth <= 0 && !/[,=(&|]$/.test(line)) {
			statements.push(current)
			current = ''
			depth = 0
		}
	}
	if (current) statements.push(current)
	const erased = (s) => /^(export\s+)?(declare\s+)?(interface|type)\s+[\w$]/.test(s)
		|| /^(export\s+)?declare\s/.test(s)
		|| /^import\s+type\s/.test(s)
		|| /^export\s+type\s*(\{|\*)/.test(s)
		|| (/^(import|export)\s*\{([^}]*)\}\s*(from\s*['"][^'"]+['"])?\s*;?$/.test(s) && TYPE_ONLY_SPECIFIERS(s.match(/\{([^}]*)\}/)[1]))
		|| /^export\s*\{\s*\}\s*;?$/.test(s)
		|| /^[;}]*$/.test(s)
	return statements.some((s) => !erased(s))
}

// `summary` is Vitest's coverage-summary.json (absolute paths); `files` are the core sources.
export function coverageVerdict(summary, files, { relative, excluded = [], typeOnly = [] }) {
	const measured = new Map(Object.entries(summary).filter(([name]) => name !== 'total').map(([name, data]) => [relative(name), data]))
	let total = 0
	let covered = 0
	const missing = []
	const unmeasured = []
	for (const file of files) {
		const data = measured.get(file)
		if (!data) {
			if (!typeOnly.includes(file)) unmeasured.push(file)
			continue
		}
		total += data.lines.total
		covered += data.lines.covered
		if (data.lines.covered < data.lines.total) missing.push(`${file}: ${data.lines.covered}/${data.lines.total} lines`)
	}
	const problems = []
	if (excluded.length) problems.push(`coverage exclusions in the core: ${excluded.join('; ')}`)
	if (total === 0 && unmeasured.length === 0) problems.push('no core line was measured')
	if (missing.length) problems.push(`uncovered lines in ${missing.length} file(s)`)
	if (unmeasured.length) problems.push(`never measured: ${unmeasured.join(', ')}`)
	const percent = total === 0 ? null : (100 * covered) / total
	return { total, covered, percent, missing, unmeasured, passed: problems.length === 0, problems }
}

// Line patterns catch the common spellings; whole-text patterns catch the ones an alias or a
// destructuring would hide (`import { vi as v }`, `const { fn } = vi`, `import * as t from 'vitest'`).
const MOCK_PATTERNS = [
	/\bvi\.(mock|doMock|unmock|fn|spyOn|mocked|hoisted|stubGlobal|stubEnv)\s*\(/,
	/\bjest\.(mock|doMock|fn|spyOn|mocked)\s*\(/,
	/from\s+['"](sinon|ts-sinon|ts-mockito|@typestrong\/ts-mockito|testdouble|vitest-mock-extended|jest-mock-extended|@golevelup\/ts-jest|moq\.ts|msw|msw\/node)['"]/,
	/require\(\s*['"](sinon|ts-mockito|testdouble|msw)['"]\s*\)/,
]
const MOCK_TEXT_PATTERNS = [
	[/import\s*(?:type\s+)?\{[^}]*\bvi\b[^}]*\}\s*from\s*['"]vitest['"]/g, 'imports vi from vitest'],
	[/import\s*\*\s*as\s+\w+\s+from\s*['"]vitest['"]/g, 'imports the whole vitest namespace'],
	[/import\s*\{[^}]*\bjest\b[^}]*\}\s*from\s*['"]@jest\/globals['"]/g, 'imports jest from @jest/globals'],
	[/\b(?:const|let|var)\s*(?:\{[^}]*\}|[\w$]+)\s*=\s*(?:vi|jest)\b(?!\s*\.)/g, 'aliases vi or jest'],
]

const lineOf = (text, index) => text.slice(0, index).split(/\r?\n/).length

export function mockHits(name, text) {
	const lines = text.split(/\r?\n/)
	const hits = new Map()
	lines.forEach((line, index) => { if (MOCK_PATTERNS.some((pattern) => pattern.test(line))) hits.set(index + 1, line.trim()) })
	for (const [pattern, what] of MOCK_TEXT_PATTERNS) {
		for (const match of text.matchAll(pattern)) {
			const line = lineOf(text, match.index)
			if (!hits.has(line)) hits.set(line, `${lines[line - 1].trim()} (${what})`)
		}
	}
	return [...hits].sort(([a], [b]) => a - b).map(([line, text]) => `${name}:${line}: ${text}`)
}

// The rules the architecture gate requires from the project's resolved ESLint config.
export const ARCHITECTURE_RULES = ['boundaries/dependencies', 'boundaries/element-types', 'boundaries/no-unknown-files']
export function architectureRuleProblems(rules) {
	const on = (value) => value === 2 || value === 'error' || (Array.isArray(value) && (value[0] === 2 || value[0] === 'error'))
	const problems = []
	if (!on(rules?.['boundaries/dependencies']) && !on(rules?.['boundaries/element-types'])) problems.push('boundaries/dependencies is not an error rule')
	if (!on(rules?.['boundaries/no-unknown-files'])) problems.push('boundaries/no-unknown-files is not an error rule')
	return problems
}
