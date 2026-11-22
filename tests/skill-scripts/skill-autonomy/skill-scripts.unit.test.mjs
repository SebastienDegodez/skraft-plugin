import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

const plugins = fileURLToPath(new URL('../../../plugins/', import.meta.url))
const skillFolders = readdirSync(plugins)
	.filter((plugin) => existsSync(join(plugins, plugin, 'skills')))
	.flatMap((plugin) => readdirSync(join(plugins, plugin, 'skills')).map((skill) => ({ plugin, skill, folder: join(plugins, plugin, 'skills', skill) })))

/** Every `.mjs` file under a skill's `scripts/` folder, at any depth. @param {string} folder @returns {string[]} */
const scriptsUnder = (folder) => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
	const path = join(folder, entry.name)
	if (entry.isDirectory()) return scriptsUnder(path)
	return entry.name.endsWith('.mjs') ? [path] : []
})

test('a skill script imported by another module runs nothing: it exits 0 and prints nothing', (t) => {
	const cwd = mkdtempSync(join(tmpdir(), 'skraft skill script import '))
	t.after(() => rmSync(cwd, { recursive: true, force: true }))
	const scripts = skillFolders.filter(({ folder }) => existsSync(join(folder, 'scripts'))).flatMap(({ folder }) => scriptsUnder(join(folder, 'scripts')))
	assert.ok(scripts.length > 20, `only ${scripts.length} skill scripts found`)
	const loud = scripts.flatMap((script) => {
		const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(script).href)})`], { cwd, encoding: 'utf8', timeout: 30_000 })
		return imported.status === 0 && imported.stdout === '' && imported.stderr === '' ? [] : [`${relative(plugins, script)}: exit ${imported.status}, stdout ${JSON.stringify(imported.stdout.slice(0, 80))}, stderr ${JSON.stringify(imported.stderr.slice(0, 80))}`]
	})
	assert.deepEqual(loud, [])
})

test('every skill runs its own scripts from its own folder', () => {
	assert.ok(skillFolders.some(({ plugin }) => plugin === 'skraft-brownfield'), 'expected the brownfield plugin skills in the scan')
	for (const { plugin, skill, folder } of skillFolders) {
		const docs = ['SKILL.md', ...(existsSync(join(folder, 'references')) ? readdirSync(join(folder, 'references')).map((name) => `references/${name}`) : [])]
		for (const doc of docs) {
			if (!doc.endsWith('.md') || !existsSync(join(folder, doc))) continue
			const text = readFileSync(join(folder, doc), 'utf8')
			assert.doesNotMatch(text, /\$SKRAFT_PLUGIN_ROOT\/skills\//, `${plugin}/${skill}/${doc} reaches a skill script through the plugin root`)
			assert.doesNotMatch(text, /plugins\/skraft-[\w-]+\//, `${plugin}/${skill}/${doc} reaches another plugin by path; name the skill instead`)
			for (const [, script] of text.matchAll(/<skill>\/scripts\/([\w./-]+?\.(?:mjs|sh|ps1))/g)) {
				assert.ok(existsSync(join(folder, 'scripts', script)), `${plugin}/${skill}/${doc} runs scripts/${script}, which this skill does not ship`)
			}
		}
	}
})
