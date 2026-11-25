#!/usr/bin/env node
// Runs inside the package: asks the project's own ESLint for the resolved config of each file
// listed in a JSON file, and prints { file: { rule: setting } } for the rules the caller names.
// Usage: node eslint-rules.mjs <files.json> <rule> [<rule>...]
// architecture-gate.mjs starts it as a child process in the package; imported, it does nothing.
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * The resolved setting of each named rule, for each file the list holds, by the package's ESLint.
 * @param {{ listFile: string, rules: string[], cwd: string }} request
 * @returns {Promise<Record<string, Record<string, unknown>>>}
 */
export async function eslintRules({ listFile, rules, cwd }) {
	const files = JSON.parse(readFileSync(resolve(cwd, listFile), 'utf8'))
	const requireFromPackage = createRequire(join(cwd, 'package.json'))
	const { ESLint } = await import(pathToFileURL(requireFromPackage.resolve('eslint')).href)
	const eslint = new ESLint({ cwd })
	const result = {}
	for (const file of files) {
		const config = await eslint.calculateConfigForFile(file)
		result[file] = Object.fromEntries(rules.map((rule) => [rule, config?.rules?.[rule] ?? null]))
	}
	return result
}

/** Whether this file is the program node started, not a module another one imported. */
const startedAsProgram = () => {
	if (!process.argv[1]) return false
	try {
		return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
	} catch {
		return false
	}
}

if (startedAsProgram()) {
	const [listFile, ...rules] = process.argv.slice(2)
	process.stdout.write(`${JSON.stringify(await eslintRules({ listFile, rules, cwd: process.cwd() }))}\n`)
}
