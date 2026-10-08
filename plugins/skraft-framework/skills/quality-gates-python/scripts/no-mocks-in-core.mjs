#!/usr/bin/env node
// G7 for Python: no mocking library in the Domain/Application sources named by the core
// cosmic-ray config, nor in the unit test package. Prints one hit per line; empty on pass.
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mockHits, parseArgs, validateConfig } from './gate-policy.mjs'
import { ensure, pythonFiles, readToml, repositoryRoot, resolvePython, sha256 } from './python-toolchain.mjs'

export async function runNoMocksGate(input) {
	const root = await repositoryRoot(input.root)
	const evidence = resolve(root, input.evidence)
	await mkdir(evidence, { recursive: true })
	const prefix = join(evidence, 'qg-mocks')
	let hits = []
	let exitCode = 2
	try {
		const python = resolvePython(root, input.python)
		const config = validateConfig(readToml(python, root, resolve(root, input.config ?? 'cosmic-ray-core.toml')), 'core')
		const testDirs = (input.tests ?? ['tests/unit']).filter((dir) => existsSync(resolve(root, dir)))
		ensure(testDirs.length > 0, `No unit test package found (${(input.tests ?? ['tests/unit']).join(', ')})`)
		const files = await pythonFiles(root, [...config.modulePaths, ...testDirs])
		for (const name of files) hits.push(...mockHits(name, await readFile(join(root, name), 'utf8')))
		exitCode = hits.length ? 1 : 0
	} catch (error) {
		hits = [`no-mocks gate blocked: ${error.message}`]
	}
	const text = hits.length ? `${hits.join('\n')}\n` : ''
	await writeFile(`${prefix}.stdout`, text)
	await writeFile(`${prefix}.exit`, `${exitCode}\n`)
	await writeFile(`${prefix}.stdout.sha256`, `${sha256(text)}\n`)
	return { exitCode, text }
}

async function main() {
	let result
	try {
		const input = parseArgs(process.argv.slice(2), { options: ['root', 'evidence', 'python', 'config'], repeatable: ['tests'] })
		for (const required of ['root', 'evidence']) ensure(input[required], `--${required} is required`)
		result = await runNoMocksGate(input)
	} catch (error) {
		result = { exitCode: 2, text: `no-mocks gate blocked: ${error.message}\n` }
	}
	process.stdout.write(result.text)
	process.exitCode = result.exitCode
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main()
