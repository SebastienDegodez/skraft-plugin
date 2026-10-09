#!/usr/bin/env node
// Keeps every skill self-contained: a script or document a skill needs but does not own is
// copied into the skill, byte for byte, from one source of truth. `--apply` writes the
// copies, `--check` fails when one is missing, stale or extraneous.
//
// COPIES are single files. BUNDLES are a plugin CLI and every module it imports (static,
// dynamic, and JSON loaded through createRequire), copied under <target>/ with the same
// layout as src/ so relative imports keep resolving.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const pluginRoot = join(repo, 'plugins', 'skraft-framework')

export const COPIES = [
	{ source: 'skills/quality-gates-dotnet/scripts/capture.mjs', targets: ['skills/quality-gates-javascript/scripts/capture.mjs'] },
	{ source: 'skills/quality-gates-dotnet/scripts/snapshot.mjs', targets: ['skills/quality-gates-javascript/scripts/snapshot.mjs', 'skills/quality-gates-python/scripts/snapshot.mjs'] },
	// The reporting pair links to each other, so they always travel together.
	...['mcp-publication.md', 'report-contract.md'].map((name) => ({
		source: `skills/qa-reporting/references/${name}`,
		targets: [`assets/reporting/${name}`, `skills/github-publication/references/${name}`, `skills/playwright-evidence/references/${name}`],
	})),
]

export const BUNDLES = [
	{
		entry: 'src/cli/qg-verify.mjs',
		targets: [
			'skills/quality-gates-evidence-contract/scripts/qg-verify',
			'skills/quality-gates-dotnet/scripts/qg-verify',
			'skills/quality-gates-javascript/scripts/qg-verify',
			'skills/quality-gates-python/scripts/qg-verify',
		],
	},
	{ entry: 'src/cli/report.mjs', targets: ['skills/qa-reporting/scripts/report'] },
]

const MARKER = 'GENERATED.md'

const toPosix = (path) => path.split(sep).join('/')

export function bundleFiles(entry) {
	const src = join(pluginRoot, 'src')
	const seen = new Set()
	const visit = (file) => {
		if (seen.has(file)) return
		seen.add(file)
		if (!file.endsWith('.mjs')) return
		const text = readFileSync(file, 'utf8')
		const specifiers = [
			...text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]/g),
			...text.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g),
			...text.matchAll(/createRequire\([^)]*\)\(\s*['"](\.[^'"]+)['"]\s*\)/g),
		].map((match) => match[1])
		for (const specifier of specifiers) visit(resolve(dirname(file), specifier))
	}
	visit(join(pluginRoot, entry))
	return [...seen].map((file) => {
		const name = relative(src, file)
		if (name.startsWith('..')) throw new Error(`${entry} imports ${file}, outside src/`)
		return toPosix(name)
	}).sort()
}

const marker = (entry, files) => [
	'<!-- markdownlint-disable-file -->',
	`# Generated copy of \`${entry}\``,
	'',
	'Written by `scripts/sync-skill-copies.mjs --apply` so this skill runs without the SKRAFT',
	'plugin around it. Never edit these files here: change the plugin source, then re-run the sync.',
	'',
	...files.map((file) => `- \`${file}\``),
	'',
].join('\n')

export function expectedFiles() {
	const expected = new Map()
	for (const { source, targets } of COPIES) {
		const bytes = readFileSync(join(pluginRoot, source))
		for (const target of targets) expected.set(target, bytes)
	}
	for (const { entry, targets } of BUNDLES) {
		const files = bundleFiles(entry)
		for (const target of targets) {
			for (const file of files) expected.set(posix.join(target, file), readFileSync(join(pluginRoot, 'src', file)))
			expected.set(posix.join(target, MARKER), Buffer.from(marker(entry, files)))
		}
	}
	return expected
}

function bundleRootFiles(target) {
	const dir = join(pluginRoot, target)
	if (!existsSync(dir)) return []
	const files = []
	const walk = (path) => {
		for (const entry of readdirSync(path, { withFileTypes: true })) {
			const full = join(path, entry.name)
			if (entry.isDirectory()) walk(full)
			else files.push(toPosix(relative(pluginRoot, full)))
		}
	}
	walk(dir)
	return files
}

export function check() {
	const problems = []
	const expected = expectedFiles()
	for (const [target, bytes] of expected) {
		const path = join(pluginRoot, target)
		if (!existsSync(path)) problems.push(`missing: ${target}`)
		else if (!readFileSync(path).equals(bytes)) problems.push(`stale: ${target}`)
	}
	for (const { targets } of BUNDLES) {
		for (const target of targets) {
			for (const file of bundleRootFiles(target)) if (!expected.has(file)) problems.push(`extraneous: ${file}`)
		}
	}
	return problems
}

export function apply() {
	const written = []
	for (const { targets } of BUNDLES) for (const target of targets) rmSync(join(pluginRoot, target), { recursive: true, force: true })
	for (const [target, bytes] of expectedFiles()) {
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
