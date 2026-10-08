import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { test } from 'node:test'
import { BUNDLES, bundleFiles, check, pluginRoot } from '../../../scripts/sync-skill-copies.mjs'

const skills = join(pluginRoot, 'skills')

// Stryker rewrites the sources it copies into its sandbox (instrumentation, type-check
// pragmas), so faithful copies read as stale there; the copy check runs outside it.
const inStrykerSandbox = pluginRoot.split(sep).includes('.stryker-tmp')

test('every copied script and document matches its source (npm run skills:sync)', { skip: inStrykerSandbox && 'sources are rewritten in the Stryker sandbox' }, () => {
	assert.deepEqual(check(), [])
})

test('a bundle holds its CLI and every module that CLI imports', () => {
	const files = bundleFiles('src/cli/qg-verify.mjs')
	assert.ok(files.includes('cli/qg-verify.mjs'))
	assert.ok(files.includes('domain/evidence-verification-policy.mjs'))
	assert.ok(bundleFiles('src/cli/report.mjs').includes('domain/state.schema.json'))
	for (const { targets } of BUNDLES) for (const target of targets) assert.ok(existsSync(join(pluginRoot, target, 'GENERATED.md')))
})

function markdown(folder) {
	const out = []
	for (const entry of readdirSync(folder, { withFileTypes: true })) {
		const path = join(folder, entry.name)
		if (entry.isDirectory()) out.push(...markdown(path))
		else if (entry.name.endsWith('.md')) out.push(path)
	}
	return out
}

test('no skill links a file outside its own folder: other skills are named, shared files are copied in', () => {
	const leaks = []
	for (const skill of readdirSync(skills)) {
		const root = join(skills, skill)
		for (const file of markdown(root)) {
			for (const [, target] of readFileSync(file, 'utf8').matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
				if (/^(https?:|mailto:)/.test(target)) continue
				const resolved = resolve(dirname(file), target)
				const inside = relative(root, resolved)
				if (inside.startsWith('..') || inside.split(sep)[0] === '..') leaks.push(`${relative(skills, file)} -> ${target}`)
			}
		}
	}
	assert.deepEqual(leaks, [])
})

test('no skill reaches the plugin through SKRAFT_PLUGIN_ROOT or a plugin-relative path', () => {
	const leaks = []
	for (const skill of readdirSync(skills)) {
		for (const file of markdown(join(skills, skill))) {
			const text = readFileSync(file, 'utf8')
			if (/\$\{?SKRAFT_PLUGIN_ROOT\}?|\$\{?CLAUDE_PLUGIN_ROOT\}?/.test(text) && !file.endsWith('GENERATED.md')) leaks.push(relative(skills, file))
		}
	}
	assert.deepEqual(leaks, [])
})
