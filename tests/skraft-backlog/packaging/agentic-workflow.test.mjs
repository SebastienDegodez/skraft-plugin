// The skraft-refine workflow ships as a gh-aw package inside the plugin. It owns its prompt and
// its triggers; everything else comes from the plugin's own skills, pinned to its release.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { check } from '../../../scripts/sync-backlog-copies.mjs'

const root = fileURLToPath(new URL('../../../plugins/skraft-backlog/', import.meta.url))
const read = (path) => readFileSync(join(root, path), 'utf8')
const version = JSON.parse(read('plugin.json')).version
const workflow = read('workflows/skraft-refine.md')
const frontmatter = workflow.split('---\n')[1]

test('the workflow runs the same marker check the skill ships, byte for byte', () => {
  assert.deepEqual(check(), [])
})

test('every skill the workflow installs is a skill of this plugin, pinned to this release', () => {
  const packages = [...frontmatter.matchAll(/^\s+- SebastienDegodez\/skraft-plugin\/plugins\/skraft-backlog\/skills\/([\w-]+)#v(\S+)$/gm)]
  assert.ok(packages.length >= 5, 'the workflow installs its skills through shared/apm.md')
  for (const [, skill, pin] of packages) {
    assert.ok(existsSync(join(root, 'skills', skill, 'SKILL.md')), `the workflow installs ${skill}, which the plugin does not ship`)
    assert.equal(pin, version, `${skill} is pinned to v${pin}, not to the plugin version`)
  }
  for (const needed of ['refinement-proposal', 'issue-refinement', 'issue-triage', 'github-issue-search', 'planning-review-criteria', 'backlog-review-lenses']) {
    assert.ok(packages.some(([, skill]) => skill === needed), `the workflow does not install ${needed}`)
  }
})

test('the pre-activation check compares the marker with this release', () => {
  assert.match(frontmatter, new RegExp(`SKRAFT_BACKLOG_VERSION: "${version.replaceAll('.', '\\.')}"`))
})

test('the workflow defines inline the three lenses of a refine review', () => {
  for (const lens of ['planning-invest-lens', 'planning-ac-quality-lens', 'planning-dor-lens']) {
    assert.match(workflow, new RegExp(`^## agent: \`${lens}\`$[\\s\\S]*?^## end agent: \`${lens}\`$`, 'm'), lens)
  }
})

test('the triggers: new issue, label, slash command, and by hand with an issue number and force', () => {
  for (const pattern of [/issues:\n\s+types: \[opened\]/, /slash_command:\n\s+name: skraft-refine/, /label_command:\n\s+name: skraft-refine/,
    /workflow_dispatch:\n\s+inputs:\n\s+issue_number:/, /force:\n\s+description: .+\n\s+required: false\n\s+type: boolean/, /reaction: eyes/]) {
    assert.match(frontmatter, pattern)
  }
})

test('the workflow writes nothing but one comment, through safe outputs', () => {
  assert.match(frontmatter, /^permissions:\n\s+contents: read\n\s+issues: read$/m)
  assert.match(frontmatter, /safe-outputs:\n\s+add-comment:\n\s+max: 1/)
  assert.doesNotMatch(frontmatter, /add-labels|create-issue|update-issue|write/)
})

test('the gh-aw package installs the workflow and the marker check it runs before the agent', () => {
  const manifest = read('aw.yml')
  assert.match(manifest, /^includes:\n\s+- workflows\/skraft-refine\.md$/m)
  assert.match(manifest, /source: workflows\/shared\/skraft-refine-marker\.mjs\n\s+destination: \.github\/workflows\/shared\/skraft-refine-marker\.mjs/)
  assert.match(workflow, /sparse-checkout: \.github\/workflows\/shared\/skraft-refine-marker\.mjs/)
  assert.ok(existsSync(join(root, 'workflows/shared/apm.md')), 'the vendored shared/apm.md travels with the workflow')
  assert.ok(existsSync(join(root, 'README.md')), 'a gh-aw package needs a README')
})
