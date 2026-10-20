import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const skills = fileURLToPath(new URL('../../../plugins/skraft-framework/skills/', import.meta.url))

test('every skill runs its own scripts from its own folder', () => {
	for (const skill of readdirSync(skills)) {
		const folder = join(skills, skill)
		const docs = ['SKILL.md', ...(existsSync(join(folder, 'references')) ? readdirSync(join(folder, 'references')).map((name) => `references/${name}`) : [])]
		for (const doc of docs) {
			if (!doc.endsWith('.md') || !existsSync(join(folder, doc))) continue
			const text = readFileSync(join(folder, doc), 'utf8')
			assert.doesNotMatch(text, /\$SKRAFT_PLUGIN_ROOT\/skills\//, `${skill}/${doc} reaches a skill script through the plugin root`)
			for (const [, script] of text.matchAll(/<skill>\/scripts\/([\w./-]+?\.(?:mjs|sh|ps1))/g)) {
				assert.ok(existsSync(join(folder, 'scripts', script)), `${skill}/${doc} runs scripts/${script}, which this skill does not ship`)
			}
		}
	}
})
