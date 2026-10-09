#!/usr/bin/env node
// Stands in for vitest, stryker and eslint. The tool is the first argument (the fake package's
// bin passes it); behaviour comes from .fake-tools.json in the working directory (the package).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const scenario = existsSync('.fake-tools.json') ? JSON.parse(readFileSync('.fake-tools.json', 'utf8')) : {}
const [tool, ...args] = process.argv.slice(2)
appendFileSync('.fake-tools.calls', `${JSON.stringify([tool, ...args])}\n`)

if (tool === 'vitest') {
	if (args.includes('--coverage.enabled')) {
		const dir = args.find((arg) => arg.startsWith('--coverage.reportsDirectory=')).split('=')[1]
		const summary = Object.fromEntries(Object.entries(scenario.coverage ?? {}).map(([name, lines]) => [resolve(name), { lines }]))
		mkdirSync(resolve(dir), { recursive: true })
		writeFileSync(resolve(dir, 'coverage-summary.json'), JSON.stringify({ total: {}, ...summary }))
	}
	process.stdout.write(scenario.testsExit ? 'Tests 1 failed\n' : 'Tests 3 passed\n')
	process.exit(scenario.testsExit ?? 0)
}

if (tool === 'stryker') {
	const config = JSON.parse(readFileSync(args[1], 'utf8'))
	writeFileSync('.fake-tools.stryker-config.json', JSON.stringify(config))
	if (scenario.leaveMutant) appendFileSync(scenario.leaveMutant, '\n// left mutated\n')
	const report = { schemaVersion: '1', thresholds: { high: 80, low: 60 }, files: scenario.report ?? {} }
	mkdirSync(dirname(resolve(config.jsonReporter.fileName)), { recursive: true })
	if (!scenario.noReport) writeFileSync(resolve(config.jsonReporter.fileName), JSON.stringify(report))
	process.exit(scenario.strykerExit ?? 0)
}

if (tool === 'eslint') {
	if (args[0] === '--print-config') {
		const rules = scenario.rules ?? { 'boundaries/dependencies': [2, { default: 'disallow' }], 'boundaries/no-unknown-files': [2] }
		process.stdout.write(JSON.stringify({ rules }))
		process.exit(0)
	}
	if (scenario.lintOutput) process.stdout.write(`${scenario.lintOutput}\n`)
	process.exit(scenario.lintExit ?? 0)
}

process.stderr.write(`fake tools: unsupported call ${process.argv.slice(2).join(' ')}\n`)
process.exit(97)
