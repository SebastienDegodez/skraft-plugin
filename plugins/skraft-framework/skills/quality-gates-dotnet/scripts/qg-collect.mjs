#!/usr/bin/env node
// Every quality gate of a .NET story in one command: runs the tests, the build and the
// no-mocks scan, copies and hashes the frontend screenshots, records each verdict in the
// evidence log (contract v7, through gate-log.mjs) and runs qg-verify on it. The log and the
// screenshots are the only files left in the Git-ignored evidence directory; nothing is
// committed. Exit: qg-verify's (0 pass, 1 fail, 2 inconclusive), or 2 on a usage error.
//   node qg-collect.mjs --root . --log <evidence dir>/qg-<story>.json --base <sha>
//     [--red-base <sha>] [--screenshot <png> …] [--solution <file>]
// --base is the DELIVER base, --red-base the DISTILL base; both default to the bases the
// pipeline recorded, as qg-verify reads them.
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { run } from './capture.mjs'
import { absoluteDir, dotnetCommand, isEntry, main, parseArguments, usageError } from './dotnet-toolchain.mjs'
import { IGNORE_LINE, logTarget, recordGate, recordScreenshots } from './gate-log.mjs'
import { recordNoMocks, scanNoMocks } from './no-mocks-in-core.mjs'

const USAGE = 'usage: qg-collect.mjs --root <repo> --log <evidence dir>/qg-<story>.json [--base <sha>] [--red-base <sha>] [--screenshot <png> …] [--solution <file>]'
const HERE = dirname(fileURLToPath(import.meta.url))
export { IGNORE_LINE }

// TRX counters of a dotnet test run: <Counters total=".." passed=".." failed=".." />.
export function trxMetrics(trx) {
	const counters = trx.match(/<Counters\b[^>]*>/)?.[0]
	if (!counters) return undefined
	const value = (name) => Number(counters.match(new RegExp(`\\b${name}="(\\d+)"`))?.[1] ?? 0)
	return { tests_total: value('total'), tests_passed: value('passed'), tests_failed: value('failed') }
}

async function runDotnet(root, args) {
	const [command, prefix] = dotnetCommand()
	return run({ cwd: root, command, args: [...prefix, ...args] })
}

export async function collect(argv) {
	const input = parseArguments(argv, { values: ['root', 'log', 'base', 'red-base', 'solution'], repeated: ['screenshot'], usage: USAGE })
	for (const name of ['root', 'log']) if (!input[name]) throw usageError(`--${name} is required\n${USAGE}`)
	const root = absoluteDir(input.root)
	if (!root) throw usageError('repository root not found')
	let target
	try { target = logTarget(root, input.log) } catch (error) { throw usageError(error.message) }
	const solution = input.solution ?? readdirSync(root).filter((name) => /\.(sln|slnx)$/.test(name))[0]
	if (!solution) throw usageError('no solution at the root: select one with --solution')
	for (const picture of input.screenshot) if (!existsSync(join(root, picture)) && !existsSync(picture)) throw usageError(`--screenshot ${picture} not found`)
	rmSync(target.path, { force: true }) // one log per run: no verdict survives from an earlier one

	// The TRX report only feeds the metrics: it lives in a throw-away folder, never in evidence/.
	const results = mkdtempSync(join(tmpdir(), 'skraft-trx-'))
	try {
		const testArgs = ['test', solution, '--nologo', '--logger', 'trx;LogFileName=qg-tests.trx', '--results-directory', results]
		const tests = await runDotnet(root, testArgs)
		const trx = join(results, 'qg-tests.trx')
		const metrics = existsSync(trx) ? trxMetrics(readFileSync(trx, 'utf8')) : undefined
		recordGate({ root, log: input.log, ids: ['test.acceptance', 'test.unit'], code: tests.code, output: tests.output, command: `dotnet ${testArgs.slice(0, 2).join(' ')}`, metrics })
	} finally {
		rmSync(results, { recursive: true, force: true })
	}
	const buildArgs = ['build', solution, '--nologo', '--no-incremental']
	const build = await runDotnet(root, buildArgs)
	recordGate({ root, log: input.log, ids: ['build.compile', 'build.lint'], code: build.code, output: build.output, command: `dotnet ${buildArgs.join(' ')}` })
	recordNoMocks(root, input.log, scanNoMocks(root))
	const log = input.screenshot.length > 0 ? recordScreenshots({ root, log: input.log, pictures: input.screenshot }) : JSON.parse(readFileSync(target.path, 'utf8'))
	process.stdout.write(log.gates.map((gate) => `${gate.id} ${gate.status}${gate.summary ? ` — ${gate.summary}` : ''}`).join('\n') + '\n')

	const logPath = relative(root, target.path).split('\\').join('/')
	const verify = spawnSync(process.execPath, [join(HERE, 'qg-verify/cli/qg-verify.mjs'), '--log', logPath, '--root', root, ...(input.base ? ['--base', input.base] : []), ...(input['red-base'] ? ['--red-base', input['red-base']] : [])], { cwd: root, encoding: 'utf8' })
	process.stdout.write(verify.stdout ?? '')
	process.stderr.write(verify.stderr ?? '')
	return verify.status ?? 2
}

if (isEntry(import.meta.url)) await main(() => collect(process.argv.slice(2)))
