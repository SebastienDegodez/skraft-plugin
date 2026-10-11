#!/usr/bin/env node
// Keeps every skill self-contained: a script or document a skill needs but does not own is
// copied into the skill, byte for byte, from one source of truth. `--apply` writes the
// copies, `--check` fails when one is missing, stale or extraneous.
//
// COPIES are single files. The qg-verify CLI bundled in quality-gates-evidence-contract is
// the source of the identical copies the stack-specific quality-gates skills ship.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const pluginRoot = join(repo, 'plugins', 'skraft-framework')

const toPosix = (path) => path.split(sep).join('/')

const QG_VERIFY = 'skills/quality-gates-evidence-contract/scripts/qg-verify'
const QG_VERIFY_TARGETS = ['quality-gates-dotnet', 'quality-gates-javascript', 'quality-gates-python'].map((skill) => `skills/${skill}/scripts/qg-verify`)

function qgVerifyCopies() {
	const root = join(pluginRoot, QG_VERIFY)
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => toPosix(relative(root, join(entry.parentPath, entry.name))))
		.sort()
		.map((file) => ({ source: posix.join(QG_VERIFY, file), targets: QG_VERIFY_TARGETS.map((target) => posix.join(target, file)) }))
}

export const COPIES = [
	{ source: 'skills/quality-gates-dotnet/scripts/capture.mjs', targets: ['skills/quality-gates-javascript/scripts/capture.mjs'] },
	{ source: 'skills/quality-gates-dotnet/scripts/snapshot.mjs', targets: ['skills/quality-gates-javascript/scripts/snapshot.mjs', 'skills/quality-gates-python/scripts/snapshot.mjs'] },
	// The reporting pair links to each other, so they always travel together.
	...['mcp-publication.md', 'report-contract.md'].map((name) => ({
		source: `skills/qa-reporting/references/${name}`,
		targets: [`assets/reporting/${name}`, `skills/github-publication/references/${name}`, `skills/playwright-evidence/references/${name}`],
	})),
	...qgVerifyCopies(),
]

export function expectedFiles() {
	const expected = new Map()
	for (const { source, targets } of COPIES) {
		const bytes = readFileSync(join(pluginRoot, source))
		for (const target of targets) expected.set(target, bytes)
	}
	return expected
}

function filesUnder(target) {
	const dir = join(pluginRoot, target)
	if (!existsSync(dir)) return []
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => toPosix(relative(pluginRoot, join(entry.parentPath, entry.name))))
}

export function check() {
	const problems = []
	const expected = expectedFiles()
	for (const [target, bytes] of expected) {
		const path = join(pluginRoot, target)
		if (!existsSync(path)) problems.push(`missing: ${target}`)
		else if (!readFileSync(path).equals(bytes)) problems.push(`stale: ${target}`)
	}
	for (const target of QG_VERIFY_TARGETS) {
		for (const file of filesUnder(target)) if (!expected.has(file)) problems.push(`extraneous: ${file}`)
	}
	return problems
}

export function apply() {
	const written = []
	const expected = expectedFiles()
	for (const target of QG_VERIFY_TARGETS) {
		for (const file of filesUnder(target)) if (!expected.has(file)) rmSync(join(pluginRoot, file))
	}
	for (const [target, bytes] of expected) {
		const path = join(pluginRoot, target)
		if (existsSync(path) && readFileSync(path).equals(bytes)) continue
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, bytes)
		written.push(target)
	}
	return written
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const mode = process.argv[2]
	if (mode === '--apply') {
		const written = apply()
		console.log(`Skill copies: ${written.length} file(s) written`)
	} else if (mode === '--check') {
		const problems = check()
		if (problems.length) {
			console.error(`Skill copies out of date (run npm run skills:sync):\n${problems.join('\n')}`)
			process.exitCode = 1
		} else console.log('Skill copies: up to date')
	} else {
		console.error('Usage: sync-skill-copies.mjs --apply | --check')
		process.exitCode = 2
	}
}
