#!/usr/bin/env node
// Scaffolds stryker.core.json and stryker.boundary.json in the package directory from the
// layer folders found under src/: feature-first (src/<feature>/<layer>) or layer-first
// (src/<layer>). Core: domain and application. Boundary: infrastructure, ui, api, app, shared.
import { existsSync, realpathSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from './gate-policy.mjs'
import { ensure, packageRoot, repositoryRoot } from './ts-toolchain.mjs'

const SCHEMA = './node_modules/@stryker-mutator/core/schema/stryker-schema.json'
const SCOPES = {
	core: { file: 'stryker.core.json', layers: ['domain', 'application'], roots: [] },
	boundary: { file: 'stryker.boundary.json', layers: ['infrastructure', 'ui', 'api'], roots: ['app', 'shared'] },
}

export async function layerPatterns(pkg) {
	const src = join(pkg, 'src')
	ensure(existsSync(src), 'No src/ directory: pass --core and --boundary patterns explicitly')
	const entries = (await readdir(src, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
	const found = {}
	for (const [scope, { layers, roots }] of Object.entries(SCOPES)) {
		const patterns = []
		for (const layer of layers) {
			if (entries.includes(layer)) patterns.push(`src/${layer}/**/*.{ts,tsx}`)
			if (entries.some((entry) => existsSync(join(src, entry, layer)))) patterns.push(`src/*/${layer}/**/*.{ts,tsx}`)
		}
		for (const name of roots) if (entries.includes(name)) patterns.push(`src/${name}/**/*.{ts,tsx}`)
		found[scope] = patterns
	}
	ensure(found.core.length > 0, 'No application or domain folder under src/: pass --core and --boundary patterns for a non-standard layout')
	return found
}

const render = (mutate) => `${JSON.stringify({ $schema: SCHEMA, testRunner: 'vitest', mutate, coverageAnalysis: 'perTest' }, null, 2)}\n`

export async function configureMutation(input) {
	const root = await repositoryRoot(input.root)
	const pkg = await packageRoot(root, input.package)
	const patterns = input.core || input.boundary ? { core: input.core ?? [], boundary: input.boundary ?? [] } : await layerPatterns(pkg)
	const written = []
	for (const [scope, { file }] of Object.entries(SCOPES)) {
		ensure(patterns[scope].length > 0, `No pattern for the ${scope} scope`)
		const text = render(patterns[scope])
		const target = join(pkg, file)
		if (existsSync(target)) {
			if ((await readFile(target, 'utf8')) === text) continue
			ensure(input.force, `${file} exists and differs; review it, then pass --force to replace it`)
		}
		await writeFile(target, text)
		written.push(file)
	}
	return written
}

async function main() {
	try {
		const input = parseArgs(process.argv.slice(2), { flags: ['force'], options: ['root', 'package'], repeatable: ['core', 'boundary'] })
		ensure(input.root, '--root is required')
		const written = await configureMutation(input)
		process.stdout.write(written.length ? `wrote ${written.join(', ')}\n` : 'configs already up to date\n')
	} catch (error) {
		process.stdout.write(`configure-mutation blocked: ${error.message}\n`)
		process.exitCode = 2
	}
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main()
