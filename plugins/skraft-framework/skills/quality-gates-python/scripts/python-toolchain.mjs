// I/O shared by the Python gate scripts: interpreter, TOML through Python, Git, child capture.
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

export function runPython(python, args, { cwd }) {
	return execFileSync(...spawnable(python, args), { cwd, env: pythonEnv(python), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

export function pythonVersion(python, root) {
	const [major, minor] = runPython(python, ['-c', 'import sys; print(sys.version_info[0], sys.version_info[1])'], { cwd: root }).trim().split(' ').map(Number)
	ensure(major === 3 && minor >= 11, `Python >= 3.11 required, found ${major}.${minor}`)
	return `${major}.${minor}`
}

export function distributionVersion(python, root, name) {
	try {
		return runPython(python, ['-c', 'import sys, importlib.metadata as m; print(m.version(sys.argv[1]))', name], { cwd: root }).trim()
	} catch {
		throw new Error(`${name} is not installed in ${python}; add it to the project's dev dependencies`)
	}
}

export function readToml(python, root, path) {
	const text = runPython(python, ['-c', 'import json, sys, tomllib; print(json.dumps(tomllib.load(open(sys.argv[1], "rb"))))', path], { cwd: root })
	return JSON.parse(text)
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

export function changedSince(root, since) {
	const mergeBase = git(root, ['merge-base', since, 'HEAD'])
	const changed = git(root, ['diff', '--name-only', '-z', mergeBase, '--']).split('\0').filter(Boolean)
	const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--']).split('\0').filter(Boolean)
	return { mergeBase, files: [...new Set([...changed, ...untracked])] }
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
