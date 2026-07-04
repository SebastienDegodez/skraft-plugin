import { test } from 'node:test'
import assert from 'node:assert/strict'
import { remoteMain } from '../../plugins/src/cli/check-freshness.mjs'

// Cross-harness staleness check: the SessionStart notice only exists inside
// Claude Code (hooks); Copilot/Cursor users run `check-freshness-bin --remote`
// manually. Reader is injected — no network in tests.

const reader = (latest) => ({ latestVersion: async () => latest })

const capture = () => {
  const out = []
  const errs = []
  return { io: { log: (...a) => out.push(a.join(' ')), error: (...a) => errs.push(a.join(' ')) }, out, errs }
}

test('remoteMain: reports the available update when installed lags latest', async () => {
  const { io, out } = capture()
  const code = await remoteMain({ installedVersion: '1.0.0', releaseReader: reader('v1.2.0') }, io)
  assert.equal(code, 0)
  assert.ok(out.some((l) => l.includes('1.2.0') && l.includes('1.0.0')))
})

test('remoteMain: reports up to date when versions match', async () => {
  const { io, out } = capture()
  const code = await remoteMain({ installedVersion: '1.2.0', releaseReader: reader('v1.2.0') }, io)
  assert.equal(code, 0)
  assert.ok(out.some((l) => /up to date/i.test(l)))
})

test('remoteMain: fails open with a clear message when latest is unknown', async () => {
  const { io, out } = capture()
  const code = await remoteMain({ installedVersion: '1.0.0', releaseReader: reader(null) }, io)
  assert.equal(code, 0)
  assert.ok(out.some((l) => /unknown|could not/i.test(l)))
})

test('remoteMain: --json emits machine-readable status', async () => {
  const { io, out } = capture()
  const code = await remoteMain({ installedVersion: '1.0.0', releaseReader: reader('v1.2.0'), json: true }, io)
  assert.equal(code, 0)
  const status = JSON.parse(out.join('\n'))
  assert.equal(status.installed, '1.0.0')
  assert.equal(status.latest, 'v1.2.0')
  assert.equal(status.stale, true)
})
