#!/usr/bin/env node
// Runs one command without a shell and deposits <name>.stdout (stdout and stderr), <name>.exit
// and <name>.stdout.sha256 in the evidence directory. `{python}` as the command is the
// project interpreter (.venv on any OS). Exits with the command's own exit code.
import { realpathSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from './gate-policy.mjs'
import { capture, ensure, pythonEnv, repositoryRoot, resolvePython, sha256 } from './python-toolchain.mjs'

export async function runCapture(input, command, args) {
	ensure(/^[A-Za-z0-9._-]+$/.test(input.name), '--name is a plain file stem such as qg-tests')
	const root = await repositoryRoot(input.root)
	const evidence = resolve(root, input.evidence)
	await mkdir(evidence, { recursive: true })
	const prefix = join(evidence, input.name)
	for (const stale of [`${prefix}.stdout`, `${prefix}.exit`, `${prefix}.stdout.sha256`]) await rm(stale, { force: true })
	const python = command === '{python}' || args.includes('{python}') ? resolvePython(root, input.python) : null
	const env = python ? pythonEnv(python) : process.env
	const executable = command === '{python}' ? python : command
	const result = await capture(executable, args.map((arg) => (arg === '{python}' ? python : arg)), { cwd: root, env, stdout: `${prefix}.stdout` })
	const code = result.code ?? 1
	if (result.error) await writeFile(`${prefix}.stdout`, `${result.error}\n`, { flag: 'a' })
	await writeFile(`${prefix}.exit`, `${code}\n`)
	const text = await readFile(`${prefix}.stdout`)
	await writeFile(`${prefix}.stdout.sha256`, `${sha256(text)}\n`)
	return { code, tail: text.toString('utf8').trimEnd().split(/\r?\n/).slice(-40).join('\n') }
}

async function main() {
	const argv = process.argv.slice(2)
	const separator = argv.indexOf('--')
	let code = 2
	try {
		ensure(separator > 0 && separator < argv.length - 1, 'Usage: capture.mjs --root <repo> --evidence <dir> --name <stem> [--python <path>] -- <command> [args...]')
		const input = parseArgs(argv.slice(0, separator), { options: ['root', 'evidence', 'name', 'python'] })
		for (const required of ['root', 'evidence', 'name']) ensure(input[required], `--${required} is required`)
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
