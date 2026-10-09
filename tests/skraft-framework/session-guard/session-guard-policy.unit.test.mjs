import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isProtectedArtifactPath,
  commandMutatesProtectedArtifact,
  isWorkspacePath,
  commandWritesWorkspace,
  guardProtectedArtifact,
  guardOrchestratorWrite
} from '../../../plugins/skraft-framework/src/domain/session-guard-policy.mjs'
import { ORCHESTRATOR_WRITE_FORBIDDEN, STATE_WRITE_FORBIDDEN } from '../../../plugins/skraft-framework/src/domain/error-codes.mjs'

const ORCHESTRATORS = ['Skraft - Orchestrator']

// ───────────────────────────────────────────────────────────────────────────
// G7 — protected-artifact detection primitives
// ───────────────────────────────────────────────────────────────────────────

const STATE = '.copilot-tracking/skraft-plans/us11/state.json'
const LOG = '.copilot-tracking/skraft-plans/us11/execution-log.json'
const POINTER = '.copilot-tracking/skraft-plans/.active-slug'

test('isProtectedArtifactPath matches the tracked state, execution log and active pointer only', () => {
  for (const path of [STATE, `/repo/${STATE}`, 'C:\\repo\\.copilot-tracking\\skraft-plans\\us11\\state.json', LOG, `${LOG}l`, POINTER]) {
    assert.equal(isProtectedArtifactPath(path), true, path)
  }
})

test('isProtectedArtifactPath ignores every other state.json and non-strings', () => {
  for (const path of ['state.json', 'us11/state.json', 'web/src/store/state.json', 'logs/execution-log.jsonl',
    '.copilot-tracking/skraft-plans/us11/state.json.md', '.copilot-tracking/skraft-plans/us11/reviews/state.json',
    'src/app.mjs', undefined, '']) {
    assert.equal(isProtectedArtifactPath(path), false, String(path))
  }
})

test('isProtectedArtifactPath follows a custom tracking directory name', () => {
  assert.equal(isProtectedArtifactPath('/tmp/root-x/us11/state.json', { trackingDir: 'root-x' }), true)
  assert.equal(isProtectedArtifactPath('/tmp/root-x/us11/state.json'), false)
})

test('commandMutatesProtectedArtifact flags redirections, tee and in-place edits of tracked state', () => {
  for (const command of [
    `echo "{}" > ${STATE}`,
    `cat foo.json >> ${STATE}`,
    `printf "{}" | tee -a ${STATE}`,
    `sed -i 's/a/b/' ${STATE}`,
    `sed -i.bak 's/a/b/' ${LOG}`,
    `echo other > ${POINTER}`,
    `cd /repo && jq '.currentPhase="DONE"' x.json > ${STATE}`,
  ]) {
    assert.equal(commandMutatesProtectedArtifact(command), true, command)
  }
})

test('commandMutatesProtectedArtifact flags removing, moving or overwriting tracked state', () => {
  for (const command of [
    `rm -f ${STATE}`,
    `mv ${STATE} /tmp/away.json`,
    `mv /tmp/forged.json ${STATE}`,
    `cp /tmp/forged.json ${STATE}`,
    `FOO=1 sudo truncate -s0 ${LOG}`,
    `node -e "require('fs').writeFileSync('${STATE}', '{}')"`,
    `python3 -c "open('${STATE}','w').write('{}')"`,
  ]) {
    assert.equal(commandMutatesProtectedArtifact(command), true, command)
  }
})

test('commandMutatesProtectedArtifact finds the verb behind an assignment whose quoted value holds a space', () => {
  for (const command of [
    `MSG="close the phase" rm ${STATE}`,
    `env REASON='manual fix' rm -f ${STATE}`,
    `A="x y" B='z w' mv /tmp/forged.json ${STATE}`,
  ]) {
    assert.equal(commandMutatesProtectedArtifact(command), true, command)
  }
  assert.equal(commandMutatesProtectedArtifact(`MSG="read it" cat ${STATE}`), false)
})

test('commandMutatesProtectedArtifact reads quoted paths, relative targets and perl in-place edits', () => {
  for (const command of [
    `echo "{}" > "/Users/me/My Projects/${STATE}"`,
    `echo "{}" > '/Users/me/My Projects/${STATE}'`,
    `cp /tmp/forged.json "${STATE}"`,
    'cd .copilot-tracking && echo "{}" > skraft-plans/us11/state.json',
    'cd .copilot-tracking && rm skraft-plans/us11/state.json',
    "cd .copilot-tracking && sed -i 's/a/b/' skraft-plans/us11/execution-log.jsonl",
    `perl -i -pe 's/DELIVER/DONE/' ${STATE}`,
  ]) {
    assert.equal(commandMutatesProtectedArtifact(command), true, command)
  }
  assert.equal(commandMutatesProtectedArtifact(`perl -ne 'print if /DELIVER/' ${STATE}`), false, 'perl without -i or an inline -e only reads')
})

test('commandMutatesProtectedArtifact allows reads and unrelated commands on the same line', () => {
  for (const command of [
    `cat ${STATE}`,
    `jq . ${STATE}`,
    `grep currentPhase ${STATE}`,
    `cat ${STATE} > /tmp/copy.json`,
    `cp ${STATE} /tmp/backup.json`,
    `rm -rf dist; cat ${STATE}`,
    'git mv lib/state.json lib/app-state.json',
    'echo "{}" > web/src/store/state.json',
    'echo "<root>/null/state.json and never ran"',
    'node "$CLAUDE_PLUGIN_ROOT/src/cli/state.mjs" set --field adrRatification --data \'{"checkpointStatus":"none","pending":[],"ratified":[]}\'',
    undefined,
  ]) {
    assert.equal(commandMutatesProtectedArtifact(command), false, String(command))
  }
})

// ───────────────────────────────────────────────────────────────────────────
// G8 — workspace detection primitives
// ───────────────────────────────────────────────────────────────────────────

test('isWorkspacePath matches src/ and tests/ paths only', () => {
  assert.equal(isWorkspacePath('src/app.mjs'), true)
  assert.equal(isWorkspacePath('/repo/tests/foo.test.mjs'), true)
  assert.equal(isWorkspacePath('docs/site/en/index.md'), false)
  assert.equal(isWorkspacePath(undefined), false)
})

test('commandWritesWorkspace flags shell writes into src/ or tests/', () => {
  assert.equal(commandWritesWorkspace('echo x > src/app.mjs'), true)
  assert.equal(commandWritesWorkspace('rm src/old.mjs'), true)
  assert.equal(commandWritesWorkspace('cat src/app.mjs'), false)
  assert.equal(commandWritesWorkspace('ls src'), false)
})

// ───────────────────────────────────────────────────────────────────────────
// G7 — guardProtectedArtifact
// ───────────────────────────────────────────────────────────────────────────

test('guardProtectedArtifact denies a Write to state.json', () => {
  const result = guardProtectedArtifact({ filePath: STATE })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, STATE_WRITE_FORBIDDEN)
  assert.equal(result.error.reason, `direct edit of ${STATE} is forbidden; mutate recorded state only through the state CLI`)
})

test('guardProtectedArtifact denies a shell mutation of state.json', () => {
  const result = guardProtectedArtifact({ command: `echo "{}" > ${STATE}` })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, STATE_WRITE_FORBIDDEN)
  assert.match(result.error.reason, /^direct edit of a tracked state\.json.*only through the state CLI$/)
})

test('guardProtectedArtifact follows a custom tracking directory, for a file tool and a shell command', () => {
  const custom = '/tmp/root-x/us11/state.json'
  assert.equal(guardProtectedArtifact({ filePath: custom, trackingDir: 'root-x' }).ok, false)
  assert.equal(guardProtectedArtifact({ command: `rm ${custom}`, trackingDir: 'root-x' }).ok, false)
  assert.equal(guardProtectedArtifact({ command: `rm ${custom}` }).ok, true)
})

test('guardProtectedArtifact allows a read of state.json', () => {
  const result = guardProtectedArtifact({ command: `cat ${STATE}` })
  assert.equal(result.ok, true)
})

// ───────────────────────────────────────────────────────────────────────────
// G8 — guardOrchestratorWrite
// ───────────────────────────────────────────────────────────────────────────

test('guardOrchestratorWrite refuses a src/ or tests/ write by the orchestrator, naming it', () => {
  const edit = guardOrchestratorWrite({ filePath: 'src/app.mjs', agentName: 'Skraft - Orchestrator', orchestrators: ORCHESTRATORS })
  assert.equal(edit.ok, false)
  assert.equal(edit.error.code, ORCHESTRATOR_WRITE_FORBIDDEN)
  assert.equal(edit.error.reason, 'Skraft - Orchestrator never writes src/ or tests/; dispatch the phase agent that owns this change')
  const shell = guardOrchestratorWrite({ command: 'echo x > tests/foo.test.mjs', agentName: 'Skraft - Orchestrator', orchestrators: ORCHESTRATORS })
  assert.equal(shell.error.code, ORCHESTRATOR_WRITE_FORBIDDEN)
})

// The Ok reasons are what the audit log records for a conforming call.
test('guardOrchestratorWrite lets an unnamed caller write the workspace', () => {
  for (const agentName of [undefined, null, '']) {
    const result = guardOrchestratorWrite({ filePath: 'src/app.mjs', agentName, orchestrators: ORCHESTRATORS })
    assert.equal(result.ok, true)
    assert.equal(result.value.reason, 'workspace write by an unnamed caller')
  }
})

test('guardOrchestratorWrite lets any other named agent write the workspace', () => {
  const result = guardOrchestratorWrite({ filePath: 'tests/a.test.mjs', agentName: 'Skraft - Software Engineer', orchestrators: ORCHESTRATORS })
  assert.equal(result.ok, true)
  assert.equal(result.value.reason, 'workspace write by Skraft - Software Engineer')
})

test('guardOrchestratorWrite lets the orchestrator write outside the workspace', () => {
  const result = guardOrchestratorWrite({ filePath: 'docs/notes.md', command: 'cat src/app.mjs', agentName: 'Skraft - Orchestrator', orchestrators: ORCHESTRATORS })
  assert.equal(result.ok, true)
  assert.equal(result.value.reason, 'no src/ or tests/ write')
})

test('guardOrchestratorWrite refuses nobody without a configured orchestrator', () => {
  assert.equal(guardOrchestratorWrite({ filePath: 'src/app.mjs', agentName: 'Skraft - Orchestrator' }).ok, true)
})

test('commandWritesWorkspace: the in-place and scripted edits G7 recognises, and their reads', () => {
  for (const command of [
    "sed -i 's/Gold/Platinum/' src/Orders/Discount.cs",
    "perl -i -pe 's/0.10m/0.15m/' src/Orders/Discount.cs",
    `node -e "require('fs').writeFileSync('tests/a.test.mjs', '')"`,
    'touch tests/Orders.Tests/NewTests.cs',
    'ln -sf /tmp/forged.cs src/Orders/Discount.cs',
    'git rm -q src/Orders/Legacy.cs',
    'git mv tests/Old.cs "tests/New Name.cs"',
  ]) {
    assert.equal(commandWritesWorkspace(command), true, command)
  }
  for (const command of [
    "sed -n '1,20p' src/Orders/Discount.cs",
    'node --test tests/a.test.mjs',
    'grep -ri discount src/',
    'dotnet test tests/Orders.Tests',
    'node "$SKRAFT_PLUGIN_ROOT/src/cli/state.mjs" record-artifact --phase DISTILL --path tests/Orders/OrderAcceptanceTests.cs',
  ]) {
    assert.equal(commandWritesWorkspace(command), false, command)
  }
})

test('commandWritesWorkspace: every write form into src/ or tests/, and nothing else', () => {
  for (const command of [
    'echo x >src/app.mjs',
    'echo x >> "tests/a.test.mjs"',
    "echo x > 'apps/web/src/x.ts'",
    'printf x | tee src/a.mjs',
    'printf x | tee -a -i tests/a.mjs',
    'printf x | tee --append src/a.mjs',
    'truncate -s0 src/a.mjs',
    'cp /tmp/x src/a.mjs',
    'mv old.mjs tests/a.mjs',
    'vim src/a.mjs',
    'dd if=/dev/zero of=src/blob',
  ]) {
    assert.equal(commandWritesWorkspace(command), true, command)
  }
  for (const command of ['echo x > srcfoo/a.mjs', 'echo x > docs/src.md', 'cat src/a.mjs | grep x', 'ls tests', 'rm -rf dist', '']) {
    assert.equal(commandWritesWorkspace(command), false, command)
  }
})
