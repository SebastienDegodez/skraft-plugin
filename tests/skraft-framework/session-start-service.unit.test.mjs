import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSessionStartService } from '../../plugins/src/application/session-start-service.mjs'

const reader = (latest) => ({ latestVersion: async () => latest })

test('session-start: injects a one-line additionalContext when the plugin is stale', async () => {
  const service = createSessionStartService({ releaseReader: reader('v1.2.0'), installedVersion: '1.0.0' })
  const result = await service.handle({})
  assert.equal(result.hookSpecificOutput.hookEventName, 'SessionStart')
  const notice = result.hookSpecificOutput.additionalContext
  assert.equal(notice.split('\n').length, 1)
  assert.ok(notice.includes('1.2.0'))
  assert.ok(notice.includes('claude plugin update'))
})

test('session-start: stays silent (undefined) when up to date', async () => {
  const service = createSessionStartService({ releaseReader: reader('v1.0.0'), installedVersion: '1.0.0' })
  assert.equal(await service.handle({}), undefined)
})

test('session-start: stays silent when the latest version is unknown (fail-open)', async () => {
  const service = createSessionStartService({ releaseReader: reader(null), installedVersion: '1.0.0' })
  assert.equal(await service.handle({}), undefined)
})

test('session-start: stays silent when the reader itself throws (fail-open, ADR-006)', async () => {
  const service = createSessionStartService({
    releaseReader: { latestVersion: async () => { throw new Error('boom') } },
    installedVersion: '1.0.0'
  })
  assert.equal(await service.handle({}), undefined)
})

test('session-start: stays silent when the installed version is unknown', async () => {
  const service = createSessionStartService({ releaseReader: reader('v2.0.0'), installedVersion: undefined })
  assert.equal(await service.handle({}), undefined)
})
