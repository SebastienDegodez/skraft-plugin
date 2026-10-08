// Pure rules of the Python quality gates: arguments, cosmic-ray configs, mutation and
// coverage verdicts, mock detection. No I/O here; the runners own processes and files.

export const LIMITS = Object.freeze({ core: 100, boundary: 80 })
export const COSMIC_RAY_MAJOR = 8

const CONFIG_KEYS = ['module-path', 'timeout', 'excluded-modules', 'test-command', 'distributor']

function ensure(condition, message) {
	if (!condition) throw new Error(message)
}

const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

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

const camel = (name) => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())

function relativePath(value, what) {
	ensure(typeof value === 'string' && value.trim() === value && value.length > 0, `${what} must be a nonempty path`)
	const parts = value.replaceAll('\\', '/').split('/')
	ensure(!value.startsWith('/') && !/^[A-Za-z]:/.test(value) && !parts.includes('..'), `${what} must stay inside the repository: ${value}`)
	ensure(!/[*?[\]!]/.test(value), `${what} takes paths, not patterns: ${value}`)
	return parts.filter((part) => part && part !== '.').join('/')
}

// `config` is the parsed TOML document of one checked-in cosmic-ray config.
export function validateConfig(config, scope) {
	ensure(Object.hasOwn(LIMITS, scope), `Unknown mutation scope: ${scope}`)
	ensure(plainObject(config) && Object.keys(config).length === 1 && plainObject(config['cosmic-ray']), 'The config holds one [cosmic-ray] table and nothing else')
	const table = config['cosmic-ray']
	ensure(Object.keys(table).every((key) => CONFIG_KEYS.includes(key)), `Unsupported cosmic-ray key; allowed: ${CONFIG_KEYS.join(', ')}`)
	const modulePaths = Array.isArray(table['module-path']) ? table['module-path'] : [table['module-path']]
	ensure(modulePaths.length > 0 && modulePaths[0] !== undefined, 'module-path is required')
	const normalized = modulePaths.map((path) => relativePath(path, 'module-path'))
	ensure(new Set(normalized).size === normalized.length, 'module-path lists a path twice')
	ensure(typeof table.timeout === 'number' && Number.isFinite(table.timeout) && table.timeout > 0, 'timeout must be a positive number of seconds')
	const excluded = table['excluded-modules'] ?? []
	ensure(Array.isArray(excluded) && excluded.length === 0, 'excluded-modules must be empty: exclusions are not a way to reach the bar')
	ensure(typeof table['test-command'] === 'string' && table['test-command'].trim().length > 0, 'test-command is required')
	ensure(plainObject(table.distributor) && Object.keys(table.distributor).length === 1 && table.distributor.name === 'local', 'distributor must be exactly { name = "local" }')
	return { modulePaths: normalized, timeout: table.timeout, testCommand: table['test-command'] }
}

const tomlString = (value) => JSON.stringify(value)

export function renderConfig({ modulePaths, timeout, testCommand }) {
	ensure(modulePaths.length > 0, 'Nothing to mutate')
	return [
		'[cosmic-ray]',
		`module-path = [${modulePaths.map(tomlString).join(', ')}]`,
		`timeout = ${Number(timeout).toFixed(1)}`,
		'excluded-modules = []',
		`test-command = ${tomlString(testCommand)}`,
		'',
		'[cosmic-ray.distributor]',
		'name = "local"',
		'',
	].join('\n')
}

export function selectChanged(files, changed) {
	const wanted = new Set(changed.map((name) => name.replaceAll('\\', '/')))
	return files.filter((file) => wanted.has(file))
}

// `lines` are the JSON lines of `cosmic-ray dump`: [workItem, result | null].
export function mutationVerdict(lines, scope) {
	const limit = LIMITS[scope]
	ensure(limit !== undefined, `Unknown mutation scope: ${scope}`)
	const counts = { total: 0, killed: 0, survived: 0, incompetent: 0, pending: 0, errored: 0, suppressed: 0 }
	const survivors = []
	for (const line of lines) {
		if (!line.trim()) continue
		const [item, result] = JSON.parse(line)
		counts.total += 1
		if (result === null) { counts.pending += 1; continue }
		if (result.worker_outcome === 'skipped') { counts.suppressed += 1; continue }
		if (result.worker_outcome !== 'normal') { counts.errored += 1; continue }
		if (result.test_outcome === 'killed') counts.killed += 1
		else if (result.test_outcome === 'incompetent') counts.incompetent += 1
		else if (result.test_outcome === 'survived') {
			counts.survived += 1
			const mutation = item.mutations?.[0] ?? {}
			survivors.push({ module: mutation.module_path, line: mutation.start_pos?.[0], operator: mutation.operator_name, occurrence: mutation.occurrence })
		} else counts.errored += 1
	}
	const tested = counts.killed + counts.survived
	const score = tested === 0 ? null : (100 * counts.killed) / tested
	const problems = []
	if (counts.pending) problems.push(`${counts.pending} mutant(s) never ran`)
	if (counts.errored) problems.push(`${counts.errored} mutant(s) ended in a worker error`)
	if (counts.total > 0 && tested === 0) problems.push('no mutant was tested')
	if (score !== null && score < limit) problems.push(`score ${score.toFixed(2)}% is below ${limit}%`)
	return { ...counts, tested, score, limit, survivors, passed: problems.length === 0, problems }
}

// `report` is the JSON written by `coverage json`; `files` restricts it to the core sources.
export function noCoverHits(name, text) {
	return text.split(/\r?\n/).flatMap((line, index) => /#\s*pragma:?\s*no\s*(cover|branch)/i.test(line) ? [`${name}:${index + 1}: ${line.trim()}`] : [])
}

export function coverageVerdict(report, files, excluded = []) {
	const wanted = new Set(files)
	const measured = Object.entries(report.files ?? {}).filter(([name]) => wanted.has(name.replaceAll('\\', '/')))
	const statements = measured.reduce((sum, [, data]) => sum + data.summary.num_statements, 0)
	const covered = measured.reduce((sum, [, data]) => sum + data.summary.covered_lines, 0)
	const missing = measured.filter(([, data]) => data.summary.missing_lines > 0)
		.map(([name, data]) => `${name.replaceAll('\\', '/')}: ${data.missing_lines.join(', ')}`)
	const unmeasured = files.filter((file) => !measured.some(([name]) => name.replaceAll('\\', '/') === file))
	const problems = []
	if (excluded.length) problems.push(`coverage exclusions in Domain/Application: ${excluded.join('; ')}`)
	if (statements === 0) problems.push('no Domain or Application statement was measured')
	if (missing.length) problems.push(`uncovered lines in ${missing.length} file(s)`)
	if (unmeasured.length) problems.push(`never imported: ${unmeasured.join(', ')}`)
	const percent = statements === 0 ? null : (100 * covered) / statements
	return { statements, covered, percent, missing, unmeasured, passed: problems.length === 0, problems }
}

// `# pragma: no mutate` is the only suppression: one line, and a reason after it.
export function pragmaProblems(name, text) {
	return text.split(/\r?\n/).flatMap((line, index) => {
		if (!/#.*pragma:.*no mutate/.test(line)) return []
		return /#\s*pragma:\s*no mutate\s*(--|:|-)\s*\S.{8,}/.test(line) ? [] : [`${name}:${index + 1}: "# pragma: no mutate" needs a reason: # pragma: no mutate -- <why the mutant is equivalent>`]
	})
}

const MOCK_PATTERNS = [
	/\bunittest\.mock\b/, /\bfrom\s+unittest\s+import\s+mock\b/, /^\s*import\s+mock\b/, /^\s*from\s+mock\s+import\b/,
	/\bpytest_mock\b/, /\bmocker\b/, /\b(Magic|Async|NonCallable)?Mock\s*\(/, /\bcreate_autospec\b/, /@patch\b|\bpatch(\.object)?\s*\(/,
	/\bflexmock\b/, /\bdoublex\b/, /\bmockito\b/,
]

export function mockHits(name, text) {
	return text.split(/\r?\n/).flatMap((line, index) => MOCK_PATTERNS.some((pattern) => pattern.test(line)) ? [`${name}:${index + 1}: ${line.trim()}`] : [])
}
