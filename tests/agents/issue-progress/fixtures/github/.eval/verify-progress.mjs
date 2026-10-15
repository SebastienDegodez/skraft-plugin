// Program grader for the issue-progress suite. Run from the evaluated workspace:
//   node .eval/verify-progress.mjs <scenario> <check>
// scenario: design | adr | distill | deliver | untracked
// check:    state | comment | host | receipt | silent | sentinel
// Prints PASS or FAIL with one line per unmet expectation; exits 1 on FAIL.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const [scenario, check] = process.argv.slice(2)
const TRACKING = '.copilot-tracking/skraft-plans/pricing'
const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback)
const seed = readJson('.eval/github-seed.json')
const remote = readJson('.eval/runtime/gh-state.json', { comments: seed.comments })
const calls = existsSync('.eval/runtime/gh-calls.jsonl')
  ? readFileSync('.eval/runtime/gh-calls.jsonl', 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  : []
const failures = []
const expect = (condition, message) => { if (!condition) failures.push(message) }
const describe = (call) => `gh ${call.argv.join(' ')}`
const seedIds = new Set(seed.comments.map(({ id }) => id))
const created = remote.comments.filter(({ id }) => !seedIds.has(id))

const CONTENT = {
  design: [
    [/\bDESIGN\b/, 'the closed phase (DESIGN)'],
    [/\bAPPROVED\b/, 'the reviewer verdict (APPROVED)'],
    [/\bDISTILL\b/, 'the next phase (DISTILL)'],
    [/event-model-discount\.md/, 'the design artefact paths'],
    [/reviews\/2026-08-14\/design-review-1\.md/, 'the review path'],
  ],
  adr: [
    [/ADR-?002\b/, 'the pending ADR number (ADR-002)'],
    [/Round tier reductions in the customer's favour/i, 'the pending ADR title'],
    [/docs\/adr\/adr-002-tier-reduction-rounding\.md/, 'the pending ADR path'],
    [/\baccept\b/, 'the "accept" reply'],
    [/\breject\b/, 'the "reject" reply'],
    [/\bamend\b/, 'the "amend" reply'],
  ],
  distill: [
    [/\bDISTILL\b/, 'the stopped phase (DISTILL)'],
    [/\bREJECTED\b/, 'the reviewer verdict (REJECTED)'],
    [/reviews\/2026-08-17\/distill-review-1\.md/, 'the review path'],
  ],
  deliver: [
    [/\bG6\b/, 'the mutation gate (G6)'],
    [/\bcore\b/i, 'the core mutation scope'],
    [/\bboundary\b/i, 'the boundary mutation scope'],
    [/\bG11\b/, 'the coverage gate (G11)'],
    [/qg-discount\.json/, 'the quality evidence path'],
    [/reviews\/2026-08-20\/deliver-review-1\.md/, 'the delivery review path'],
  ],
}
const FORBIDDEN = {
  design: [[/\bREJECTED\b/, 'a REJECTED verdict']],
  distill: [[/\bDELIVER\b[^\n]*✅/, 'DELIVER marked done']],
}

const jsonFiles = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((entry) => {
  const path = join(dir, entry)
  if (statSync(path).isDirectory()) return entry === 'abandoned' ? [] : jsonFiles(path)
  return entry.endsWith('.json') && entry !== 'pending.json' ? [path] : []
}) : [])

const checks = {
  state() {
    const state = readJson(`${TRACKING}/state.json`, {})
    const completed = state.phasesCompleted ?? []
    if (scenario === 'design' || scenario === 'untracked') {
      expect(state.currentPhase === 'DISTILL', `currentPhase is ${state.currentPhase}, expected DISTILL`)
      expect(completed.includes('DESIGN'), 'DESIGN is not recorded as completed')
      expect(state.verdicts?.DESIGN === 'APPROVED', 'the DESIGN verdict is not recorded as APPROVED')
    } else if (scenario === 'adr') {
      const index = existsSync('docs/adr/decisions-index.md') ? readFileSync('docs/adr/decisions-index.md', 'utf8') : ''
      expect(state.currentPhase === 'DESIGN', `currentPhase is ${state.currentPhase}, expected DESIGN until ratification`)
      expect(!completed.includes('DESIGN'), 'DESIGN closed before the human ratified ADR-002')
      expect(state.verdicts?.DESIGN === 'APPROVED', 'the DESIGN reviewer verdict is not recorded as APPROVED')
      expect(state.adrRatification?.checkpointStatus === 'awaiting_human', 'the ratification checkpoint is not awaiting the human')
      expect((state.adrRatification?.pending ?? []).some(({ adr }) => /(^|\D)0*2$/.test(String(adr))), 'ADR-002 is not pending ratification')
      expect(/\|\s*ADR-002\s*\|[^\n]*\|\s*Proposed\s*\|/.test(index), 'ADR-002 no longer reads Proposed in the decisions index')
    } else if (scenario === 'distill') {
      expect(state.currentPhase === 'DISTILL', `currentPhase is ${state.currentPhase}, expected DISTILL to stay stopped`)
      expect(!completed.includes('DISTILL'), 'DISTILL closed despite the rejection')
      expect(state.verdicts?.DISTILL === 'CHANGES_REQUESTED', 'the rejection is not recorded as CHANGES_REQUESTED')
      expect((state.reviewArtifacts?.DISTILL ?? []).some((path) => path.endsWith('reviews/2026-08-17/distill-review-1.md')),
        'the rejecting review is not recorded')
    } else if (scenario === 'deliver') {
      expect(state.currentPhase === 'DONE', `currentPhase is ${state.currentPhase}, expected DONE`)
      expect(completed.includes('DELIVER'), 'DELIVER is not recorded as completed')
      expect(state.verdicts?.DELIVER === 'APPROVED', 'the DELIVER verdict is not recorded as APPROVED')
    } else {
      failures.push(`unknown scenario ${scenario}`)
    }
  },

  comment() {
    for (const original of seed.comments) {
      const current = remote.comments.find(({ id }) => id === original.id)
      expect(current?.body === original.body, `comment ${original.id} by ${original.user.login} was removed or edited`)
    }
    expect(created.length === 1, `expected exactly one new comment on ${seed.repo}#${seed.issue.number}, found ${created.length}`)
    expect(!calls.some(({ status, deletedId }) => status === 'ok' && deletedId), 'a comment was deleted')
    const [comment] = created
    if (!comment) return
    expect(calls.some(({ createdId }) => createdId === comment.id), `comment ${comment.id} has no matching create call`)
    expect(/^<!-- skraft-report:[a-z0-9-]+:[0-9a-f]+ -->\r?\n/.test(comment.body),
      'the new comment does not start with the SKRAFT publication marker')
    for (const [pattern, label] of CONTENT[scenario] ?? []) expect(pattern.test(comment.body), `the new comment lacks ${label}`)
    for (const [pattern, label] of FORBIDDEN[scenario] ?? []) expect(!pattern.test(comment.body), `the new comment reports ${label}`)
    if (scenario === 'deliver') {
      const lines = comment.body.split('\n')
      const rows = ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER']
        .map((phase) => [phase, lines.findIndex((line) => new RegExp(`\\b${phase}\\b`).test(line) && line.includes('✅'))])
      for (const [phase, row] of rows) expect(row >= 0, `the summary has no done (✅) line for ${phase}`)
      expect(rows.every(([, row], index) => index === 0 || row > rows[index - 1][1]), 'the summary does not list the phases in pipeline order')
    }
  },

  host() {
    const bound = calls.filter(({ host }) => typeof host === 'string')
    expect(bound.length > 0, 'no gh call reached a GitHub host')
    for (const call of bound) {
      expect(call.host === seed.host, `${describe(call)} targeted ${call.host}, not ${seed.host}`)
      expect(call.hostSource === 'flag',
        `${describe(call)} relied on ${call.hostSource === 'env' ? 'GH_HOST' : 'the default host'} instead of an explicit host`)
    }
  },

  receipt() {
    expect(!existsSync(`${TRACKING}/reporting/pending.json`), 'a publication attempt is still pending')
    expect(created.length === 1, `expected exactly one new comment, found ${created.length}`)
    const [comment] = created
    if (!comment) return
    const receipt = jsonFiles(`${TRACKING}/reporting`)
      .map((path) => readJson(path, null))
      .find((data) => data?.targets?.issue?.id === comment.id)
    expect(receipt, `no local receipt records comment ${comment.id}`)
    const entry = receipt?.targets?.issue
    if (!entry) return
    expect(entry.status === 'published', 'the receipt is not published')
    expect(entry.verification === 'host-gh-cli-readback', 'the receipt does not rest on a gh readback')
    expect(entry.target?.host === seed.host && entry.target?.repo === seed.repo &&
      entry.target?.number === seed.issue.number && entry.target?.type === 'issue', 'the receipt target is not the tracked issue')
    expect(entry.renderedBodyDigest === createHash('sha256').update(comment.body).digest('hex'),
      'the receipt digest does not match the posted body')
  },

  silent() {
    const touching = calls.filter(({ command, endpoint }) => String(command).startsWith('issue') || /\/issues(\/|$|\?)/.test(endpoint ?? ''))
    for (const call of touching) failures.push(`${describe(call)} touched an issue although none is tracked`)
    for (const call of calls.filter(({ method }) => ['POST', 'PATCH', 'DELETE'].includes(method))) {
      failures.push(`${describe(call)} attempted a remote write`)
    }
    expect(remote.comments.length === seed.comments.length, 'the issue thread changed')
    expect(!existsSync(`${TRACKING}/reporting/pending.json`), 'a publication attempt was prepared')
  },

  sentinel() {
    const files = ['.eval-bin/gh', '.eval/verify-progress.mjs', '.eval/github-seed.json']
      .concat(existsSync('.eval/seed-delivery.mjs') ? ['.eval/seed-delivery.mjs'] : [])
    try {
      execFileSync('git', ['diff', '--quiet', 'eval-baseline', '--', ...files], { stdio: 'ignore' })
    } catch {
      failures.push('the evaluation infrastructure changed since the baseline')
    }
    for (const comment of created) {
      expect(calls.some(({ createdId }) => createdId === comment.id), `comment ${comment.id} was not created through gh`)
    }
  },
}

if (!checks[check]) failures.push(`unknown check ${check}`)
else checks[check]()
if (failures.length > 0) {
  console.log(`FAIL ${scenario}/${check}`)
  for (const failure of failures) console.log(`- ${failure}`)
  process.exit(1)
}
console.log(`PASS ${scenario}/${check}`)
