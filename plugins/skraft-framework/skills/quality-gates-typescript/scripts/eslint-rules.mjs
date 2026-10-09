#!/usr/bin/env node
// Runs inside the package: asks the project's own ESLint for the resolved config of each file
// listed in a JSON file, and prints { file: { rule: setting } } for the rules the caller names.
// Usage: node eslint-rules.mjs <files.json> <rule> [<rule>...]
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [listFile, ...rules] = process.argv.slice(2)
const files = JSON.parse(readFileSync(listFile, 'utf8'))
const requireFromPackage = createRequire(join(process.cwd(), 'package.json'))
const { ESLint } = await import(pathToFileURL(requireFromPackage.resolve('eslint')).href)
const eslint = new ESLint({ cwd: process.cwd() })
const result = {}
for (const file of files) {
	const config = await eslint.calculateConfigForFile(file)
	result[file] = Object.fromEntries(rules.map((rule) => [rule, config?.rules?.[rule] ?? null]))
}
process.stdout.write(`${JSON.stringify(result)}\n`)
