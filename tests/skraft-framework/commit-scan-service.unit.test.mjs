import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCommitScanService } from '../../plugins/src/application/commit-scan-service.mjs'

const stubReader = (commits) => ({ listRecent: async () => commits })

test('commit-scan-service: scanRecent reports total and flags non-conventional commits', async () => {
  const service = createCommitScanService({
    commitLogReader: stubReader([
      { sha: 'a1', subject: 'feat(cli): add scan-commits subcommand' },
      { sha: 'b2', subject: 'Copilot CLI session xyz changes' },
      { sha: 'c3', subject: 'test(cli): assert scan-commits flags stray commits' },
    ])
  })

  const result = await service.scanRecent(20)

  assert.equal(result.total, 3)
  assert.deepEqual(result.nonConventional, [{ sha: 'b2', subject: 'Copilot CLI session xyz changes' }])
})

test('commit-scan-service: scanRecent returns an empty nonConventional list when all commits comply', async () => {
  const service = createCommitScanService({
    commitLogReader: stubReader([{ sha: 'a1', subject: 'fix(cli): correct off-by-one error' }])
  })

  const result = await service.scanRecent(20)

  assert.equal(result.total, 1)
  assert.deepEqual(result.nonConventional, [])
})

test('commit-scan-service: scanRecent delegates the requested count to the reader', async () => {
  let requestedCount
  const service = createCommitScanService({
    commitLogReader: { listRecent: async (count) => { requestedCount = count; return [] } }
  })

  await service.scanRecent(5)

  assert.equal(requestedCount, 5)
})
