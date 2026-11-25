#!/usr/bin/env node
// Runs one command without a shell and records the gate(s) it attests in the story's evidence
// log (gate-log.mjs): pass on exit 0, fail otherwise. No stdout, exit or hash file is kept.
// `{python}` as the command is the project interpreter (.venv on any OS). Exits with the
// command's own exit code.
import { realpathSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from './gate-policy.mjs'
import { logTarget, recordGate } from './gate-log.mjs'
import { capture, ensure, pythonEnv, repositoryRoot, resolvePython } from './python-toolchain.mjs'

export async function runCapture(input, command, args) {
	const root = await repositoryRoot(input.root)
	const gates = input.gate.split(',').map((id) => id.trim()).filter(Boolean)
	logTarget(root, input.log) // refuse before a long run, not after it
	const python = command === '{python}' || args.includes('{python}') ? resolvePython(root, input.python) : null
	const env = python ? pythonEnv(python) : process.env
	const executable = command === '{python}' ? python : command
	const argv = args.map((arg) => (arg === '{python}' ? python : arg))
	const scratch = await mkdtemp(join(tmpdir(), 'skraft-capture-'))
	try {
		const file = join(scratch, 'output')
		const result = await capture(executable, argv, { cwd: root, env, stdout: file })
		const code = result.code ?? 1
		const output = (await readFile(file, 'utf8')) + (result.error ? `${result.error}\n` : '')
		recordGate({ root, log: input.log, ids: gates, code, output, command: [command, ...args].join(' ') })
		return { code, tail: output.trimEnd().split(/\r?\n/).slice(-40).join('\n') }
	} finally {
		await rm(scratch, { recursive: true, force: true })
	}
}

async function main() {
	const argv = process.argv.slice(2)
	const separator = argv.indexOf('--')
	let code = 2
	try {
		ensure(separator > 0 && separator < argv.length - 1, 'Usage: capture.mjs --root <repo> --log <evidence dir>/qg-<story>.json --gate <id>[,<id>] [--python <path>] -- <command> [args...]')
		const input = parseArgs(argv.slice(0, separator), { options: ['root', 'log', 'gate', 'python'] })
		for (const required of ['root', 'log', 'gate']) ensure(input[required], `--${required} is required`)
		const [command, ...args] = argv.slice(separator + 1)
		const result = await runCapture(input, command, args)
		process.stdout.write(`${result.tail}\nexit ${result.code}\n`)
		code = result.code
	} catch (error) {
		process.stdout.write(`capture blocked: ${error.message}\n`)
	}
	process.exitCode = code
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main()
