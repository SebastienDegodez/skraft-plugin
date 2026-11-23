// Pure rules of the TypeScript quality gates: arguments, the Domain/Application core, coverage
// verdicts and mock detection. No I/O here; the runners own processes and files. Mutation testing
// is the developer's (/skraft-mutation): nothing here runs or configures a mutation tool.

export const SOURCE = /\.(ts|tsx|js|jsx|mts|cts)$/

function ensure(condition, message) {
	if (!condition) throw new Error(message)
}

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

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/
const TEST_FOLDERS = ['__tests__', 'tests', 'test', 'e2e']
const isProductionSource = (file) => SOURCE.test(file) && !/\.d\.[cm]?ts$/.test(file) && !TEST_FILE.test(file)

// The core is every production source under a folder whose last word, cut on `.`, `-` and `_`,
// is `domain` or `application`, whatever its case: `src/todos/application`, `src/domain`,
// `src/billing-domain`. Same rule as the .NET adapter's *.Domain / *.Application projects.
const isCoreFolder = (segment) => ['domain', 'application'].includes(segment.split(/[.\-_]/).at(-1).toLowerCase())

export function isCoreFile(file) {
	const parts = file.replaceAll('\\', '/').split('/').filter(Boolean)
	const name = parts.pop()
	if (!name || !isProductionSource(name)) return false
	if (parts.some((part) => TEST_FOLDERS.includes(part.toLowerCase()))) return false
	return parts.some(isCoreFolder)
}

export const coreSourceFiles = (files) => [...new Set(files.map((file) => file.replaceAll('\\', '/')).filter(isCoreFile))].sort()

// The folders coverage measures: each core file's path up to its first core folder.
export function coreRoots(files) {
	const roots = coreSourceFiles(files).map((file) => {
		const parts = file.split('/')
		return parts.slice(0, parts.findIndex(isCoreFolder) + 1).join('/')
	})
	return [...new Set(roots)].sort()
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
