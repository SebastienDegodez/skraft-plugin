#!/usr/bin/env node
// Scaffolds cosmic-ray-core.toml (domain + application) and cosmic-ray-boundary.toml
// (infrastructure + api) at the repository root from the src/<context>/<layer> packages.
// The core is required; with no boundary package only cosmic-ray-core.toml is written.
import { existsSync, realpathSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, renderConfig } from './gate-policy.mjs'
import { ensure, repositoryRoot } from './python-toolchain.mjs'

const SCOPES = {
	core: { file: 'cosmic-ray-core.toml', layers: ['domain', 'application'], tests: 'python -m pytest -x -q -p no:cacheprovider tests/unit' },
	boundary: { file: 'cosmic-ray-boundary.toml', layers: ['infrastructure', 'api'], tests: 'python -m pytest -x -q -p no:cacheprovider tests' },
}

export async function layerPackages(root, contexts) {
	const src = join(root, 'src')
	ensure(existsSync(src), 'No src/ directory: pass --core and --boundary module paths explicitly')
	const names = contexts ?? (await readdir(src, { withFileTypes: true })).filter((entry) => entry.isDirectory() && existsSync(join(src, entry.name, 'domain'))).map((entry) => entry.name)
	ensure(names.length > 0, 'No src/<context>/domain package found: pass --context, or --core and --boundary')
	const packages = (layers) => names.flatMap((name) => layers.map((layer) => `src/${name}/${layer}`))
	const core = packages(SCOPES.core.layers)
	const missing = core.filter((path) => !existsSync(join(root, path)))
	ensure(missing.length === 0, `Missing layer packages: ${missing.join(', ')}; pass explicit --core paths for a non-standard layout`)
	return { core, boundary: packages(SCOPES.boundary.layers).filter((path) => existsSync(join(root, path))) }
}

// Every scope is checked before the first write: a blocked run leaves no config behind.
// The core is required; a project with no boundary layer gets no boundary config.
async function plannedWrites(root, paths, force) {
	ensure(paths.core.length > 0, 'No module path for the core scope')
	const writes = []
	const skipped = []
	for (const [scope, { file, tests }] of Object.entries(SCOPES)) {
		if (paths[scope].length === 0) {
			skipped.push(`no ${scope} layer: ${file} not written`)
			continue
		}
		const text = renderConfig({ modulePaths: paths[scope], timeout: 30, testCommand: tests })
		const target = join(root, file)
		if (existsSync(target)) {
			const current = await readFile(target, 'utf8')
			if (current === text) continue
			ensure(force, `${file} exists and differs; review it, then pass --force to replace it`)
		}
		writes.push({ file, target, text })
	}
	return { writes, skipped }
}

export async function configureMutation(input) {
	const root = await repositoryRoot(input.root)
	const paths = input.core || input.boundary
		? { core: input.core ?? [], boundary: input.boundary ?? [] }
		: await layerPackages(root, input.context)
	const { writes, skipped } = await plannedWrites(root, paths, input.force)
	for (const { target, text } of writes) await writeFile(target, text)
	return { written: writes.map(({ file }) => file), skipped }
}

async function main() {
	try {
		const input = parseArgs(process.argv.slice(2), { flags: ['force'], options: ['root'], repeatable: ['context', 'core', 'boundary'] })
		ensure(input.root, '--root is required')
		const { written, skipped } = await configureMutation(input)
		process.stdout.write(written.length ? `wrote ${written.join(', ')}\n` : 'configs already up to date\n')
		for (const line of skipped) process.stdout.write(`${line}\n`)
	} catch (error) {
		process.stdout.write(`configure-mutation blocked: ${error.message}\n`)
		process.exitCode = 2
	}
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main()
