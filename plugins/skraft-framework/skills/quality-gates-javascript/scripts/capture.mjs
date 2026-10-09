#!/usr/bin/env node
// Runs one command without a shell and deposits <name>.stdout (stdout and stderr), <name>.exit
// and <name>.stdout.sha256 in the evidence directory; prints the last 40 lines and exits with
// the command's own code. Same bytes on bash, zsh and PowerShell: no redirection, no shasum.
//   node capture.mjs --evidence <dir> --name <stem> [--cwd <dir>] -- <command> [args...]
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, openSync, closeSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function parseCaptureArgs(argv) {
	const separator = argv.indexOf('--')
	if (separator < 0 || separator === argv.length - 1) throw new Error('Usage: capture.mjs --evidence <dir> --name <stem> [--cwd <dir>] -- <command> [args...]')
	const options = {}
	const head = argv.slice(0, separator)
	for (let index = 0; index < head.length; index += 2) {
		const key = head[index]
		const value = head[index + 1]
		if (!['--evidence', '--name', '--cwd'].includes(key) || value === undefined) throw new Error(`Unexpected argument: ${key}`)
		options[key.slice(2)] = value
	}
	if (!options.evidence || !options.name) throw new Error('--evidence and --name are required')
	if (!/^[A-Za-z0-9._-]+$/.test(options.name) || options.name.startsWith('.')) throw new Error('--name is a plain file stem such as qg-tests')
	const [command, ...args] = argv.slice(separator + 1)
	return { ...options, command, args }
}

export async function capture({ evidence, name, cwd = '.', command, args }) {
	const directory = resolve(evidence)
	mkdirSync(directory, { recursive: true })
	const prefix = join(directory, name)
	for (const stale of [`${prefix}.stdout`, `${prefix}.exit`, `${prefix}.stdout.sha256`]) rmSync(stale, { force: true })
	const out = openSync(`${prefix}.stdout`, 'w')
	const result = await new Promise((done) => {
		// Windows runs npm, npx, pnpm and yarn through .cmd shims, which Node spawns only through cmd.exe.
		const shim = process.platform === 'win32' && /^(npm|npx|pnpm|yarn)(\.cmd)?$|\.(cmd|bat)$/i.test(command)
		const child = spawn(shim ? `"${command}"` : command, shim ? args.map((arg) => `"${arg.replaceAll('"', '\\"')}"`) : args, { cwd: resolve(cwd), shell: shim, stdio: ['ignore', out, out] })
		child.once('error', (error) => done({ code: 127, error: error.message }))
		child.once('close', (code, signal) => done({ code: code ?? 128, signal }))
	})
	closeSync(out)
	if (result.error) writeFileSync(`${prefix}.stdout`, `${result.error}\n`, { flag: 'a' })
	writeFileSync(`${prefix}.exit`, `${result.code}\n`)
	const bytes = readFileSync(`${prefix}.stdout`)
	writeFileSync(`${prefix}.stdout.sha256`, `${createHash('sha256').update(bytes).digest('hex')}\n`)
	return { code: result.code, tail: bytes.toString('utf8').trimEnd().split(/\r?\n/).slice(-40).join('\n') }
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
