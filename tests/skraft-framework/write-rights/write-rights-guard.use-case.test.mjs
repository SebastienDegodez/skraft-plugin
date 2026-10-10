// Use case — G8, write rights per agent role (#208), through WriteRightsGuard with the
// plugin's own config: the writeRights config:build derives from phaseAgents,
// agentDispatchers and the outputs each agent declares. Each host hands the guard the
// caller it resolved (Claude Code: agent_type, or the mod's agentId → $.agent.list(); Copilot:
// the extension's sub-agent registry) and the tool calls; no file, no process.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createWriteRightsGuard } from '../../../plugins/skraft-framework/src/application/write-rights-guard.mjs'

const config = JSON.parse(readFileSync(new URL('../../../plugins/skraft-framework/skraft-framework.config.json', import.meta.url), 'utf8'))
const guard = createWriteRightsGuard({ config, trackingDir: 'skraft-plans' })

const TRACK = '.copilot-tracking/skraft-plans/checkout'
const REVIEW = `${TRACK}/reviews/2026-10-10/deliver-review-1.md`
const write = (filePath) => ({ toolName: 'Write', toolInput: { file_path: filePath, content: 'x' } })
const edit = (filePath) => ({ toolName: 'Edit', filePath, toolInput: { path: filePath } })
const shell = (command) => ({ toolName: 'Bash', toolInput: { command } })
const by = (...chain) => ({ chain })
const judge = (caller, ...calls) => guard.judge({ caller, calls, cwd: '/repo' })

// Names as each host gives them: Claude Code's agent type, Copilot's agent name or display name.
const ORCHESTRATOR = ['skraft:skraft-orchestrator', 'plugin:skraft:skraft-orchestrator', 'skraft-orchestrator', 'Skraft - Orchestrator']
const ENGINEER = ['skraft:software-engineer', 'Skraft - Software Engineer']
const DELIVER_WORKERS = ['skraft:contract-testing-worker', 'mock-integration-worker']
const REVIEWERS = ['skraft:software-engineer-reviewer', 'Skraft - Solution Architect Reviewer', 'Skraft - Acceptance Designer Reviewer']
const LENSES = ['skraft:quality-gates-lens', 'test-integrity-lens', 'architecture-boundaries-lens', 'cold-reader-lens', 'contract-fidelity-lens', 'mock-fidelity-lens']

// ── AC 1 — the orchestrator writes neither src/ nor tests/ ────────────────────────────

test('AC1: an orchestrator write to src/ or tests/ is refused, by a file tool or the shell, under every host name', () => {
  for (const name of ORCHESTRATOR) {
    for (const call of [write('src/Orders/Order.cs'), edit('tests/Orders/OrderTests.cs'), shell('echo x > src/app.ts'), shell('git checkout -- tests/'), write('C:\\repo\\src\\Orders\\Order.cs')]) {
      const verdict = judge(by(name), call)
      assert.equal(verdict.allowed, false, `${name} ${JSON.stringify(call)}`)
      assert.equal(verdict.code, 'WRITE_RIGHT_DENIED')
      assert.equal(verdict.agent, 'Skraft - Orchestrator')
    }
  }
})

test('AC1: the orchestrator writes nothing at all — the pipeline code writes state, reviews and reports', () => {
  for (const call of [write('README.md'), write(REVIEW), shell(`echo {} > ${TRACK}/decisions/x.json`)]) {
    assert.match(judge(by('Skraft - Orchestrator'), call).reason, /^Skraft - Orchestrator \(orchestrator\) writes nothing/)
  }
  assert.equal(judge(by('Skraft - Orchestrator'), shell('git status && cat src/app.ts 2>/dev/null')).allowed, true, 'reading is not writing')
})

// ── AC 2 — reviewers and lenses write only their transmission files ───────────────────

test('AC2: a reviewer writes its review and the Phase 2 files its lenses read', () => {
  const allowed = [
    write(REVIEW),
    write(`/repo/${TRACK}/reviews/2026-10-10/diff-s1.patch`),
    shell(`git diff abc..HEAD > ${TRACK}/reviews/2026-10-10/diff-s1.patch 2>/dev/null`),
    shell(`git log --format='commit %H%n%B' abc..HEAD \\\n  > ${TRACK}/reviews/2026-10-10/commits-s1.txt`),
    shell(`node "$SKRAFT_PLUGIN_ROOT/src/cli/qg-verify.mjs" --log x > ${TRACK}/reviews/2026-10-10/qg-verify-s1.json`),
    shell(`node "$SKRAFT_PLUGIN_ROOT/src/cli/artifact.mjs" review-verdict --out ${REVIEW} <<'EOF'\nsummary: coverage > 90, install the mock in src/x\n- rm the dead code in src/app.ts\nEOF`),
  ]
  for (const call of allowed) {
    const verdict = judge(by('skraft:software-engineer-reviewer'), call)
    assert.equal(verdict.allowed, true, JSON.stringify(call))
    assert.equal(verdict.code, 'CONFORMING')
  }
  assert.equal(judge(by('Skraft - Solution Architect Reviewer'), write(`${TRACK}/reviews/2026-10-10/design-review-2.md`)).allowed, true)
  assert.equal(judge(by('Skraft - Acceptance Designer Reviewer'), write(`${TRACK}/reviews/2026-10-10/distill-review-1.md`)).allowed, true)
})

test('AC2: a reviewer write outside its transmission files is refused', () => {
  for (const name of REVIEWERS) {
    for (const call of [
      write('src/Orders/Order.cs'),
      write(`${TRACK}/features/orders-checkout.feature`),
      write('docs/adr/adr-007-x.md'),
      shell('git checkout -- .'),
      shell('echo fixed > tests/a.test.ts'),
      shell('git diff > /tmp/x.patch'),
      shell(`bash <<EOF\necho x > src/a.ts\nEOF`),
    ]) {
      const verdict = judge(by(name), call)
      assert.equal(verdict.allowed, false, `${name} ${JSON.stringify(call)}`)
      assert.match(verdict.reason, /\(reviewer\) writes only /)
    }
  }
  assert.equal(judge(by('Skraft - Solution Architect Reviewer'), write(REVIEW)).allowed, false, "another reviewer's review is not its own")
})

test('AC2: a lens writes nothing, and reads freely', () => {
  for (const name of LENSES) {
    for (const call of [write(REVIEW), write('src/a.ts'), shell('cat src/a.ts > notes.txt')]) {
      assert.match(judge(by(name), call).reason, /\(lens\) writes nothing/, `${name} ${JSON.stringify(call)}`)
    }
    assert.equal(judge(by(name), shell(`grep -rn Order src/ | head -5`)).allowed, true)
  }
})

// ── AC 3 — the Software Engineer and the DELIVER workers write src/ and tests/ ────────

test('AC3: the Software Engineer and the DELIVER workers write src/ and tests/, by a file tool or the shell', () => {
  for (const name of [...ENGINEER, ...DELIVER_WORKERS]) {
    for (const call of [write('src/Orders/Order.cs'), edit('tests/Orders/OrderTests.cs'), shell('echo ok > tests/a.test.ts && mv src/a.ts src/b.ts'), write('package.json')]) {
      const verdict = judge(by(name), call)
      assert.equal(verdict.allowed, true, `${name} ${JSON.stringify(call)}`)
      assert.equal(verdict.code, 'CONFORMING')
    }
  }
  assert.equal(judge(by('skraft:software-engineer'), write(`${TRACK}/evidence/2026-10-10/s1/qg-s1.json`)).allowed, true, 'its evidence log')
})

test('AC3: the Software Engineer never writes a review: the review stays independent of the code it reviews', () => {
  for (const call of [write(REVIEW), shell(`echo 'verdict: APPROVED' > ${REVIEW}`), shell(`rm -rf ${TRACK}/reviews`)]) {
    const verdict = judge(by('skraft:software-engineer'), call)
    assert.equal(verdict.allowed, false, JSON.stringify(call))
    assert.match(verdict.reason, /transmission file/)
  }
})

test('specialists write src/ and tests/ only in a workspace phase (DISTILL, DELIVER)', () => {
  assert.equal(judge(by('skraft:acceptance-designer'), write('tests/Orders.UnitTest/Features/CheckoutAcceptanceTests.cs')).allowed, true)
  assert.equal(judge(by('skraft:acceptance-designer'), write('src/Orders/ICheckout.cs')).allowed, true, 'the stubs the RED test compiles against')
  for (const name of ['skraft:solution-architect', 'skraft:solution-researcher']) {
    const verdict = judge(by(name), write('src/Orders/Order.cs'))
    assert.equal(verdict.allowed, false, name)
    assert.match(verdict.reason, /works in (DESIGN|RESEARCH), whose agents never write src\/ or tests\//)
    assert.equal(judge(by(name), shell('touch tests/x.test.ts')).allowed, false, name)
  }
  assert.equal(judge(by('skraft:solution-architect'), write('docs/adr/adr-007-checkout.md')).allowed, true)
})

// ── AC 4 — an unidentifiable caller: fail-open, said so ───────────────────────────────

test('AC4: a caller the host cannot name passes, as UNIDENTIFIED_CALLER', () => {
  for (const caller of [null, undefined, {}]) {
    const verdict = guard.judge({ caller, calls: [write('src/Orders/Order.cs'), write(REVIEW)] })
    assert.deepEqual({ ...verdict }, {
      allowed: true, code: 'UNIDENTIFIED_CALLER', agent: null,
      reason: 'the host does not say which agent writes; write rights are not applied',
    })
  }
})

test('a named caller outside the rights passes as NOT_GOVERNED, unless a governed agent spawned it', () => {
  assert.deepEqual({ ...judge(by('general-purpose'), write('src/a.ts')) }, {
    allowed: true, code: 'NOT_GOVERNED', reason: 'general-purpose has no write rights to apply', agent: null,
  })
  assert.equal(judge(by(), write('src/a.ts')).reason, 'no agent runs this session')
  const spawned = judge(by('general-purpose', 'skraft:software-engineer-reviewer'), write('src/a.ts'))
  assert.equal(spawned.allowed, false)
  assert.equal(spawned.agent, 'Skraft - Software Engineer Reviewer')
})

test('a call that writes nothing is not judged', () => {
  for (const call of [{ toolName: 'Read', toolInput: { file_path: 'src/a.ts' } }, { toolName: 'Bash', toolInput: { command: ['rm', 'src/a.ts'] } }, {}]) {
    assert.equal(judge(by('Skraft - Orchestrator'), call).code, 'NO_WRITE')
  }
  assert.equal(guard.judge().code, 'NO_WRITE')
})

// ── AC 5 — a Copilot toolCalls batch is guarded call by call ──────────────────────────

test('AC5: one refused call refuses the whole batch; a batch within the rights passes', () => {
  const refused = judge(by('skraft:software-engineer'), write('src/a.ts'), edit('tests/a.test.ts'), write(REVIEW))
  assert.equal(refused.allowed, false)
  assert.match(refused.reason, /deliver-review-1\.md: it is a transmission file of Skraft - Software Engineer Reviewer/)
  assert.equal(judge(by('skraft:software-engineer'), write('src/a.ts'), edit('tests/a.test.ts')).allowed, true)
  assert.equal(judge(by('skraft:quality-gates-lens'), { toolName: 'Read', toolInput: { file_path: 'src/a.ts' } }, write('notes.md')).allowed, false)
})

test('the tracking directory is recognised by its name, wherever SKRAFT_TRACKING_ROOT puts it', () => {
  const elsewhere = createWriteRightsGuard({ config, trackingDir: 'plans' })
  const review = '/var/skraft/plans/checkout/reviews/2026-10-10/deliver-review-1.md'
  assert.equal(elsewhere.judge({ caller: by('skraft:software-engineer-reviewer'), calls: [write(review)] }).allowed, true)
  assert.equal(elsewhere.judge({ caller: by('skraft:software-engineer'), calls: [write(review)] }).allowed, false)
  assert.equal(guard.judge({ caller: by('skraft:software-engineer-reviewer'), calls: [write(review)] }).allowed, false, 'another tracking directory is not this one')
})

test('a relative path resolves from the session directory', () => {
  const verdict = guard.judge({ caller: by('skraft:software-engineer-reviewer'), calls: [write('deliver-review-1.md')], cwd: `/repo/${TRACK}/reviews/2026-10-10` })
  assert.equal(verdict.allowed, true)
  assert.equal(guard.judge({ caller: by('skraft:software-engineer-reviewer'), calls: [shell('cd src && echo x > a.ts')], cwd: '/repo' }).allowed, false)
})

test('a project kept under a src/ directory is not all workspace: paths are read from the session directory', () => {
  const researcher = (cwd, ...calls) => guard.judge({ caller: by('skraft:solution-researcher'), calls, cwd })
  const home = '/home/me/src/acme'
  assert.equal(researcher(home, write(`${home}/${TRACK}/research/2026-10-10/checkout-research.md`)).allowed, true)
  assert.equal(researcher(home, shell(`echo x > ${home}/docs/notes.md && rm ${home}/build/out.txt`)).allowed, true)
  assert.equal(researcher(home, write(`${home}/src/a.ts`)).allowed, false)
  assert.equal(researcher(home, shell('cd docs && rm -rf ../tests')).allowed, false)
  assert.equal(researcher(home, write('/tmp/src/a.ts')).allowed, false, 'outside the project, a src/ segment still counts')
  assert.equal(researcher('C:\\Users\\me\\src\\acme', write('C:\\Users\\me\\src\\acme\\docs\\notes.md')).allowed, true)
  assert.equal(researcher('c:\\users\\me\\src\\acme', write('C:\\Users\\me\\src\\acme\\tests\\a.ts')).allowed, false)
  assert.equal(researcher('C:\\Users\\me\\src\\acme', shell('rm C:\\Users\\me\\src\\acme\\build\\out.txt')).allowed, true, 'a Windows spelling of the session directory')
  assert.equal(researcher('/', shell('rm /src/a.ts')).allowed, false, 'the filesystem root is no project root')
  assert.equal(researcher(undefined, write(`${home}/docs/notes.md`)).allowed, false, 'without a session directory, any src/ segment counts')
})

test('a reviewer may send output to the null device, never to a file', () => {
  for (const command of ['npm test 2>/dev/null', 'npm test >/dev/stderr', 'npm test 2>nul', 'npm test >/dev/fd/2']) {
    assert.equal(judge(by('skraft:software-engineer-reviewer'), shell(command)).allowed, true, command)
  }
  assert.equal(judge(by('skraft:software-engineer-reviewer'), shell('npm test > null.txt')).allowed, false)
})

test('a here-document body is text unless a shell or an interpreter reads it as its program', () => {
  const reviewer = by('skraft:software-engineer-reviewer')
  assert.equal(judge(reviewer, shell(`git commit -F - <<EOF\nfix: rm src/a.ts > tests/x\nEOF`)).allowed, true)
  assert.equal(judge(reviewer, shell(`cat <<-EOF > ${REVIEW}\n\tverdict > x\n\tEOF`)).allowed, true, '<<- strips the tabs before the delimiter')
  for (const command of [`bash <<EOF\necho x > src/a.ts\nEOF`, `X=1 python3 - <<EOF\nopen('src/a.ts', 'w') > y\nEOF`, `cat <<'EOF' | sh -s\necho x > src/a.ts\nEOF`, `cat <<EOF\necho x > src/a.ts`]) {
    assert.equal(judge(reviewer, shell(command)).allowed, false, command)
  }
  assert.equal(judge(reviewer, shell(`node build.mjs <<EOF\nx > src/a.ts\nEOF`)).allowed, true, 'a script reads the body as its input')
})

test('a find that reaches a review, to rewrite or delete it, is a write to it', () => {
  const engineer = by('skraft:software-engineer')
  for (const command of [
    `find ${TRACK}/reviews -name '*.md' -exec sh -c 'echo APPROVED > {}' \;`,
    `find ${TRACK}/reviews -name '*.md' -delete`,
  ]) assert.equal(judge(engineer, shell(command)).allowed, false, command)
  assert.equal(judge(engineer, shell("find src -name '*.ts' -exec sed -i s/a/b/ {} +")).allowed, true)
})

test('declared files may name a placeholder, a glob within a segment, or any depth', () => {
  const custom = createWriteRightsGuard({
    config: {
      writeRights: {
        lens: { role: 'lens', phase: 'DELIVER', files: ['docs/**/notes-*.md', '.copilot-tracking/skraft-plans/{projectSlug}/reviews/{date}/lens-{story}.txt'] },
        engineer: { role: 'specialist', phase: 'DELIVER', workspace: true },
      },
    },
  })
  const lens = (call) => custom.judge({ caller: by('lens'), calls: [call], cwd: '/repo' }).allowed
  assert.equal(lens(write('docs/notes-a.md')), true)
  assert.equal(lens(write('docs/x/y/notes-b.md')), true)
  assert.equal(lens(write('docs/x/notes.md')), false)
  assert.equal(lens(write('docs/x/notes-b.md.bak')), false)
  assert.equal(lens(write(`${TRACK}/reviews/2026-10-10/lens-s1.txt`)), true)
  assert.equal(lens(write(`${TRACK}/reviews/2026-10-10/x/lens-s1.txt`)), false, 'a placeholder is one segment')
  const engineer = (call) => custom.judge({ caller: by('engineer'), calls: [call], cwd: '/repo' }).allowed
  assert.equal(engineer(write('docs/a/notes-x.md')), false, "the lens's file is no one else's")
  assert.equal(engineer(shell(`rm -rf ${TRACK}/reviews/2026-10-10`)), false, 'a directory that holds a transmission file')
  assert.equal(engineer(shell('rm -rf docs')), true, 'only a tracked file has holding directories')
})
