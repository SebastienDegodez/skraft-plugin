import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, mkdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { openJournal } from '../../../../plugins/skraft-framework/engine/application/journal/run-journal.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { PLUGIN_ROOT, copilotHost, workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { git } from '../support/workspace.mjs'
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

const testCommand = (content) => content.configuration.components[0].commands.test

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

test('a configuration that could not be read once is read again on the next poll, though no watched file changed after', { ...BOUNDED, skip: process.platform === 'win32' ? 'chmod 000 does not deny reading on Windows' : false }, async (t) => {
  const { cwd, open } = await configured(t)
  const file = join(cwd, 'skraft-config.json')
  const { url } = await open()
  const stream = contentStream(t, url, await tokenOf(url))
  assert.equal((await stream.next()).configuration.status, 'ok')

  chmodSync(file, 0o000)
  t.after(() => chmodSync(file, 0o644))
  utimesSync(file, WRITTEN, new Date(WRITTEN.getTime() + 5000))
  const failed = await within(t, 5000, stream.next((content) => content.configuration.status !== 'ok'))
  assert.equal(failed.configuration?.status, 'unreadable')

  chmodSync(file, 0o644)

  const healed = await within(t, 5000, stream.next((content) => content.configuration.status === 'ok'))
  assert.equal(healed.configuration?.status, 'ok')
})

const fileOf = (content) => content.workflows[0].file

test('an ejected workflow written while the page listens is drawn on the Workflow tab, and no more once removed', BOUNDED, async (t) => {
  const { cwd, open } = await configured(t)
  const { url } = await open()
  const stream = contentStream(t, url, await tokenOf(url))
  assert.equal(fileOf(await stream.next()), null)

  mkdirSync(join(cwd, '.skraft'))
  copyFileSync(join(PLUGIN_ROOT, 'workflows', 'pipeline.skraft.dot'), join(cwd, '.skraft', 'pipeline.skraft.dot'))
  assert.equal(fileOf(await within(t, 5000, stream.next((content) => fileOf(content) !== null))), '.skraft/pipeline.skraft.dot')

  rmSync(join(cwd, '.skraft'), { recursive: true })
  assert.equal(fileOf(await within(t, 5000, stream.next((content) => fileOf(content) === null))), null)
})

test('a Git remote added while the page listens gives the forge it names', BOUNDED, async (t) => {
  const { cwd, open } = await configured(t)
  git(cwd, 'init', '-q')
  const { url } = await open()
  const stream = contentStream(t, url, await tokenOf(url))
  assert.equal((await stream.next()).configuration.forge.deduced, 'github')

  git(cwd, 'remote', 'add', 'origin', 'https://dev.azure.com/acme/mastermind/_git/mastermind')

  const shown = await within(t, 5000, stream.next((content) => content.configuration.forge.deduced !== 'github'))
  assert.equal(shown.configuration.forge.deduced, 'azure-devops')
})

test('the Workflow tab follows the active run though no workflow file changed', BOUNDED, async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const adapters = createNodeAdapters(copilotHost(cwd))
  assert.equal((await createInit(adapters).init({ slug: 'checkout' })).ok, true)
  const { journal } = /** @type {any} */ (await openJournal(adapters, 'checkout'))
  const { open } = pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home` })
  const { url } = await open()
  const stream = contentStream(t, url, await tokenOf(url))
  const research = (content) => content.workflows[0].steps.find(({ id }) => id === 'research').state
  assert.equal(research(await stream.next()), 'pending')

  await journal.append('step.started', { step: 'research', phase: 'RESEARCH', agent: 'solution-researcher', visit: 1, attempt: 1 })

  assert.equal(research(await within(t, 5000, stream.next((content) => research(content) !== 'pending'))), 'open')
})
