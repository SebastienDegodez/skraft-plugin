#!/usr/bin/env node
// G7 for TypeScript: no mocking library and no Vitest/Jest test double in the core sources
// named by the core Stryker config, nor in the unit tests. Prints one hit per line; empty on pass.
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SOURCE, matchSources, mockHits, parseArgs, requiredFiles, validateConfig } from './gate-policy.mjs'
import { ensure, loadScope, packageRoot, repositoryRoot, sha256, sourceFiles } from './ts-toolchain.mjs'

export async function runNoMocksGate(input) {
	const root = await repositoryRoot(input.root)
	const evidence = resolve(root, input.evidence)
	await mkdir(evidence, { recursive: true })
	const prefix = join(evidence, 'qg-mocks')
	let hits = []
	let exitCode = 2
	try {
		const pkg = await packageRoot(root, input.package)
		const scope = await loadScope({ root, pkg, config: input.config ?? 'stryker.core.json', scope: 'core', validate: validateConfig, match: matchSources, required: requiredFiles })
		const testDirs = (input.tests ?? ['tests/unit']).filter((dir) => existsSync(resolve(pkg, dir)))
		ensure(testDirs.length > 0, `No unit test folder found (${(input.tests ?? ['tests/unit']).join(', ')})`)
		const tests = (await Promise.all(testDirs.map((dir) => sourceFiles(pkg, dir)))).flat().filter((name) => SOURCE.test(name))
		for (const name of [...scope.files, ...tests]) hits.push(...mockHits(name, await readFile(join(pkg, name), 'utf8')))
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
		const input = parseArgs(process.argv.slice(2), { options: ['root', 'package', 'evidence', 'config'], repeatable: ['tests'] })
		for (const required of ['root', 'evidence']) ensure(input[required], `--${required} is required`)
		result = await runNoMocksGate(input)
	} catch (error) {
		result = { exitCode: 2, text: `no-mocks gate blocked: ${error.message}\n` }
	}
	process.stdout.write(result.text)
	process.exitCode = result.exitCode
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main()
