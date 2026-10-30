import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { BOUNDED, contentStream, pipelineCanvas, tokenOf, within } from './canvas-host.mjs'

/** The configuration file of a one-component working copy whose test command is `test`. */
const configurationWith = (test) => JSON.stringify({
  publish: { pullRequest: false },
  components: [{ name: 'mastermind-api', root: '.', stack: 'dotnet', commands: { build: 'dotnet build', test } }],
})

/** A whole-second time: a time set back from a Date keeps no sub-millisecond part, so it is the stamp it had. */
const WRITTEN = new Date('2026-01-01T00:00:00Z')

/** A working copy with one .NET component, and the canvas of a session in it. */
const configured = async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  writeFileSync(join(cwd, 'skraft-config.json'), configurationWith('make test'))
  utimesSync(join(cwd, 'skraft-config.json'), WRITTEN, WRITTEN)
  return { cwd, ...pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home` }) }
}

/** A frame that carries content, not a comment or an event. @param {Record<string, string>} frame */
const isContent = (frame) => frame.data !== undefined && frame.event === undefined

const testCommand =(content) => content.configuration.components[0].commands.test

test('the page gets the configuration again only once one of its files changed time or size: a write that keeps both is not read, the same file with a new time is', BOUNDED, async (t) => {
  const { cwd, open } = await configured(t)
  const { url } = await open()
  const stream = contentStream(t, url, await tokenOf(url))
  assert.equal(testCommand(await stream.next()), 'make test')
  await stream.frame(isContent)
  const file = join(cwd, 'skraft-config.json')
  const before = statSync(file)
  writeFileSync(file, configurationWith('make lint'))
  utimesSync(file, before.atime, before.mtime)
  assert.equal(statSync(file).size, before.size)

  assert.equal(await stream.frame(isContent, 300), null)

  utimesSync(file, before.atime, new Date(before.mtimeMs + 2000))
  const shown = await within(t, 5000, stream.next())
  assert.equal(testCommand(shown), 'make lint')
})
