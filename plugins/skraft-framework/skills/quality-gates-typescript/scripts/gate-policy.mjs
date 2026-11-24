// Pure rules of the TypeScript quality gates: arguments, the Domain/Application core and mock
// detection. No I/O here; the runners own processes and files. Mutation testing
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
