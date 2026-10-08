#!/usr/bin/env node
// Stands in for the project's Python interpreter. Behaviour comes from .fake-python.json in
// the working directory (the repository root the gate scripts run from).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'

const scenario = existsSync('.fake-python.json') ? JSON.parse(readFileSync('.fake-python.json', 'utf8')) : {}
const [flag, target, ...rest] = process.argv.slice(2)
appendFileSync('.fake-python.calls', `${JSON.stringify(process.argv.slice(2))}\n`)

function toml(text) {
	const root = {}
	let table = root
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim()
		if (!line || line.startsWith('#')) continue
		const header = line.match(/^\[(.+)\]$/)
		if (header) {
			table = header[1].split('.').reduce((node, key) => (node[key] ??= {}), root)
			continue
		}
		const [, key, value] = line.match(/^([\w-]+)\s*=\s*(.+)$/)
		table[key] = JSON.parse(value)
	}
	return root
}

if (flag === '-c') {
	if (target.includes('sys.version_info')) process.stdout.write(`${scenario.python ?? '3 12'}\n`)
	else if (target.includes('importlib.metadata')) {
		const version = (scenario.versions ?? {})[rest[0]]
		if (!version) process.exit(1)
		process.stdout.write(`${version}\n`)
	} else if (target.includes('tomllib')) process.stdout.write(`${JSON.stringify(toml(readFileSync(rest[0], 'utf8')))}\n`)
	process.exit(0)
}

if (flag === '-m' && target === 'cosmic_ray.cli') {
	const [command, ...args] = rest
	if (command === 'baseline') process.exit(scenario.baselineExit ?? 0)
	if (command === 'init') { writeFileSync(args[1], 'session'); process.exit(0) }
	if (command === 'exec') {
		if (scenario.leaveMutant) appendFileSync(scenario.leaveMutant, '\n# left mutated\n')
		process.exit(scenario.execExit ?? 0)
	}
	if (command === 'dump') {
		process.stdout.write((scenario.dump ?? []).map((line) => `${JSON.stringify(line)}\n`).join(''))
		process.exit(0)
	}
}
if (flag === '-m' && target === 'cosmic_ray.tools.filters.pragma_no_mutate') process.exit(0)

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
