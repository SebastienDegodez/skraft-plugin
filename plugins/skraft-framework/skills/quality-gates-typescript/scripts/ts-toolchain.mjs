// I/O shared by the TypeScript gate scripts: package root, tool binaries, Git, child capture.
// Every tool runs as `node <its bin file>` without a shell, so the same call works on Windows,
// where node_modules/.bin holds .cmd shims a shell-less spawn cannot start.
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

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

// The front end's own package: package.json and its installed node_modules.
export async function packageRoot(root, dir = '.') {
	const absolute = await realpath(resolve(root, dir)).catch(() => null)
	ensure(absolute, `Package directory not found: ${dir}`)
	inside(root, absolute)
	ensure(existsSync(join(absolute, 'package.json')), `No package.json in ${dir}`)
	ensure(existsSync(join(absolute, 'node_modules')), `No node_modules in ${dir}: install the project's dependencies before the gates (never during them)`)
	return absolute
}

function manifest(pkg, name) {
	const file = join(pkg, 'node_modules', ...name.split('/'), 'package.json')
	ensure(existsSync(file), `${name} is not installed in ${inside(pkg, dirname(dirname(file))) || '.'}; add it to the project's devDependencies`)
	return { file, data: JSON.parse(readFileSync(file, 'utf8')) }
}

export const packageVersion = (pkg, name) => manifest(pkg, name).data.version

export function majorOf(version) {
	return Number(String(version).split('.')[0])
}

// `{bin:vitest}`, `{bin:typescript:tsc}`: the JavaScript file a package exposes as a command.
export function resolveBin(pkg, name, bin) {
	const { file, data } = manifest(pkg, name)
	const entry = typeof data.bin === 'string' ? data.bin : data.bin?.[bin ?? name.split('/').pop()]
	ensure(entry, `${name} exposes no "${bin ?? name}" command`)
	return join(dirname(file), entry)
}

export function binPlaceholder(pkg, token) {
	const match = /^\{bin:([^:}]+)(?::([^}]+))?\}$/.exec(token)
	return match ? resolveBin(pkg, match[1], match[2]) : null
}

export async function sourceFiles(pkg, dir = 'src') {
	const files = []
	async function walk(path) {
		const info = await lstat(path)
		if (info.isSymbolicLink()) return
		if (info.isDirectory()) {
			for (const entry of await readdir(path)) if (entry !== 'node_modules' && !entry.startsWith('.')) await walk(join(path, entry))
		} else files.push(inside(pkg, path))
	}
	if (existsSync(join(pkg, dir))) await walk(join(pkg, dir))
	return files.sort()
}

export function changedSince(root, since) {
	const mergeBase = git(root, ['merge-base', since, 'HEAD'])
	const changed = git(root, ['diff', '--name-only', '-z', mergeBase, '--']).split('\0').filter(Boolean)
	const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--']).split('\0').filter(Boolean)
	return { mergeBase, files: [...new Set([...changed, ...untracked])] }
}

export async function capture(command, args, { cwd, env = process.env, stdout, stderr }) {
	const out = await open(stdout, 'wx')
	let err
	try {
		err = stderr ? await open(stderr, 'wx') : out
		return await new Promise((done) => {
			const child = spawn(command, args, { cwd, env, shell: false, stdio: ['ignore', out.fd, err.fd] })
			child.once('error', (error) => done({ code: null, signal: null, error: error.message }))
			child.once('close', (code, signal) => done({ code, signal }))
		})
	} finally {
		await out.close()
		if (err && err !== out) await err.close()
	}
}

// Every tool call is `node <bin file> ...`, with CI set so no watcher or prompt starts.
export const nodeEnv = () => ({ ...process.env, CI: 'true', FORCE_COLOR: '0', NO_COLOR: '1' })
export const runNode = (bin, args, options) => capture(process.execPath, [bin, ...args], { env: nodeEnv(), ...options })

// A scope's checked-in Stryker config: committed, valid, and the package sources it names.
export async function loadScope({ root, pkg, config, scope, validate, match }) {
	const path = resolve(pkg, config)
	const name = inside(root, path)
	git(root, ['ls-files', '--error-unmatch', '--', name])
	git(root, ['cat-file', '-e', `HEAD:${name}`])
	const bytes = readFileSync(path)
	let parsed
	try {
		parsed = JSON.parse(bytes.toString('utf8'))
	} catch (error) {
		throw new Error(`${name} is not JSON: ${error.message}`)
	}
	const options = validate(parsed, scope)
	const files = match(await sourceFiles(pkg), options.mutate)
	ensure(files.length > 0, `mutate in ${name} matches no source file`)
	const empty = options.mutate.filter((pattern) => match(files, [pattern]).length === 0)
	ensure(empty.length === 0, `mutate pattern matches no source file: ${empty.join(', ')}`)
	return { name, sha256: sha256(bytes), options, files }
}
