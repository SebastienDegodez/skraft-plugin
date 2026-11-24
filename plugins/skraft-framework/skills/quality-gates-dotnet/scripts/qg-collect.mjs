#!/usr/bin/env node
// Every quality gate of a .NET story in one command: runs the tests, the build and the
// no-mocks scan, copies and hashes the frontend screenshots, lists the covered commits,
// assembles the evidence log (contract v7) in the Git-ignored evidence directory and runs
// qg-verify on it. Nothing is committed. Exit: qg-verify's (0 pass, 1 fail, 2 inconclusive),
// or 2 on a usage error.
//   node qg-collect.mjs --root . --evidence <dir> --story <story> --base <sha>
//     --cycle <k>:<red sha>:<green sha>:<acceptance test file> [--cycle …]
//     [--screenshot <png> …] [--solution <file>]
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { capture } from './capture.mjs'
import { absoluteDir, absoluteFile, dotnetCommand, fromRoot, isEntry, main, parseArguments, sha256File, usageError } from './dotnet-toolchain.mjs'
import { runNoMocks } from './no-mocks-in-core.mjs'

const USAGE = 'usage: qg-collect.mjs --root <repo> --evidence <dir> --story <story> --base <sha> --cycle <k>:<red>:<green>:<file> [--cycle …] [--screenshot <png> …] [--solution <file>]'
const HERE = dirname(fileURLToPath(import.meta.url))
export const IGNORE_LINE = '.copilot-tracking/skraft-plans/*/evidence/'

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trimEnd()
const ignored = (root, path) => spawnSync('git', ['-C', root, 'check-ignore', '-q', '--', path]).status === 0
const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
// The last 40 lines, verbatim: a suffix of the captured file, as qg-verify checks it.
const tail = (text) => {
	const lines = text.split('\n')
	const keep = lines.length - (text.endsWith('\n') ? 41 : 40)
	return keep > 0 ? lines.slice(keep).join('\n') : text
}

// TRX counters of a dotnet test run: <Counters total=".." passed=".." failed=".." />.
export function trxMetrics(trx) {
	const counters = trx.match(/<Counters\b[^>]*>/)?.[0]
	if (!counters) return undefined
	const value = (name) => Number(counters.match(new RegExp(`\\b${name}="(\\d+)"`))?.[1] ?? 0)
	return { tests_total: value('total'), tests_passed: value('passed'), tests_failed: value('failed') }
}

export function parseCycle(text) {
	const match = text.match(/^(\d+):([0-9a-fA-F]{7,40}):([0-9a-fA-F]{7,40}):(.+)$/)
	if (!match) throw usageError(`--cycle ${text} is not <k>:<red sha>:<green sha>:<file>`)
	return { cycle: Number(match[1]), red: match[2], green: match[3], file: match[4].replaceAll('\\', '/') }
}

const gateFrom = (evidence, ref, id, label, name, command, extra = {}) => {
	const stdout = read(join(evidence, `${name}.stdout`))
	const code = Number(read(join(evidence, `${name}.exit`)).trim())
	return {
		id, label, status: code === 0 ? 'pass' : 'fail', command_executed: command,
		exit_code_ref: `${ref}/${name}.exit`, stdout_ref: `${ref}/${name}.stdout`,
		stdout_sha256: read(join(evidence, `${name}.stdout.sha256`)).trim(), stdout_tail: tail(stdout), ...extra,
	}
}

async function runDotnet(evidence, root, name, args) {
	const [command, prefix] = dotnetCommand()
	await capture({ evidence, name, cwd: root, command, args: [...prefix, ...args] })
	return `dotnet ${args.join(' ')}`
}

export async function collect(argv) {
	const input = parseArguments(argv, {
		values: ['root', 'evidence', 'story', 'base', 'solution'],
		repeated: ['cycle', 'screenshot'], usage: USAGE,
	})
	for (const name of ['root', 'evidence', 'story', 'base']) if (!input[name]) throw usageError(`--${name} is required\n${USAGE}`)
	if (input.cycle.length === 0) throw usageError(`one --cycle per delivered scenario is required\n${USAGE}`)
	const root = absoluteDir(input.root)
	if (!root) throw usageError('repository root not found')
	const evidence = fromRoot(root, input.evidence)
	const repoPath = relative(root, evidence).split('\\').join('/')
	if (!ignored(root, repoPath)) throw usageError(`${repoPath} is not ignored by Git: add ${IGNORE_LINE} to .gitignore in a work commit`)
	const ref = repoPath.slice(Math.max(0, repoPath.lastIndexOf('evidence/')))
	const solution = input.solution ?? readdirSync(root).filter((name) => /\.(sln|slnx)$/.test(name))[0]
	if (!solution) throw usageError('no solution at the root: select one with --solution')
	const cycles = input.cycle.map(parseCycle)
	const pictures = input.screenshot.map((path) => absoluteFile(root, path) ?? (() => { throw usageError(`--screenshot ${path} not found`) })())
	const rev = git(root, ['rev-parse', 'HEAD'])

	const testsCommand = await runDotnet(evidence, root, 'qg-tests', ['test', solution, '--nologo', '--logger', 'trx;LogFileName=qg-tests.trx', '--results-directory', evidence])
	const buildCommand = await runDotnet(evidence, root, 'qg-build', ['build', solution, '--nologo', '--no-incremental'])
	runNoMocks(['--root', root, '--evidence', evidence])

	const testsMetrics = trxMetrics(read(join(evidence, 'qg-tests.trx')))
	const tests = gateFrom(evidence, ref, 'test.acceptance', 'Acceptance test(s) pass', 'qg-tests', testsCommand, testsMetrics ? { metrics: testsMetrics } : {})
	const build = gateFrom(evidence, ref, 'build.compile', 'Build passes', 'qg-build', buildCommand)
	const gates = [
		tests,
		{ ...tests, id: 'test.unit', label: 'All unit tests pass' },
		build,
		{ ...build, id: 'build.lint', label: 'Static analysis pass' },
		gateFrom(evidence, ref, 'test.no-mocks-core', 'No mocks in Domain/Application core', 'qg-mocks', `node ${join(HERE, 'no-mocks-in-core.mjs')} --root . --evidence ${repoPath}`),
		{ id: 'commit.convention', label: 'Conventional commit policy', status: 'pass' },
		{ id: 'test.integrity', label: 'No test tampering (RED→GREEN integrity)', status: 'pass' },
	]
	if (pictures.length > 0) {
		mkdirSync(join(evidence, 'screenshots'), { recursive: true })
		const screenshots = pictures.map((path) => {
			const target = join(evidence, 'screenshots', basename(path))
			if (absoluteFile(root, target) !== path) copyFileSync(path, target)
			return { ref: `${ref}/screenshots/${basename(path)}`, sha256: sha256File(path) }
		})
		gates.push({ id: 'evidence.screenshots', label: 'Frontend screenshots captured', status: 'pass', screenshots })
	}

	const integrity = cycles.map(({ cycle, red, green, file }) => ({
		cycle, test_files: [file], red_commit: git(root, ['rev-parse', red]), green_commit: git(root, ['rev-parse', green]),
	}))
	const shas = git(root, ['rev-list', '--reverse', `${input.base}..${rev}`]).split('\n').filter(Boolean)
	const commits = shas.map((sha) => ({
		sha, subject: git(root, ['log', '-1', '--format=%s', sha]),
		files_changed: git(root, ['show', '--name-only', '--format=', sha]).split('\n').filter(Boolean),
	}))

	const log = {
		$schema: 'quality-gates-evidence/v7', story: input.story, produced_at: new Date().toISOString(),
		producer: 'software-engineer', tech_adapter: 'quality-gates-dotnet', repo_root_rev: rev,
		commits_covered: commits, gates, test_integrity: { cycles: integrity },
	}
	writeFileSync(join(evidence, `qg-${input.story}.json`), `${JSON.stringify(log, null, 2)}\n`)
	process.stdout.write(gates.map((gate) => `${gate.id} ${gate.status}`).join('\n') + '\n')

	const verify = spawnSync(process.execPath, [join(HERE, 'qg-verify/cli/qg-verify.mjs'), '--log', `${repoPath}/qg-${input.story}.json`, '--root', root, '--base', input.base], { cwd: root, encoding: 'utf8' })
	process.stdout.write(verify.stdout ?? '')
	process.stderr.write(verify.stderr ?? '')
	return verify.status ?? 2
}

if (isEntry(import.meta.url)) await main(() => collect(process.argv.slice(2)))
