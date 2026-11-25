// I/O shared by the Python gate scripts: interpreter, Git, child capture.
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export function ensure(condition, message) {
	if (!condition) throw new Error(message)
}

export const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

export function inside(root, path) {
	const name = relative(root, path)
	ensure(name !== '..' && !name.startsWith(`..${sep}`) && !isAbsolute(name), `Path outside root: ${path}`)
	return name.split(sep).join('/')
}

export async function repositoryRoot(path) {
	const root = await realpath(path)
	ensure(await realpath(git(root, ['rev-parse', '--show-toplevel'])) === root, '--root must be the Git repository root')
	return root
}

// The project's own virtual environment, never a global interpreter picked by accident.
export function resolvePython(root, explicit) {
	const candidates = explicit ? [resolve(root, explicit)] : [join(root, '.venv', 'bin', 'python'), join(root, '.venv', 'Scripts', 'python.exe')]
	const found = candidates.find((candidate) => existsSync(candidate))
	ensure(found, explicit ? `Python interpreter not found: ${explicit}` : 'No .venv interpreter at the repository root; pass --python <path to the project interpreter>')
	return found
}

export function pythonEnv(python) {
	const bin = dirname(python)
	const env = { ...process.env, VIRTUAL_ENV: dirname(bin), PYTHONDONTWRITEBYTECODE: '1' }
	// Windows names the variable `Path`; a second `PATH` key would be ignored by the child.
	const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH'
	env[key] = `${bin}${delimiter}${env[key] ?? ''}`
	return env
}

// A .mjs interpreter path runs through this Node: the tests' fake Python, on every OS.
export const spawnable = (command, args) => (/\.(mjs|cjs)$/.test(command) ? [process.execPath, [command, ...args]] : [command, args])

// Every Python file of the working copy Git knows or would add: tracked and untracked, ignored left out.
export function repositoryPythonFiles(root) {
	return git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.py']).split('\0').filter(Boolean)
}

export async function pythonFiles(root, modulePaths) {
	const files = new Set()
	async function walk(path) {
		const info = await lstat(path)
		if (info.isSymbolicLink()) return
		if (info.isDirectory()) {
			for (const entry of await readdir(path)) if (entry !== '__pycache__') await walk(join(path, entry))
		} else if (path.endsWith('.py')) files.add(inside(root, path))
	}
	for (const modulePath of modulePaths) {
		const absolute = resolve(root, modulePath)
		inside(root, absolute)
		ensure(existsSync(absolute), `module-path not found: ${modulePath}`)
		await walk(absolute)
	}
	return [...files].sort()
}

export async function capture(command, args, { cwd, env, stdout, stderr }) {
	const out = await open(stdout, 'wx')
	let err
	try {
		err = stderr ? await open(stderr, 'wx') : out
		return await new Promise((done) => {
			const [executable, argv] = spawnable(command, args)
			const child = spawn(executable, argv, { cwd, env, shell: false, stdio: ['ignore', out.fd, err.fd] })
			child.once('error', (error) => done({ code: null, signal: null, error: error.message }))
			child.once('close', (code, signal) => done({ code, signal }))
		})
	} finally {
		await out.close()
		if (err && err !== out) await err.close()
	}
}
