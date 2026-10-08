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
       [--core-mutate <glob> ... --boundary-mutate <glob> ...] [--force] [--help]

Canonical mode discovers one solution and requires canonical .Domain, .Application,
.API, and .Infrastructure projects. BFF/non-standard mode requires explicit inclusive
globs for BOTH scopes. Existing differing configs are preserved unless --force is used.`

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

function requireLayer(root, suffix) {
	if (!existsSync(join(root, 'src'))) throw usageError('canonical mutation config requires src/; use explicit --core-mutate and --boundary-mutate for a BFF')
	let count = 0
	walk(join(root, 'src'), Infinity, (path, name) => {
		if (name.endsWith(`.${suffix}.csproj`) && basename(name, '.csproj') === basename(dirname(path))) count += 1
	})
	if (count === 0) throw usageError(`canonical mutation config requires a .${suffix} project; use explicit globs for a BFF`)
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
	writeFileSync(path, `${JSON.stringify(prune(JSON.parse(readFileSync(path, 'utf8'))), null, 2)}\n`)
	return true
}

function install(target, temp, force) {
	if (existsSync(target) && readFileSync(target).equals(readFileSync(temp))) {
		rmSync(temp)
		process.stdout.write(`unchanged ${target}\n`)
	} else if (existsSync(target) && !force) {
		rmSync(temp)
		throw usageError(`refusing to overwrite customized config: ${target}. Re-run with --force after reviewing the diff`)
	} else {
		renameSync(temp, target)
		process.stdout.write(`wrote ${target}\n`)
	}
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

	let core = input['core-mutate']
	let boundary = input['boundary-mutate']
	if (core.length === 0 && boundary.length === 0) {
		for (const layer of ['Domain', 'Application', 'API', 'Infrastructure']) requireLayer(root, layer)
		core = ['**/*.Domain/**/*.cs', '**/*.Application/**/*.cs']
		boundary = ['**/*.API/**/*.cs', '**/*.Infrastructure/**/*.cs']
	} else if (core.length === 0 || boundary.length === 0) {
		throw usageError('non-standard mode requires at least one --core-mutate and one --boundary-mutate glob')
	}

	requireDotnetStryker()
	const temp = mkdtempSync(join(root, '.stryker-config.'))
	try {
		const solutionArg = solutionRelative.split(sep).join('/')
		if (!initConfig({ root, path: join(temp, CORE_CONFIG), solution: solutionArg, expected: CORE_EXPECTED, patterns: [...core, ...EXCLUSIONS] })) {
			throw usageError('dotnet stryker init failed for core config')
		}
		if (!initConfig({ root, path: join(temp, BOUNDARY_CONFIG), solution: solutionArg, expected: BOUNDARY_EXPECTED, patterns: [...boundary, ...EXCLUSIONS] })) {
			throw usageError('dotnet stryker init failed for boundary config')
		}
		install(join(root, CORE_CONFIG), join(temp, CORE_CONFIG), input.flags.has('force'))
		install(join(root, BOUNDARY_CONFIG), join(temp, BOUNDARY_CONFIG), input.flags.has('force'))
	} finally {
		rmSync(temp, { recursive: true, force: true })
	}
	return 0
}

export { Exit }

if (isEntry(import.meta.url)) await main(() => configureMutation(process.argv.slice(2)))
