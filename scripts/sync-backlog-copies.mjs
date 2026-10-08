#!/usr/bin/env node
// Keeps the files skraft-backlog ships twice byte for byte identical: the skraft-refine
// workflow runs a copy of the refinement marker check before any skill is installed.
// `--apply` writes the copies, `--check` fails when one is missing or stale.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const pluginRoot = join(repo, 'plugins', 'skraft-backlog')

export const COPIES = [
	{ source: 'skills/refinement-proposal/scripts/refine-marker.mjs', targets: ['workflows/shared/skraft-refine-marker.mjs'] },
]

export function check() {
	const problems = []
	for (const { source, targets } of COPIES) {
		const bytes = readFileSync(join(pluginRoot, source))
		for (const target of targets) {
			const path = join(pluginRoot, target)
			if (!existsSync(path)) problems.push(`missing: ${target}`)
			else if (!readFileSync(path).equals(bytes)) problems.push(`stale: ${target}`)
		}
	}
	return problems
}

export function apply() {
	const written = []
	for (const { source, targets } of COPIES) {
		const bytes = readFileSync(join(pluginRoot, source))
		for (const target of targets) {
			const path = join(pluginRoot, target)
			if (existsSync(path) && readFileSync(path).equals(bytes)) continue
			mkdirSync(dirname(path), { recursive: true })
			writeFileSync(path, bytes)
			written.push(target)
		}
	}
	return written
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const mode = process.argv[2]
	if (mode === '--apply') console.log(`Backlog copies: ${apply().length} file(s) written`)
	else if (mode === '--check') {
		const problems = check()
		if (problems.length) {
			console.error(`Backlog copies out of date (run npm run backlog:sync):\n${problems.join('\n')}`)
			process.exitCode = 1
		} else console.log('Backlog copies: up to date')
	} else {
		console.error('Usage: sync-backlog-copies.mjs --apply | --check')
		process.exitCode = 2
	}
}
