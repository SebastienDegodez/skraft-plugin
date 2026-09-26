const limits = { core: 100, boundary: 80 }
const configKeys = ['$schema', 'testRunner', 'tap', 'mutate', 'thresholds', 'reporters',
	'coverageAnalysis', 'concurrency', 'timeoutMS', 'timeoutFactor', 'dryRunTimeoutMinutes',
	'maxTestRunnerReuse', 'disableBail', 'logLevel']
const nodeArgs = ['--test-reporter=tap', '--test-reporter-destination=stdout']
const immutable = new Set(['testRunner', 'thresholds', 'reporters', 'mutate', 'tap.testFiles', 'tap.nodeArgs'])

function requireValue(condition, message) {
	if (!condition) throw new Error(message)
}

function object(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function keys(value, allowed) {
	requireValue(object(value), 'Expected an options object')
	requireValue(Object.keys(value).every((key) => allowed.includes(key)), 'Unsupported option; exclusions and overrides are not allowed')
}

function patterns(values) {
	requireValue(Array.isArray(values) && values.length > 0, 'Explicit nonempty source/test patterns required')
	for (const value of values) {
		requireValue(typeof value === 'string' && value.trim().length > 0, 'Empty pattern')
		requireValue(!/[!:\\\x00]/.test(value) && !value.startsWith('/') && !value.split('/').includes('..'), 'Only positive root-relative whole-file patterns supported')
	}
}

function thresholds(value, expected) {
	keys(value, ['high', 'low', 'break'])
	requireValue(['high', 'low', 'break'].every((key) => value[key] === expected), `Thresholds must all equal ${expected}`)
}

function sameValue(left, right) {
	if (Array.isArray(left) || Array.isArray(right)) return JSON.stringify(left) === JSON.stringify(right)
	if (object(left) && object(right)) return JSON.stringify(left) === JSON.stringify(right)
	return left === right
}

function merge(base, overlay, path = '') {
	requireValue(object(overlay), `Overlay ${path || '<root>'} must be an options object`)
	const result = structuredClone(base)
	for (const [key, value] of Object.entries(overlay)) {
		const currentPath = path ? `${path}.${key}` : key
		requireValue(!['__proto__', 'constructor', 'prototype'].includes(key), `Unsafe overlay key: ${currentPath}`)
		if (immutable.has(currentPath)) requireValue(sameValue(result[key], value), `Overlay cannot change protected option: ${currentPath}`)
		else if (object(result[key]) && object(value)) result[key] = merge(result[key], value, currentPath)
		else result[key] = structuredClone(value)
	}
	return result
}

export function applyOverlays(config, overlays = []) {
	return overlays.reduce((value, overlay) => merge(value, overlay), structuredClone(config))
}

export function validateConfig(config, scope) {
	requireValue(Object.hasOwn(limits, scope), 'Unknown mutation scope')
	keys(config, configKeys)
	requireValue(config.testRunner === 'tap', 'Unsupported runner: only TAP is supported')
	thresholds(config.thresholds, limits[scope])
	patterns(config.mutate)
	keys(config.tap, ['testFiles', 'nodeArgs', 'forceBail'])
	patterns(config.tap.testFiles)
	if (config.tap.nodeArgs !== undefined) {
		requireValue(Array.isArray(config.tap.nodeArgs) && config.tap.nodeArgs.every((arg) => nodeArgs.includes(arg)), 'Unsupported TAP nodeArgs')
	}
	if (config.tap.forceBail !== undefined) requireValue(typeof config.tap.forceBail === 'boolean', 'Invalid forceBail')
	requireValue(Array.isArray(config.reporters) && config.reporters.includes('json') &&
		config.reporters.every((reporter) => ['json', 'clear-text', 'progress'].includes(reporter)), 'Use json and local text reporters only')
	if (config.coverageAnalysis !== undefined) requireValue(['perTest', 'all', 'off'].includes(config.coverageAnalysis), 'Invalid coverageAnalysis')
	for (const key of ['concurrency', 'timeoutMS', 'timeoutFactor', 'dryRunTimeoutMinutes', 'maxTestRunnerReuse']) {
		if (config[key] !== undefined) requireValue(Number.isFinite(config[key]) && config[key] > 0, `Invalid ${key}`)
	}
	if (config.disableBail !== undefined) requireValue(typeof config.disableBail === 'boolean', 'Invalid disableBail')
	if (config.logLevel !== undefined) requireValue(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'off'].includes(config.logLevel), 'Invalid logLevel')
	return limits[scope]
}

export function effectiveOptions(config, files, reportPath, tapPath) {
	const { $schema, ...options } = structuredClone(config)
	return {
		...options, mutate: files, plugins: [tapPath],
		jsonReporter: { fileName: reportPath },
		incremental: false, ignoreStatic: false, allowEmpty: false,
		dryRunOnly: false, inPlace: false, cleanTempDir: true,
		ignorePatterns: [], appendPlugins: [], ignorers: [], checkers: [],
		mutator: { excludedMutations: [] },
	}
}

function same(actual, expected) {
	if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((value, i) => same(actual[i], value))
	if (object(expected)) return object(actual) && Object.keys(expected).every((key) => same(actual[key], expected[key]))
	return actual === expected
}

function position(value) {
	return object(value) && Number.isInteger(value.line) && value.line > 0 && Number.isInteger(value.column) && value.column > 0
}

function checkMutant(mutant, ids) {
	requireValue(object(mutant), 'Malformed mutant')
	requireValue(typeof mutant.id === 'string' && mutant.id.length > 0 && !ids.has(mutant.id), 'Missing/duplicate mutant id')
	ids.add(mutant.id)
	requireValue(typeof mutant.mutatorName === 'string' && mutant.mutatorName.length > 0 && typeof mutant.replacement === 'string', 'Malformed mutant operator')
	requireValue(position(mutant.location?.start) && position(mutant.location?.end), 'Malformed mutant location')
	const { start, end } = mutant.location
	requireValue(end.line > start.line || (end.line === start.line && end.column >= start.column), 'Reversed mutant location')
	requireValue(['Killed', 'Timeout', 'Survived', 'NoCoverage'].includes(mutant.status), `Unsupported mutant status: ${mutant.status}`)
}

function fileMutants(file, source, ids) {
	requireValue(object(file) && file.source === source && file.language === 'javascript', 'Unexpected report source or language')
	requireValue(Array.isArray(file.mutants) && file.mutants.length > 0, 'Missing/empty mutants for scoped source')
	for (const mutant of file.mutants) checkMutant(mutant, ids)
	return file.mutants
}

export function validateReport(report, { root, options, sources }) {
	requireValue(object(report) && report.schemaVersion === '1.0', 'Unexpected report schema')
	requireValue(report.projectRoot === root && report.framework?.name === 'StrykerJS' && report.framework?.version === '9.6.1', 'Unexpected report producer/root')
	requireValue(same(report.config, options), 'Report does not match fresh effective config')
	thresholds(report.thresholds, options.thresholds.break)
	requireValue(object(report.files) && Object.keys(report.files).length === Object.keys(sources).length &&
		Object.keys(report.files).every((file) => Object.hasOwn(sources, file)), 'Unexpected/missing report files')
	const ids = new Set()
	const mutants = Object.entries(sources).flatMap(([name, source]) => fileMutants(report.files[name], source, ids))
	requireValue(mutants.length > 0, 'Empty mutation report')
	const count = (status) => mutants.filter((mutant) => mutant.status === status).length
	const killed = count('Killed')
	const timeout = count('Timeout')
	const score = 100 * (killed + timeout) / mutants.length
	return { total: mutants.length, killed, timeout, survived: count('Survived'), noCoverage: count('NoCoverage'), score, passed: score >= options.thresholds.break }
}

export function parseArgs(args) {
	const values = { coreOnly: false }
	const seen = new Set()
	for (let index = 0; index < args.length; index++) {
		const flag = args[index]
		requireValue(flag === '--overlay' || !seen.has(flag), `Duplicate argument ${flag}`)
		seen.add(flag)
		if (flag === '--core-only') {
			values.coreOnly = true
			continue
		}
		if (flag === '--overlay') {
			const value = args[++index]
			requireValue(typeof value === 'string' && value.length > 0 && !value.startsWith('--'), 'Missing value for --overlay')
			values.overlays ??= []
			values.overlays.push(value)
			continue
		}
		requireValue(['--root', '--package', '--core', '--boundary', '--evidence', '--since'].includes(flag), `Unknown argument ${flag}`)
		const value = args[++index]
		requireValue(typeof value === 'string' && value.length > 0 && !value.startsWith('--'), `Missing value for ${flag}`)
		values[flag.slice(2)] = value
	}
	for (const name of ['root', 'package', 'core', 'evidence']) requireValue(values[name], `Missing --${name}`)
	requireValue(values.coreOnly || values.boundary, 'Missing --boundary')
	return values
}