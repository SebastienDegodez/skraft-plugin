import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { runSession } from '../../../cli/src/session.mjs'

/**
 * A terminal stand-in: a readable stream with the TTY calls a session makes, recording the
 * raw mode and whether the stream is reading at each moment.
 */
const fakeTerminal = () => {
  const input = new PassThrough()
  input.isTTY = true
  input.isRaw = false
  input.setRawMode = (raw) => {
    input.isRaw = raw
    return input
  }
  const output = new PassThrough()
  output.isTTY = true
  output.columns = 80
  output.resume()
  return { input, output }
}

test('while a command runs, the session hands the terminal over: no raw mode, no reading, so Ctrl-C reaches the command', async () => {
  const { input, output } = fakeTerminal()
  const seen = []
  const run = async (args) => {
    seen.push({ args, raw: input.isRaw, reading: !input.isPaused() })
    return 0
  }
  const ended = runSession({ input, output, terminal: true, catalog: [{ command: 'next' }], run, say: () => {} })
  const rawAtPrompt = input.isRaw

  input.write('next\r')
  await new Promise((resolve) => setTimeout(resolve, 50))
  const rawAfter = input.isRaw
  input.write('exit\r')
  await ended

  assert.equal(rawAtPrompt, true)
  assert.deepEqual(seen, [{ args: ['next'], raw: false, reading: false }])
  assert.equal(rawAfter, true)
})
