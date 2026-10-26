import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { USAGE } from '../../../../plugins/skraft-framework/engine/drivers/cli/run-cli.mjs'
import { PLUGIN_ROOT, skraft, tempFolder } from '../support/workspace.mjs'

const SHIPPED = readFileSync(join(PLUGIN_ROOT, 'workflows', 'skraft.dot'), 'utf8')
const PHASES = 'phases RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH'

test('skraft workflow eject copies the plugin workflow into the working copy, check validates it, diff compares it', async (t) => {
  const cwd = tempFolder(t)

  assert.deepEqual(await skraft(cwd, ['workflow', 'check']), { status: 0, stdout: `skraft is valid: ${PHASES}\n`, stderr: '' })
  assert.deepEqual(await skraft(cwd, ['workflow', 'eject']), {
    status: 0, stdout: 'skraft-workflow.dot holds the skraft in-process workflow and skraft-config.json designates it\n', stderr: '',
  })
  const ejected = readFileSync(join(cwd, 'skraft-workflow.dot'), 'utf8')
  assert.equal(ejected, SHIPPED.replace('goal="Deliver the story"]', 'goal="Deliver the story", skraft_version="in-process"]'))
  assert.deepEqual(JSON.parse(readFileSync(join(cwd, 'skraft-config.json'), 'utf8')), { workflow: 'skraft-workflow.dot' })
  assert.deepEqual(await skraft(cwd, ['workflow', 'eject']), {
    status: 1, stdout: '', stderr: 'skraft-config.json already designates skraft-workflow.dot; edit that file\n',
  })

  writeFileSync(join(cwd, 'skraft-workflow.dot'), ejected
    .replace('  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  security [shape=box, agent="acme-security-reviewer"]')
    .replace('research -> design -> design_review_lenses\n', 'research -> design -> security\n  security -> design_review_lenses\n'))
  assert.deepEqual(await skraft(cwd, ['workflow', 'check']), {
    status: 1,
    stdout: '',
    stderr: 'skraft-workflow.dot is invalid: node security: agent acme-security-reviewer not found in the plugin, .claude/agents/ or .github/agents/\n',
  })
  mkdirSync(join(cwd, '.claude', 'agents'), { recursive: true })
  writeFileSync(join(cwd, '.claude', 'agents', 'acme-security-reviewer.md'), '---\nname: acme-security-reviewer\n---\nReview.\n')
  assert.deepEqual(await skraft(cwd, ['workflow', 'check']), { status: 0, stdout: `skraft-workflow.dot is valid: ${PHASES}\n`, stderr: '' })
  const json = await skraft(cwd, ['workflow', 'check', '--json'])
  assert.deepEqual([json.status, JSON.parse(json.stdout)], [0, { ok: true, name: 'skraft-workflow.dot', errors: [], unlocked: [], warnings: [], reason: `skraft-workflow.dot is valid: ${PHASES}` }])
  const checked = readFileSync(join(cwd, 'skraft-workflow.dot'), 'utf8')
  writeFileSync(join(cwd, 'skraft-workflow.dot'), checked.replace('agent="solution-researcher", phase="RESEARCH"]', 'agent="solution-researcher", phase="RESEARCH", model="frontier"]'))
  assert.deepEqual(await skraft(cwd, ['workflow', 'check']), {
    status: 0,
    stdout: `warning: node research: model="frontier" is masked by assign.agents.solution-researcher (researcher, the plugin's default); set "solution-researcher": null in assign.agents to let the workflow choose\nskraft-workflow.dot is valid: ${PHASES}\n`,
    stderr: '',
  })
  writeFileSync(join(cwd, 'skraft-workflow.dot'), checked)

  assert.deepEqual(await skraft(cwd, ['workflow', 'diff']), {
    status: 0,
    stdout: [
      '+ node security (agent acme-security-reviewer)',
      '+ edge design -> security',
      '+ edge security -> design_review',
      '- edge design -> design_review',
      'skraft-workflow.dot: 4 changes from the skraft in-process workflow',
      '',
    ].join('\n'),
    stderr: '',
  })
  const diff = await skraft(cwd, ['workflow', 'diff', '--json'])
  assert.deepEqual([diff.status, JSON.parse(diff.stdout).changes.length], [0, 4])
})

test('skraft workflow diff is refused without a repository workflow; a malformed workflow command is a usage error', async (t) => {
  const cwd = tempFolder(t)

  assert.deepEqual(await skraft(cwd, ['workflow', 'diff']), {
    status: 1, stdout: '', stderr: "skraft-config.json designates no workflow; the plugin's runs as shipped (skraft workflow eject copies it)\n",
  })
  const json = await skraft(cwd, ['workflow', 'diff', '--json'])
  assert.deepEqual([json.status, JSON.parse(json.stdout).ok], [1, false])
  for (const args of [['workflow'], ['workflow', 'run'], ['workflow', 'eject', '--json'], ['workflow', 'check', '--all']]) {
    assert.deepEqual(await skraft(cwd, args), { status: 2, stdout: '', stderr: `${USAGE}\n` }, args.join(' '))
  }
})
