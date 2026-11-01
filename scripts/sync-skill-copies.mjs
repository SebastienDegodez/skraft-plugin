#!/usr/bin/env node
// Keeps every skill self-contained: a script or document a skill needs but does not own is
// copied into the skill, byte for byte, from one source of truth. `--apply` writes the
// copies, `--check` fails when one is missing or stale.
//
// COPIES are single files; paths are relative to the framework plugin, a source may sit in a
// sibling plugin.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const pluginRoot = join(repo, 'plugins', 'skraft-framework')

export const COPIES = [
	// The reporting pair links to each other, so they always travel together.
	...['mcp-publication.md', 'report-contract.md'].map((name) => ({
		source: `skills/qa-reporting/references/${name}`,
		targets: [`assets/reporting/${name}`, `skills/github-forge-writes/references/${name}`, `skills/playwright-evidence/references/${name}`],
	})),
	// The Azure DevOps comment request body: skraft-backlog owns it, the framework's write skill carries it.
	{
		source: '../skraft-backlog/skills/azure-boards-work-items/scripts/comment-request.mjs',
		targets: ['skills/azure-devops-forge-writes/scripts/comment-request.mjs'],
	},
]

export function expectedFiles() {
	const expected = new Map()
	for (const { source, targets } of COPIES) {
		const bytes = readFileSync(join(pluginRoot, source))
		for (const target of targets) expected.set(target, bytes)
	}
	return expected
}

export function check() {
	const problems = []
	const expected = expectedFiles()
	for (const [target, bytes] of expected) {
		const path = join(pluginRoot, target)
		if (!existsSync(path)) problems.push(`missing: ${target}`)
		else if (!readFileSync(path).equals(bytes)) problems.push(`stale: ${target}`)
	}
	return problems
}

export function apply() {
	const written = []
	const expected = expectedFiles()
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
