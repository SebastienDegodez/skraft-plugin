#!/usr/bin/env node
// The RED of a story in one command: builds, runs the acceptance tests, and commits the named
// files only when the build passes and the tests fail. Prints the end of the test run so the
// caller reads what failed in the same turn. Exit: 0 committed · 2 usage · 3 build failed ·
// 4 nothing failed (no RED) · 5 git refused the commit.
//   node red-commit.mjs --build "<build command>" --test "<acceptance test command>"
//     --message "test(feature): acceptance tests S1–S14" [--root <repo>] -- <file> [<file>…]
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = 'usage: red-commit.mjs --build "<cmd>" --test "<cmd>" --message "<subject>" [--root <repo>] -- <file> [<file>…]'

export function parseRedCommitArgs(argv) {
	const separator = argv.indexOf('--')
	const head = separator < 0 ? argv : argv.slice(0, separator)
	const files = separator < 0 ? [] : argv.slice(separator + 1)
	const options = { root: '.' }
	for (let index = 0; index < head.length; index += 2) {
		const key = head[index]?.replace(/^--/, '')
		const value = head[index + 1]
		if (!['build', 'test', 'message', 'root'].includes(key) || !value) throw new Error(`${USAGE}\nunexpected argument: ${head[index]}`)
		options[key] = value
	}
	for (const name of ['build', 'test', 'message']) if (!options[name]) throw new Error(`${USAGE}\n--${name} is required`)
	if (files.length === 0) throw new Error(`${USAGE}\nname each test and stub file after --`)
	return { ...options, files }
}

const tail = (text, lines = 60) => text.trimEnd().split(/\r?\n/).slice(-lines).join('\n')

// Runs a project command through the platform shell: build and test commands come from the
// project's stack-commands file, written for its shell.
const run = (command, cwd) => {
	const result = spawnSync(command, { cwd, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
	return { code: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

export function redCommit({ build, test, message, root, files }, write = (text) => process.stdout.write(text)) {
	const cwd = resolve(root)
	const built = run(build, cwd)
	if (built.code !== 0) {
		write(`${tail(built.output)}\nRED refused: the build failed (exit ${built.code}); fix the tests or stubs, nothing was committed\n`)
		return 3
	}
	const tested = run(test, cwd)
	write(`${tail(tested.output)}\n`)
	if (tested.code === 0) {
		write('RED refused: every acceptance test passed; nothing was committed\n')
		return 4
	}
	const add = spawnSync('git', ['-C', cwd, 'add', '--', ...files], { encoding: 'utf8' })
	const commit = add.status === 0
		? spawnSync('git', ['-C', cwd, 'commit', '--quiet', '-s', '-m', message, '--', ...files], { encoding: 'utf8' })
		: add
	if (commit.status !== 0) {
		write(`${commit.stderr ?? ''}RED refused: git did not commit\n`)
		return 5
	}
	const sha = spawnSync('git', ['-C', cwd, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim()
	write(`RED committed: ${sha} ${message} — read the failures above: each must be a business assertion\n`)
	return 0
}

const isEntry = () => {
	try {
		return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
	} catch {
		return false
	}
}

if (process.argv[1] && isEntry()) {
	try {
		process.exitCode = redCommit(parseRedCommitArgs(process.argv.slice(2)))
	} catch (error) {
		process.stderr.write(`${error.message}\n`)
		process.exitCode = 2
	}
}
