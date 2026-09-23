import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { verifyEvidenceLog } from '../../../plugins/skraft-framework/src/application/evidence-verification-service.mjs'

const LOG = 'track/skraft-plans/p/evidence/d/s/qg-s.json'
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

const filesOf = (entries) => ({
  read: async (path) => {
    if (!Object.hasOwn(entries, path)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return entries[path]
  },
})
const gitOf = (overrides = {}) => {
  const calls = []
  return {
    calls,
    head: () => 'aaaaaaa',
    parentOf: (sha) => { calls.push(['parentOf', sha]); return 'bbbbbbb' },
    filesOf: (sha) => { calls.push(['filesOf', sha]); return ['src/a.cs'] },
    commit: (sha) => ({ exists: sha === 'aaaaaaa', subject: 'feat(s): x', message: 'feat(s): x\n\nSigned-off-by: E <e@x>', files: ['src/a.cs'] }),
    range: (base, rev) => { calls.push(['range', base, rev]); return ['aaaaaaa'] },
    show: (sha, path) => (sha === 'bbbbbbb' ? 'a\n' : `a\nb\n`),
    ...overrides,
  }
}

test('a missing or malformed log is inconclusive without touching git', async () => {
  const git = gitOf()
  assert.deepEqual((await verifyEvidenceLog({ logPath: LOG, files: filesOf({}), git })).findings.map((f) => f.code), ['LOG_MISSING'])
  assert.deepEqual((await verifyEvidenceLog({ logPath: LOG, files: filesOf({ [LOG]: '{ nope' }), git })).findings.map((f) => f.code), ['LOG_MALFORMED'])
  assert.deepEqual(git.calls, [])
})

test('references resolve under the tracking directory, hashes are computed from the files read', async () => {
  const log = {
    $schema: 'quality-gates-evidence/v1', story: 's', produced_at: 't', tech_adapter: 'x', repo_root_rev: 'aaaaaaa',
    commits_covered: [{ sha: 'aaaaaaa', subject: 'feat(s): x', files_changed: ['src/a.cs'] }],
    gates: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].map((id) => ({ id, label: id, status: 'pass', stdout_ref: `evidence/d/s/${id}.out`, stdout_sha256: sha256(`${id} ok`), exit_code_ref: `evidence/d/s/${id}.exit` }))
      .concat([{ id: 'G7', label: 'm', status: 'pass', stdout_ref: 'evidence/d/s/G7.out', stdout_sha256: sha256('') }, { id: 'G8', label: 'c', status: 'pass' }, { id: 'G9', label: 'c', status: 'pass' }]),
    test_integrity: { cycles: [{ cycle: 1, test_files: ['t.cs'], red_commit: 'bbbbbbb', green_commit: 'aaaaaaa', red_snapshot_ref: 'evidence/d/s/r.cs', green_snapshot_ref: 'evidence/d/s/g.cs' }] },
  }
  const entries = { [LOG]: JSON.stringify(log), 'track/skraft-plans/p/evidence/d/s/G7.out': '', 'track/skraft-plans/p/evidence/d/s/r.cs': 'a\n', 'track/skraft-plans/p/evidence/d/s/g.cs': 'a\nb\n' }
  for (const id of ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']) {
    entries[`track/skraft-plans/p/evidence/d/s/${id}.out`] = `${id} ok`
    entries[`track/skraft-plans/p/evidence/d/s/${id}.exit`] = '0\n'
  }
  const git = gitOf()
  const result = await verifyEvidenceLog({ logPath: LOG, base: 'ccccccc', files: filesOf(entries), git })
  assert.deepEqual(result, { verdict: 'pass', findings: [] })
  assert.deepEqual(git.calls, [['parentOf', 'aaaaaaa'], ['filesOf', 'aaaaaaa'], ['range', 'ccccccc', 'aaaaaaa']])

  const noBase = gitOf()
  await verifyEvidenceLog({ logPath: LOG, files: filesOf(entries), git: noBase })
  assert.equal(noBase.calls.some(([name]) => name === 'range'), false, 'no base, no completeness check')
})

test('a log outside any evidence directory resolves its references as given', async () => {
  const log = { $schema: 'quality-gates-evidence/v1', story: 's', produced_at: 't', tech_adapter: 'x', repo_root_rev: 'aaaaaaa', commits_covered: [], gates: [{ id: 'G1', label: 'x', status: 'pass', stdout_ref: 'out.txt', stdout_sha256: sha256('x'), exit_code_ref: 'exit.txt' }], test_integrity: { cycles: [] } }
  const result = await verifyEvidenceLog({ logPath: 'qg.json', files: filesOf({ 'qg.json': JSON.stringify(log), 'out.txt': 'x', 'exit.txt': '0' }), git: gitOf() })
  assert.equal(result.findings.some((f) => f.gate === 'G1'), false)
})

test('log problems are reported with the path', async () => {
  const missing = await verifyEvidenceLog({ logPath: LOG, files: filesOf({}), git: gitOf() })
  assert.deepEqual(missing, { verdict: 'inconclusive', findings: [{ severity: 'inconclusive', code: 'LOG_MISSING', detail: `${LOG} is not on disk` }] })
  const malformed = await verifyEvidenceLog({ logPath: LOG, files: filesOf({ [LOG]: 'x' }), git: gitOf() })
  assert.deepEqual(malformed, { verdict: 'inconclusive', findings: [{ severity: 'inconclusive', code: 'LOG_MALFORMED', detail: `${LOG} is not JSON` }] })
})

test('an evidence-only HEAD is judged against the directory holding the log', async () => {
  const log = { $schema: 'quality-gates-evidence/v1', story: 's', produced_at: 't', tech_adapter: 'x', repo_root_rev: 'aaaaaaa', commits_covered: [], gates: [], test_integrity: { cycles: [] } }
  const onTop = (files) => gitOf({ head: () => 'ccccccc', parentOf: () => 'aaaaaaa', filesOf: () => files })
  const judged = async (git) => (await verifyEvidenceLog({ logPath: LOG, files: filesOf({ [LOG]: JSON.stringify(log) }), git })).findings.map((f) => f.code)
  assert.equal((await judged(onTop(['track/skraft-plans/p/evidence/d/s/qg-s.json']))).includes('REVISION_STALE'), false)
  assert.equal((await judged(onTop(['track/skraft-plans/p/evidence/d/s']))).includes('REVISION_STALE'), true)
  assert.equal((await judged(onTop(['track/skraft-plans/p/evidence/d/other/qg.json']))).includes('REVISION_STALE'), true)
})

test('only real SHAs and cycles reach git; a reference outside evidence/ is read as given', async () => {
  const commitCalls = []
  const reads = []
  const log = {
    $schema: 'quality-gates-evidence/v1', story: 's', produced_at: 't', tech_adapter: 'x', repo_root_rev: 'aaaaaaa',
    commits_covered: [{ sha: undefined }, null, { sha: 'aaaaaaa', subject: 'feat(s): x', files_changed: [] }],
    gates: [{ id: 'G1', label: 'x', status: 'pass', stdout_ref: 'other/out.txt', stdout_sha256: 'x', exit_code_ref: 'evidence/d/s/exit' }],
    test_integrity: { cycles: [null] },
  }
  const files = { read: async (path) => { reads.push(path); if (path === LOG) return JSON.stringify(log); throw new Error('ENOENT') } }
  await verifyEvidenceLog({ logPath: LOG, files, git: gitOf({ commit: (sha) => { commitCalls.push(sha); return { exists: true, subject: 'feat(s): x', message: '', files: [] } } }) })
  assert.deepEqual(commitCalls, ['aaaaaaa'])
  assert.deepEqual(reads, [LOG, 'other/out.txt', 'track/skraft-plans/p/evidence/d/s/exit'])
})
