#!/usr/bin/env node
// Stands in for the project's Python interpreter. Behaviour comes from .fake-python.json in
// the working directory (the repository root the gate scripts run from).
import { existsSync, readFileSync } from 'node:fs'

const scenario = existsSync('.fake-python.json') ? JSON.parse(readFileSync('.fake-python.json', 'utf8')) : {}
const [flag, target] = process.argv.slice(2)

if (flag === '-m' && target === 'pytest') {
	process.stdout.write(`${scenario.pytestExit ? '1 failed' : '3 passed'}\n`)
	process.exit(scenario.pytestExit ?? 0)
}
process.stderr.write(`fake python: unsupported call ${process.argv.slice(2).join(' ')}\n`)
process.exit(97)
