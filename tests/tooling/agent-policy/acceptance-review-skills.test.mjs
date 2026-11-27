import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), '../../../plugins/skraft-framework')
const LENSES = ['coverage', 'business-alignment', 'testability', 'boundary-enforcement']
const HOSTS = [['com.anthropic.claude-code', '.md'], ['com.github.copilot', '.agent.md']]

/** The names a descriptor's front matter lists under `skills:`. @param {string} path */
const skillsOf = (path) => {
  const front = readFileSync(join(PLUGIN, path), 'utf8').split('\n---')[0]
  const block = front.slice(front.indexOf('\nskills:\n') + '\nskills:\n'.length)
  return block.split('\n').filter((line) => /^\s+- /.test(line)).map((line) => line.replace(/^\s+- /, '').trim())
}

test('each DISTILL lens loads the shared review criteria and the skill of its own gates, on both hosts', () => {
  for (const [host, ext] of HOSTS) {
    for (const lens of LENSES) {
      assert.deepEqual(skillsOf(`${host}/agents/${lens}-lens${ext}`), ['acceptance-review-criteria', `acceptance-review-${lens}`], `${host} ${lens}-lens`)
    }
  }
})

test('the acceptance designer loads the shared review criteria and every gate skill, on both hosts', () => {
  for (const [host, ext] of HOSTS) {
    const skills = skillsOf(`${host}/agents/acceptance-designer${ext}`)
    for (const name of ['acceptance-review-criteria', ...LENSES.map((lens) => `acceptance-review-${lens}`)]) {
      assert.ok(skills.includes(name), `${host} acceptance-designer lacks ${name}`)
    }
  }
})
