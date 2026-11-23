// Pure rules of the Python quality gates: arguments, the Domain/Application core, coverage
// verdicts, mock detection. No I/O here; the runners own processes and files. Mutation testing
// is the developer's (/skraft-mutation): nothing here runs or configures a mutation tool.

function ensure(condition, message) {
	if (!condition) throw new Error(message)
}

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

// The core is every source under a folder whose last word, cut on `.`, `-` and `_`, is `domain`
// or `application`, whatever its case: `src/shop/domain`, `billing_domain`, `Checkout.Application`.
// Same rule as the .NET adapter's *.Domain / *.Application projects. Test files never count.
const CORE_WORDS = ['domain', 'application']
const TEST_FOLDERS = ['tests', 'test']
const isCoreFolder = (segment) => CORE_WORDS.includes(segment.split(/[.\-_]/).at(-1).toLowerCase())
const isTestFile = (name) => /^test_.*\.py$|_test\.py$|^conftest\.py$/.test(name)

export function isCoreFile(file) {
	const parts = file.replaceAll('\\', '/').split('/').filter(Boolean)
	const name = parts.pop()
	if (!name?.endsWith('.py') || isTestFile(name)) return false
	if (parts.some((part) => TEST_FOLDERS.includes(part.toLowerCase()))) return false
	return parts.some(isCoreFolder)
}

export const coreSourceFiles = (files) => [...new Set(files.map((file) => file.replaceAll('\\', '/')).filter(isCoreFile))].sort()

// The folders coverage measures from: each core file's path up to its first core folder.
export function coreRoots(files) {
	const roots = coreSourceFiles(files).map((file) => {
		const parts = file.split('/')
		return parts.slice(0, parts.findIndex(isCoreFolder) + 1).join('/')
	})
	return [...new Set(roots)].sort()
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

const MOCK_PATTERNS = [
	/\bunittest\.mock\b/, /\bfrom\s+unittest\s+import\s+mock\b/, /^\s*import\s+mock\b/, /^\s*from\s+mock\s+import\b/,
	/\bpytest_mock\b/, /\bmocker\b/, /\b(Magic|Async|NonCallable)?Mock\s*\(/, /\bcreate_autospec\b/, /@patch\b|\bpatch(\.object)?\s*\(/,
	/\bflexmock\b/, /\bdoublex\b/, /\bmockito\b/,
]

export function mockHits(name, text) {
	return text.split(/\r?\n/).flatMap((line, index) => MOCK_PATTERNS.some((pattern) => pattern.test(line)) ? [`${name}:${index + 1}: ${line.trim()}`] : [])
}
