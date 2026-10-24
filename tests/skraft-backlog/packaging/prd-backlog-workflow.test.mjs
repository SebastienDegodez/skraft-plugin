// The skraft-prd-backlog dynamic workflow ships inside skraft-backlog: its Copilot extension, the
// agents and skills its briefs name, and nothing from the engineering plugin.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LENSES, sliceBrief, storyBrief } from '../../../plugins/skraft-backlog/prd-backlog/briefs.mjs'
import { PRD_BACKLOG_META } from '../../../plugins/skraft-backlog/prd-backlog/workflow.mjs'

const root = fileURLToPath(new URL('../../../plugins/skraft-backlog/', import.meta.url))
const read = (path) => readFileSync(join(root, path), 'utf8')
const extension = 'com.github.copilot/extensions/skraft-prd-backlog'

test('the Copilot extension registers the workflow under the name of its manifest, and the backlog canvas', () => {
  assert.equal(JSON.parse(read(`${extension}/copilot-extension.json`)).name, PRD_BACKLOG_META.name)
  const entry = read(`${extension}/extension.mjs`)
  assert.match(entry, /import \{ CanvasError, createCanvas, defineWorkflow, joinSession \} from '@github\/copilot-sdk\/extension'/)
  assert.match(entry, /from '\.\.\/\.\.\/\.\.\/prd-backlog\/workflow\.mjs'/)
  assert.match(entry, /from '\.\.\/\.\.\/\.\.\/prd-backlog\/canvas\/canvas\.mjs'/)
  assert.match(entry, /canvases: \[canvas\]/)
  for (const target of ['workflow.mjs', 'canvas/canvas.mjs', 'publish.mjs']) assert.ok(existsSync(join(root, extension, '../../../prd-backlog', target)), target)
})

test('the workflow declares its phases and requires the PRD', () => {
  assert.deepEqual(PRD_BACKLOG_META.phases.map((p) => p.title), ['INVENTORY', 'FRAME', 'SLICE', 'CORRECT', 'ELABORATE', 'REVIEW', 'HANDOFF', 'PUBLISH'])
  assert.deepEqual(PRD_BACKLOG_META.argsSchema.required, ['prd'])
  for (const arg of Object.keys(PRD_BACKLOG_META.argsSchema.properties)) assert.match(PRD_BACKLOG_META.description, new RegExp(`${arg}\\?*:`), arg)
})

test('every agent the workflow dispatches ships in both agent trees, every skill a brief names ships too', () => {
  const agents = ['backlog-slicer', 'story-writer', ...LENSES.map((l) => l.agent)]
  for (const agent of agents) {
    assert.ok(existsSync(join(root, 'com.github.copilot/agents', `${agent}.agent.md`)), `${agent} (Copilot)`)
    assert.ok(existsSync(join(root, 'com.anthropic.claude-code/agents', `${agent}.md`)), `${agent} (Claude Code)`)
  }
  const briefs = [sliceBrief({ prd: 'p', inventory: 'i', output: 'o', language: 'fr', attempt: 1, problems: [] }),
    storyBrief({ prd: 'p', map: 'm', story: 's', epic: 'e', output: 'o', language: 'fr', attempt: 1, problems: [], findings: [] })]
  for (const [, skill] of briefs.join('\n').matchAll(/the skill `([\w-]+)`|loads `([\w-]+)`/g)) {
    if (skill) assert.ok(existsSync(join(root, 'skills', skill, 'SKILL.md')), skill)
  }
  assert.ok(existsSync(join(root, 'skills/backlog-slicing/SKILL.md')))
  assert.ok(existsSync(join(root, 'skills/story-elaboration/SKILL.md')))
})

test('the workflow and canvas code import nothing outside skraft-backlog but Node', () => {
  const files = readdirSync(join(root, 'prd-backlog'), { recursive: true }).map(String).filter((f) => f.endsWith('.mjs'))
  assert.ok(files.includes(join('canvas', 'ui', 'app.mjs')), 'the canvas panel script ships')
  for (const file of files) {
    for (const [, target] of read(`prd-backlog/${file}`).matchAll(/from '([^']+)'/g)) {
      if (target.startsWith('node:')) continue
      const resolved = resolve(dirname(join(root, 'prd-backlog', file)), target)
      assert.ok(target.startsWith('.') && resolved.startsWith(root) && existsSync(resolved), `${file} imports ${target}`)
    }
  }
})
