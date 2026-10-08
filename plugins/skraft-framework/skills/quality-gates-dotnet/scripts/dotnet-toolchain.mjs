// I/O shared by the .NET gate scripts. No shell anywhere, so every script behaves the same on
// Linux, macOS and Windows. SKRAFT_DOTNET replaces the `dotnet` executable (a .mjs or .js path
// runs through this Node), which is how the tests drive the scripts with a fake toolchain.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, openSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const sha256File = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

export class Exit extends Error {
	constructor(code, message) {
		super(message ?? '')
		this.code = code
	}
}

export const usageError = (message) => new Exit(2, message)

// Arguments as the shell scripts parsed them: `--name value` pairs and bare flags, in order.
export function parseArguments(argv, { values = [], repeated = [], flags = [], refuse = {}, usage }) {
	const result = { flags: new Set() }
	for (const name of repeated) result[name] = []
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index]
		const name = token.replace(/^--/, '')
		if (token === '--help' || token === '-h') throw Object.assign(new Exit(0, usage), { help: true })
		if (refuse[token]) throw usageError(refuse[token])
		if (flags.includes(name)) { result.flags.add(name); continue }
		if (values.includes(name) || repeated.includes(name)) {
			const value = argv[index + 1]
			if (value === undefined || value === '') throw usageError(`${token} requires a value`)
			index += 1
			if (repeated.includes(name)) result[name].push(value)
			else result[name] = value
			continue
		}
		throw Object.assign(usageError(`unknown argument: ${token}`), { usage })
	}
	return result
}

export function absoluteDir(path) {
	try {
		if (!statSync(path).isDirectory()) return null
		return realpathSync(path)
	} catch {
		return null
	}
}

export function fromRoot(root, path) {
	return isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path) ? path : join(root, path)
}

export function absoluteFile(root, path) {
	const candidate = fromRoot(root, path)
	try {
		if (!statSync(candidate).isFile()) return null
	} catch {
		return null
	}
	return join(realpathSync(dirname(candidate)), basename(candidate))
}

export function dotnetCommand() {
	const custom = process.env.SKRAFT_DOTNET
	if (custom && /\.(mjs|cjs|js)$/.test(custom)) return [process.execPath, [custom]]
	return [custom || 'dotnet', []]
}

// Runs dotnet with the given arguments. `output` is a file path (stdout and stderr appended
// there) or 'ignore' / 'inherit'.
export function dotnet(args, { cwd, output = 'inherit', stderr } = {}) {
	const [command, prefix] = dotnetCommand()
	let fd
	try {
		let stdio
		if (output === 'ignore') stdio = ['ignore', 'ignore', stderr ?? 'inherit']
		else if (output === 'inherit') stdio = 'inherit'
		else {
			fd = openSync(output, 'a')
			stdio = ['ignore', fd, fd]
		}
		const result = spawnSync(command, [...prefix, ...args], { cwd, stdio, shell: false, windowsHide: true })
		if (result.error) return { status: result.error.code === 'ENOENT' ? 127 : 126, error: result.error }
		return { status: result.status ?? 128 }
	} finally {
		if (fd !== undefined) closeSync(fd)
	}
}

export function requireDotnetStryker() {
	const probe = dotnet(['--version'], { output: 'ignore', stderr: 'ignore' })
	if (probe.status === 127 || probe.status === 126) throw new Exit(3, 'dotnet is not on PATH')
	// Stryker.NET reads --version as a project-version option, so probe with --help.
	if (dotnet(['stryker', '--help'], { output: 'ignore', stderr: 'ignore' }).status !== 0) throw new Exit(3, 'dotnet stryker is not available')
}

export function requireDotnet() {
	const probe = dotnet(['--version'], { output: 'ignore', stderr: 'ignore' })
	if (probe.status === 127 || probe.status === 126) throw new Exit(3, 'dotnet is not on PATH')
}

// Entry point shared by every script: prints the message, sets the exit code.
export async function main(run) {
	try {
		const code = await run()
		process.exitCode = code ?? 0
	} catch (error) {
		if (error instanceof Exit) {
			if (error.help) process.stdout.write(`${error.message}\n`)
			else if (error.message) process.stderr.write(`${error.message}\n`)
			if (error.usage && !error.help) process.stderr.write(`${error.usage}\n`)
			process.exitCode = error.code
		} else {
			process.stderr.write(`${error.stack ?? error}\n`)
			process.exitCode = 2
		}
	}
}

export const isEntry = (url) => {
	if (!process.argv[1]) return false
	try {
		return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url))
	} catch {
		return false
	}
}

export { existsSync, resolve }
