#!/usr/bin/env node
// Stands in for vitest and eslint. The tool is the first argument (the fake package's
// bin passes it); behaviour comes from .fake-tools.json in the working directory (the package).
import { appendFileSync, existsSync, readFileSync } from 'node:fs'

const scenario = existsSync('.fake-tools.json') ? JSON.parse(readFileSync('.fake-tools.json', 'utf8')) : {}
const [tool, ...args] = process.argv.slice(2)
appendFileSync('.fake-tools.calls', `${JSON.stringify([tool, ...args])}\n`)

if (tool === 'vitest') {
	process.stdout.write(scenario.testsExit ? 'Tests 1 failed\n' : 'Tests 3 passed\n')
	process.exit(scenario.testsExit ?? 0)
}

if (tool === 'eslint') {
	if (scenario.lintOutput) process.stdout.write(`${scenario.lintOutput}\n`)
	process.exit(scenario.lintExit ?? 0)
}

process.stderr.write(`fake tools: unsupported call ${process.argv.slice(2).join(' ')}\n`)
process.exit(97)
