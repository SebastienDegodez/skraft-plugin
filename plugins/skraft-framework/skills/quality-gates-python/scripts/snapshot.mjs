#!/usr/bin/env node
// Writes the exact bytes of <file> at <rev> to <evidence>/snapshots/<name>, for the G9
// RED/GREEN snapshots. No shell redirection, so PowerShell cannot re-encode the file.
//   node snapshot.mjs --evidence <dir> --name red-1-SomeTests.cs --file <repo path> [--rev HEAD] [--root <repo>]
import { execFileSync } from 'node:child_process'
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function snapshot({ evidence, name, file, rev = 'HEAD', root = '.' }) {
	if (!evidence || !name || !file) throw new Error('Usage: snapshot.mjs --evidence <dir> --name <snapshot> --file <repo path> [--rev HEAD] [--root <repo>]')
	if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('.')) throw new Error('--name is a plain file name such as red-1-SomeTests.cs')
	const bytes = execFileSync('git', ['-C', resolve(root), 'show', `${rev}:${file.replaceAll('\\', '/')}`], { stdio: ['ignore', 'pipe', 'pipe'] })
	const directory = join(resolve(evidence), 'snapshots')
	mkdirSync(directory, { recursive: true })
	writeFileSync(join(directory, name), bytes)
	return join(directory, name)
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
	try {
		const argv = process.argv.slice(2)
		const options = {}
		for (let index = 0; index < argv.length; index += 2) {
			if (!['--evidence', '--name', '--file', '--rev', '--root'].includes(argv[index]) || argv[index + 1] === undefined) throw new Error(`Unexpected argument: ${argv[index]}`)
			options[argv[index].slice(2)] = argv[index + 1]
		}
		process.stdout.write(`${snapshot(options)}\n`)
	} catch (error) {
		process.stdout.write(`snapshot blocked: ${error.message}\n`)
		process.exitCode = 2
	}
}
