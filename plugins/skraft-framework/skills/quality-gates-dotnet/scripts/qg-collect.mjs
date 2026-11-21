#!/usr/bin/env node
// Every quality gate of a .NET story in one command: runs G1–G7 and G11, writes the G9
// snapshots, lists the covered commits, assembles the evidence log (contract v6), commits the
// evidence directory alone and runs qg-verify on it. Exit: qg-verify's (0 pass, 1 fail,
// 2 inconclusive), or 2 on a usage error.
//   node qg-collect.mjs --root . --evidence <dir> --story <story> --feature <scope> --base <sha>
//     --cycle <k>:<red sha>:<green sha>:<acceptance test file> [--cycle …]
//     [--mutation-gate <mutation-testing skill>/scripts/mutation-gate/cli/mutation-gate.mjs]
//     [--solution <file>] [--no-commit]
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { capture } from './capture.mjs'
import { runCoverage } from './coverage-core.mjs'
import { absoluteDir, dotnetCommand, fromRoot, isEntry, main, parseArguments, usageError } from './dotnet-toolchain.mjs'
import { runNoMocks } from './no-mocks-in-core.mjs'
import { snapshot } from './snapshot.mjs'

const USAGE = 'usage: qg-collect.mjs --root <repo> --evidence <dir> --story <story> --feature <scope> --base <sha> --cycle <k>:<red>:<green>:<file> [--cycle …] [--mutation-gate <cli>] [--solution <file>] [--no-commit]'
const HERE = dirname(fileURLToPath(import.meta.url))

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trimEnd()
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
		values: ['root', 'evidence', 'story', 'feature', 'base', 'mutation-gate', 'solution'],
		repeated: ['cycle'], flags: ['no-commit'], usage: USAGE,
	})
	for (const name of ['root', 'evidence', 'story', 'feature', 'base']) if (!input[name]) throw usageError(`--${name} is required\n${USAGE}`)
	if (input.cycle.length === 0) throw usageError(`one --cycle per delivered scenario is required\n${USAGE}`)
	const root = absoluteDir(input.root)
	if (!root) throw usageError('repository root not found')
	const evidence = fromRoot(root, input.evidence)
	const repoPath = relative(root, evidence).split('\\').join('/')
	const ref = repoPath.slice(Math.max(0, repoPath.lastIndexOf('evidence/')))
	const solution = input.solution ?? readdirSync(root).filter((name) => /\.(sln|slnx)$/.test(name))[0]
	if (!solution) throw usageError('no solution at the root: select one with --solution')
	const cycles = input.cycle.map(parseCycle)
	const rev = git(root, ['rev-parse', 'HEAD'])

	const testsCommand = await runDotnet(evidence, root, 'qg-tests', ['test', solution, '--nologo', '--logger', 'trx;LogFileName=qg-tests.trx', '--results-directory', evidence])
	const buildCommand = await runDotnet(evidence, root, 'qg-build', ['build', solution, '--nologo', '--no-incremental'])
	const archCommand = await runDotnet(evidence, root, 'qg-arch', ['test', solution, '--nologo', '--filter', 'FullyQualifiedName~Architecture', '--logger', 'trx;LogFileName=qg-arch.trx', '--results-directory', evidence])
	runNoMocks(['--root', root, '--evidence', evidence])
	runCoverage(['--root', root, '--evidence', evidence, '--solution', solution])
	let mutationCommand
	if (input['mutation-gate']) {
		const args = ['--root', root, '--evidence', evidence, '--since', input.base, '--pipeline']
		spawnSync(process.execPath, [input['mutation-gate'], ...args], { cwd: root, stdio: 'ignore' })
		mutationCommand = `node ${input['mutation-gate']} ${args.join(' ')}`
	}

	const testsMetrics = trxMetrics(read(join(evidence, 'qg-tests.trx')))
	const archMetrics = trxMetrics(read(join(evidence, 'qg-arch.trx')))
	const tests = gateFrom(evidence, ref, 'G1', 'Acceptance test(s) pass', 'qg-tests', testsCommand, testsMetrics ? { metrics: testsMetrics } : {})
	const build = gateFrom(evidence, ref, 'G3', 'Build passes', 'qg-build', buildCommand)
	const mutationExit = read(join(evidence, 'qg-mutation.exit')).trim()
	const mutation = !mutationCommand
		? { id: 'G6', label: 'Mutation score meets the bar', status: 'fail', rationale: 'qg-collect ran without --mutation-gate' }
		: mutationExit === '3'
			? { id: 'G6', label: 'Mutation score meets the bar', status: 'not_run', rationale: read(join(evidence, 'qg-mutation.stdout')).split(/\r?\n/)[0] || 'no mutation command declared' }
			: gateFrom(evidence, ref, 'G6', 'Mutation score meets the bar', 'qg-mutation', mutationCommand)
	const gates = [
		tests,
		{ ...tests, id: 'G2', label: 'All unit tests pass' },
		build,
		{ ...build, id: 'G4', label: 'Static analysis pass' },
		archMetrics?.tests_total === 0
			? { id: 'G5', label: 'Architecture rules pass', status: 'not_applicable', rationale: 'no architecture test in the solution' }
			: gateFrom(evidence, ref, 'G5', 'Architecture rules pass', 'qg-arch', archCommand, archMetrics ? { metrics: archMetrics } : {}),
		mutation,
		gateFrom(evidence, ref, 'G7', 'No mocks in Domain/Application core', 'qg-mocks', `node ${join(HERE, 'no-mocks-in-core.mjs')} --root . --evidence ${repoPath}`),
		{ id: 'G8', label: 'Conventional commit policy', status: 'pass' },
		{ id: 'G9', label: 'No test tampering (RED→GREEN integrity)', status: 'pass' },
		gateFrom(evidence, ref, 'G11', 'Line coverage meets the bar', 'qg-coverage', `node ${join(HERE, 'coverage-core.mjs')} --root . --evidence ${repoPath}`),
	]

	const integrity = cycles.map(({ cycle, red, green, file }) => {
		const name = basename(file)
		snapshot({ evidence, name: `red-${cycle}-${name}`, file, rev: red, root })
		snapshot({ evidence, name: `green-${cycle}-${name}`, file, rev: green, root })
		return {
			cycle, test_files: [file],
			red_commit: git(root, ['rev-parse', red]), green_commit: git(root, ['rev-parse', green]),
			red_snapshot_ref: `${ref}/snapshots/red-${cycle}-${name}`, green_snapshot_ref: `${ref}/snapshots/green-${cycle}-${name}`,
		}
	})
	const shas = git(root, ['rev-list', '--reverse', `${input.base}..${rev}`]).split('\n').filter(Boolean)
	const commits = shas.map((sha) => ({
		sha, subject: git(root, ['log', '-1', '--format=%s', sha]),
		files_changed: git(root, ['show', '--name-only', '--format=', sha]).split('\n').filter(Boolean),
	}))

	const log = {
		$schema: 'quality-gates-evidence/v6', story: input.story, produced_at: new Date().toISOString(),
		producer: 'software-engineer', tech_adapter: 'quality-gates-dotnet', repo_root_rev: rev,
		commits_covered: commits, gates, test_integrity: { cycles: integrity },
	}
	const logPath = join(evidence, `qg-${input.story}.json`)
	writeFileSync(logPath, `${JSON.stringify(log, null, 2)}\n`)
	process.stdout.write(gates.map((gate) => `${gate.id} ${gate.status}`).join('\n') + '\n')
	if (input.flags.has('no-commit')) return 0

	git(root, ['add', '--', repoPath])
	git(root, ['commit', '--quiet', '-s', '-m', `chore(${input.feature}): record quality evidence for ${input.story}`])
	const verify = spawnSync(process.execPath, [join(HERE, 'qg-verify/cli/qg-verify.mjs'), '--log', `${repoPath}/qg-${input.story}.json`, '--root', root, '--base', input.base], { cwd: root, encoding: 'utf8' })
	process.stdout.write(verify.stdout ?? '')
	process.stderr.write(verify.stderr ?? '')
	return verify.status ?? 2
}

if (isEntry(import.meta.url)) await main(() => collect(process.argv.slice(2)))
