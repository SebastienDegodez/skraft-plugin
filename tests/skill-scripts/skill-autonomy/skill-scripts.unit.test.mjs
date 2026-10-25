import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const plugins = fileURLToPath(new URL('../../../plugins/', import.meta.url))
const skillFolders = readdirSync(plugins)
	.filter((plugin) => existsSync(join(plugins, plugin, 'skills')))
	.flatMap((plugin) => readdirSync(join(plugins, plugin, 'skills')).map((skill) => ({ plugin, skill, folder: join(plugins, plugin, 'skills', skill) })))

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
