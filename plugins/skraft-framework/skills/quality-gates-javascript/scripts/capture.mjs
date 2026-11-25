#!/usr/bin/env node
// Runs one command without a shell and records the gate(s) it attests in the story's evidence
// log: pass on exit 0, fail otherwise, with the last line of its output as summary. No stdout,
// exit or hash file is kept; prints the last 40 lines and exits with the command's own code.
// Same bytes on bash, zsh and PowerShell: no redirection.
//   node capture.mjs --log <evidence dir>/qg-<story>.json --gate <id>[,<id>] [--cwd <dir>] -- <command> [args...]
import { execFileSync, spawn } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logTarget, recordGate } from './gate-log.mjs'

const USAGE = 'Usage: capture.mjs --log <evidence dir>/qg-<story>.json --gate <id>[,<id>] [--cwd <dir>] -- <command> [args...]'

export function parseCaptureArgs(argv) {
	const separator = argv.indexOf('--')
	if (separator < 0 || separator === argv.length - 1) throw new Error(USAGE)
	const options = {}
	const head = argv.slice(0, separator)
	for (let index = 0; index < head.length; index += 2) {
		const key = head[index]
		const value = head[index + 1]
		if (!['--log', '--gate', '--cwd'].includes(key) || value === undefined) throw new Error(`Unexpected argument: ${key}`)
		options[key.slice(2)] = value
	}
	if (!options.log || !options.gate) throw new Error('--log and --gate are required')
	const [command, ...args] = argv.slice(separator + 1)
	return { ...options, gates: options.gate.split(',').map((id) => id.trim()).filter(Boolean), command, args }
}

// Runs the command with its output in a throw-away file outside the repository.
export async function run({ cwd = '.', command, args }) {
	const scratch = mkdtempSync(join(tmpdir(), 'skraft-capture-'))
	const file = join(scratch, 'output')
	try {
		const out = openSync(file, 'w')
		const result = await new Promise((done) => {
			// Windows runs npm, npx, pnpm and yarn through .cmd shims, which Node spawns only through cmd.exe.
			const shim = process.platform === 'win32' && /^(npm|npx|pnpm|yarn)(\.cmd)?$|\.(cmd|bat)$/i.test(command)
			const child = spawn(shim ? `"${command}"` : command, shim ? args.map((arg) => `"${arg.replaceAll('"', '\\"')}"`) : args, { cwd: resolve(cwd), shell: shim, stdio: ['ignore', out, out] })
			child.once('error', (error) => done({ code: 127, error: error.message }))
			child.once('close', (code) => done({ code: code ?? 128 }))
		})
		closeSync(out)
		const output = readFileSync(file, 'utf8') + (result.error ? `${result.error}\n` : '')
		return { code: result.code, output }
	} finally {
		rmSync(scratch, { recursive: true, force: true })
	}
}

export async function capture({ log, gates, cwd = '.', command, args }) {
	const root = execFileSync('git', ['-C', resolve(cwd), 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
	logTarget(root, log) // refuse before a long run, not after it
	const { code, output } = await run({ cwd, command, args })
	recordGate({ root, log, ids: gates, code, output, command: [command, ...args].join(' ') })
	return { code, tail: output.trimEnd().split(/\r?\n/).slice(-40).join('\n') }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
	try {
		const result = await capture(parseCaptureArgs(process.argv.slice(2)))
		process.stdout.write(`${result.tail}\nexit ${result.code}\n`)
		process.exitCode = result.code
	} catch (error) {
		process.stdout.write(`capture blocked: ${error.message}\n`)
		process.exitCode = 2
	}
}
