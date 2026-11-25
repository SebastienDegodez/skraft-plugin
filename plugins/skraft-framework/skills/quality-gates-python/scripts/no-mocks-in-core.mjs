#!/usr/bin/env node
// test.no-mocks-core for Python: no mocking library in the Domain/Application sources (every source under a
// folder whose last word is domain or application), nor in the unit test package. Prints one
// hit per line, empty on pass, and records the
// gate in the story's evidence log (gate-log.mjs); no stdout, exit or hash file is kept.
import { existsSync, realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { coreSourceFiles, mockHits, parseArgs } from './gate-policy.mjs'
import { logTarget, recordGate } from './gate-log.mjs'
import { ensure, pythonFiles, repositoryPythonFiles, repositoryRoot } from './python-toolchain.mjs'

export async function runNoMocksGate(input) {
	const root = await repositoryRoot(input.root)
	logTarget(root, input.log)
	let hits = []
	let exitCode = 2
	try {
		const core = coreSourceFiles(repositoryPythonFiles(root))
		ensure(core.length > 0, 'No Domain or Application source: the core is every Python file under a folder whose name ends with domain or application')
		const testDirs = (input.tests ?? ['tests/unit']).filter((dir) => existsSync(resolve(root, dir)))
		ensure(testDirs.length > 0, `No unit test package found (${(input.tests ?? ['tests/unit']).join(', ')})`)
		const files = [...new Set([...core, ...(await pythonFiles(root, testDirs))])].sort()
		for (const name of files) hits.push(...mockHits(name, await readFile(join(root, name), 'utf8')))
		exitCode = hits.length ? 1 : 0
	} catch (error) {
		hits = [`no-mocks gate blocked: ${error.message}`]
	}
	const text = hits.length ? `${hits.join('\n')}\n` : ''
	recordGate({ root, log: input.log, ids: ['test.no-mocks-core'], code: exitCode, output: exitCode === 0 ? 'no mocking symbol in the core' : exitCode === 1 ? `${text}${hits.length} mocking hit(s) in the core` : text, command: 'node no-mocks-in-core.mjs' })
	return { exitCode, text }
}

async function main() {
	let result
	try {
		const input = parseArgs(process.argv.slice(2), { options: ['root', 'log', 'python'], repeatable: ['tests'] })
		for (const required of ['root', 'log']) ensure(input[required], `--${required} is required`)
		result = await runNoMocksGate(input)
	} catch (error) {
		result = { exitCode: 2, text: `no-mocks gate blocked: ${error.message}\n` }
	}
	process.stdout.write(result.text)
	process.exitCode = result.exitCode
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main()
