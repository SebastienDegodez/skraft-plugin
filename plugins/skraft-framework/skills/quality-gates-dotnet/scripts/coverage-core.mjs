#!/usr/bin/env node
// G11 — line coverage of the Domain and Application core meets the bar (100%).
// Runs the solution's tests once with the XPlat collector, then sums the Cobertura line
// counts of every *.Domain and *.Application package (nested bounded contexts included).
// Evidence: qg-coverage.stdout (test output + summary line), .exit, .stdout.sha256, .json.
// Exit: 0 pass | 1 below the bar, tests failed or nothing measured | 2 usage error | 3 toolchain missing
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { absoluteDir, dotnet, fromRoot, isEntry, main, parseArguments, requireDotnet, sha256File, usageError } from './dotnet-toolchain.mjs'

const EXPECTED = 100
const USAGE = 'Usage: coverage-core.mjs --root <dir> --evidence <dir> [--solution <sln>]'

function reports(dir) {
	const found = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) found.push(...reports(full))
		else if (entry.name === 'coverage.cobertura.xml') found.push(full)
	}
	return found
}

// Cobertura lists a line under its method and again under its class: count each
// source line once, covered when any entry hit it.
export function coreCoverage(files) {
	const lines = new Map()
	for (const report of files) {
		const xml = readFileSync(report, 'utf8')
		for (const [, name, body] of xml.matchAll(/<package\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/package>/g)) {
			if (!/(^|\.)(Domain|Application)$/.test(name)) continue
			for (const [, file, classBody] of body.matchAll(/<class\b[^>]*\bfilename="([^"]*)"[^>]*>([\s\S]*?)<\/class>/g)) {
				for (const [, number, hits] of classBody.matchAll(/<line\b[^>]*\bnumber="(\d+)"[^>]*\bhits="(\d+)"/g)) {
					const key = `${name}|${file}:${number}`
					lines.set(key, (lines.get(key) ?? false) || Number(hits) > 0)
				}
			}
		}
	}
	const valid = lines.size
	const covered = [...lines.values()].filter(Boolean).length
	return { valid, covered, percent: valid ? Math.floor((covered * 10000) / valid) / 100 : 0 }
}

export function runCoverage(argv) {
	const input = parseArguments(argv, {
		values: ['root', 'evidence', 'solution'],
		refuse: { '--threshold': 'refusing --threshold: the bar is not a runtime argument' }, usage: USAGE,
	})
	if (!input.root || !input.evidence) throw Object.assign(usageError(USAGE))
	const root = absoluteDir(input.root)
	if (!root) throw usageError('repository root not found')
	const evidence = fromRoot(root, input.evidence)
	let solution = input.solution
	if (!solution) {
		const found = readdirSync(root).filter((name) => /\.(sln|slnx)$/.test(name))
		if (found.length !== 1) throw usageError('select one solution with --solution')
		solution = found[0]
	}
	requireDotnet()
	mkdirSync(evidence, { recursive: true })

	const results = mkdtempSync(join(tmpdir(), 'skraft-coverage.'))
	try {
		const stdout = join(evidence, 'qg-coverage.stdout')
		writeFileSync(stdout, '')
		const tests = dotnet(['test', solution, '--nologo', '--collect:XPlat Code Coverage', '--results-directory', results], { cwd: root, output: stdout })
		const { valid, covered, percent } = coreCoverage(reports(results))
		const passed = tests.status === 0 && valid > 0 && covered * 100 >= EXPECTED * valid
		appendFileSync(stdout, `${valid === 0
			? 'Line coverage (Domain, Application): no Domain or Application package was measured'
			: `Line coverage (Domain, Application): ${covered}/${valid} = ${percent}% (bar ${EXPECTED}%)`}\n`)
		const exit = passed ? 0 : 1
		writeFileSync(join(evidence, 'qg-coverage.json'), `${JSON.stringify({ gate: 'coverage', expected: EXPECTED, covered, valid, percent, passed, exit })}\n`)
		writeFileSync(join(evidence, 'qg-coverage.exit'), `${exit}\n`)
		writeFileSync(join(evidence, 'qg-coverage.stdout.sha256'), `${sha256File(stdout)}\n`)
		return exit
	} finally {
		rmSync(results, { recursive: true, force: true })
	}
}

if (isEntry(import.meta.url)) await main(() => runCoverage(process.argv.slice(2)))
