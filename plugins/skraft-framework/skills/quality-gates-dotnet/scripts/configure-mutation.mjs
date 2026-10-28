#!/usr/bin/env node
// configure-mutation.mjs -- scaffold durable root Stryker configs for local and CI use.
// Exit: 0 written/unchanged | 2 usage/discovery/conflict error | 3 toolchain missing
import { mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { Exit, absoluteDir, dotnet, existsSync, fromRoot, isEntry, main, parseArguments, requireDotnetStryker, usageError } from './dotnet-toolchain.mjs'

const CORE_EXPECTED = 100
const BOUNDARY_EXPECTED = 80
const CORE_CONFIG = 'stryker-config-core.json'
const BOUNDARY_CONFIG = 'stryker-config-boundary.json'
const EXCLUSIONS = ['!**/*Marker.cs', '!**/DependencyInjection.cs', '!**/Program.cs', '!**/obj/**']

const USAGE = `Usage: configure-mutation.mjs --root <dir> [--solution <sln|slnx>]
       [--core-mutate <glob> ... [--boundary-mutate <glob> ...]] [--force] [--help]

Canonical mode discovers one solution and requires canonical .Domain and .Application
projects; the boundary config covers the .Api and .Infrastructure projects present (any case) and is
not written when there are none. BFF/non-standard mode requires explicit inclusive core
globs; boundary globs are optional. Existing differing configs are preserved unless --force
is used.`

const byteOrder = (left, right) => (left < right ? -1 : left > right ? 1 : 0)

function walk(dir, depth, visit) {
	let entries
	try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
	for (const entry of entries) {
		const path = join(dir, entry.name)
		if (entry.isDirectory()) { if (depth > 0) walk(path, depth - 1, visit) } else visit(path, entry.name)
	}
}

function findSolution(root) {
	const matches = []
	walk(root, 1, (path, name) => { if (/\.(sln|slnx)$/.test(name)) matches.push(path) })
	matches.sort(byteOrder)
	if (matches.length !== 1) throw usageError(`expected exactly one .sln or .slnx below repository root; found ${matches.length}. Pass --solution explicitly`)
	return matches[0]
}

// How the solution spells a layer's project suffix (`Api`, `API`): matched without regard to
// case, each spelling kept as written for the mutate glob.
function layerSpellings(root, layer) {
	const spellings = new Set()
	walk(join(root, 'src'), Infinity, (path, name) => {
		const project = basename(name, '.csproj')
		const suffix = project.slice(project.lastIndexOf('.') + 1)
		if (name.endsWith('.csproj') && project.includes('.') && project === basename(dirname(path)) && suffix.toLowerCase() === layer.toLowerCase()) spellings.add(suffix)
	})
	return [...spellings].sort(byteOrder)
}

// The core layers are required; the boundary keeps the layers the solution has, possibly none.
function canonicalGlobs(root) {
	if (!existsSync(join(root, 'src'))) throw usageError('canonical mutation config requires src/; use explicit --core-mutate (and --boundary-mutate if any) for a BFF')
	for (const layer of ['Domain', 'Application']) {
		if (layerSpellings(root, layer).length === 0) throw usageError(`canonical mutation config requires a .${layer} project; use explicit globs for a BFF`)
	}
	const globs = (layers) => layers.flatMap((layer) => layerSpellings(root, layer)).map((suffix) => `**/*.${suffix}/**/*.cs`)
	return { core: globs(['Domain', 'Application']), boundary: globs(['Api', 'Infrastructure']) }
}

// Stryker.NET 4.14 init writes "" and null for unset options, then rejects its own
// output at run time ("Project file cannot be empty."): drop them so defaults apply.
function prune(object) {
	for (const [key, value] of Object.entries(object)) {
		if (value === '' || value === null) delete object[key]
		else if (typeof value === 'object' && !Array.isArray(value)) {
			prune(value)
			if (Object.keys(value).length === 0) delete object[key]
		}
	}
	return object
}

function initConfig({ root, path, solution, expected, patterns }) {
	const args = ['stryker', 'init', '--config-file', path, '--solution', solution,
		'--threshold-high', String(expected), '--threshold-low', String(expected), '--break-at', String(expected),
		'--reporter', 'json', '--reporter', 'cleartext', '--break-on-initial-test-failure',
		...patterns.flatMap((pattern) => ['--mutate', pattern])]
	if (dotnet(args, { cwd: root, output: 'ignore' }).status !== 0 || !existsSync(path)) return false
	const config = prune(JSON.parse(readFileSync(path, 'utf8')))
	// init writes the core count of the machine that ran it; every machine keeps Stryker's own default.
	delete config['stryker-config']?.concurrency
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`)
	return true
}

// Every config is judged before the first install: a refused config leaves every target untouched.
function judge({ target, temp }, force) {
	if (!existsSync(target)) return 'wrote'
	if (readFileSync(target).equals(readFileSync(temp))) return 'unchanged'
	if (!force) throw usageError(`refusing to overwrite customized config: ${target}. Re-run with --force after reviewing the diff`)
	return 'wrote'
}

function install(configs, force) {
	const verdicts = configs.map((config) => judge(config, force))
	configs.forEach(({ target, temp }, index) => {
		if (verdicts[index] === 'wrote') renameSync(temp, target)
		process.stdout.write(`${verdicts[index]} ${target}\n`)
	})
}

export function configureMutation(argv) {
	const input = parseArguments(argv, {
		values: ['root', 'solution'], repeated: ['core-mutate', 'boundary-mutate'], flags: ['force'],
		refuse: { '--expected': 'refusing --expected: the bar is not a runtime argument' }, usage: USAGE,
	})
	if (!input.root) throw usageError('--root is required')
	const root = absoluteDir(input.root)
	if (!root) throw usageError(`repository root not found: ${input.root}`)

	let solution
	if (!input.solution) solution = findSolution(root)
	else {
		solution = fromRoot(root, input.solution)
		if (!existsSync(solution) || !statSync(solution).isFile()) throw usageError(`solution not found: ${solution}`)
		solution = join(absoluteDir(dirname(solution)), basename(solution))
	}
	const solutionRelative = relative(root, solution)
	if (solutionRelative.startsWith('..') || solutionRelative === '') throw usageError(`solution must be inside repository root: ${solution}`)

	const explicit = input['core-mutate'].length > 0 || input['boundary-mutate'].length > 0
	const { core, boundary } = explicit ? { core: input['core-mutate'], boundary: input['boundary-mutate'] } : canonicalGlobs(root)
	if (core.length === 0) throw usageError('non-standard mode requires at least one --core-mutate glob')

	requireDotnetStryker()
	const temp = mkdtempSync(join(root, '.stryker-config.'))
	try {
		const solutionArg = solutionRelative.split(sep).join('/')
		const scopes = [
			{ name: 'core', file: CORE_CONFIG, expected: CORE_EXPECTED, patterns: core },
			{ name: 'boundary', file: BOUNDARY_CONFIG, expected: BOUNDARY_EXPECTED, patterns: boundary },
		].filter(({ patterns }) => patterns.length > 0)
		for (const { name, file, expected, patterns } of scopes) {
			if (!initConfig({ root, path: join(temp, file), solution: solutionArg, expected, patterns: [...patterns, ...EXCLUSIONS] })) {
				throw usageError(`dotnet stryker init failed for ${name} config`)
			}
		}
		install(scopes.map(({ file }) => ({ target: join(root, file), temp: join(temp, file) })), input.flags.has('force'))
		if (boundary.length === 0) process.stdout.write(`no boundary layer: ${BOUNDARY_CONFIG} not written\n`)
	} finally {
		rmSync(temp, { recursive: true, force: true })
	}
	return 0
}

export { Exit }

if (isEntry(import.meta.url)) await main(() => configureMutation(process.argv.slice(2)))
