#!/usr/bin/env node
// Stands in for the project's Python interpreter. Behaviour comes from .fake-python.json in
// the working directory (the repository root the gate scripts run from).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'

const scenario = existsSync('.fake-python.json') ? JSON.parse(readFileSync('.fake-python.json', 'utf8')) : {}
const [flag, target, ...rest] = process.argv.slice(2)
appendFileSync('.fake-python.calls', `${JSON.stringify(process.argv.slice(2))}\n`)

if (flag === '-c') {
	if (target.includes('sys.version_info')) process.stdout.write(`${scenario.python ?? '3 12'}\n`)
	else if (target.includes('importlib.metadata')) {
		const version = (scenario.versions ?? {})[rest[0]]
		if (!version) process.exit(1)
		process.stdout.write(`${version}\n`)
	}
	process.exit(0)
}

if (flag === '-m' && target === 'coverage') {
	if (rest[0] === 'run') {
		process.stdout.write(`${scenario.pytestExit ? '1 failed' : '3 passed'}\n`)
		process.exit(scenario.pytestExit ?? 0)
	}
	if (rest[0] === 'json') {
		writeFileSync(rest[rest.indexOf('-o') + 1], JSON.stringify(scenario.coverageReport ?? { files: {} }))
		process.exit(0)
	}
}
if (flag === '-m' && target === 'pytest') {
	process.stdout.write(`${scenario.pytestExit ? '1 failed' : '3 passed'}\n`)
	process.exit(scenario.pytestExit ?? 0)
}
process.stderr.write(`fake python: unsupported call ${process.argv.slice(2).join(' ')}\n`)
process.exit(97)
