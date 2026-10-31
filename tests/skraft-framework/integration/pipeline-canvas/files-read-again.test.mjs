import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { openJournal } from '../../../../plugins/skraft-framework/engine/application/journal/run-journal.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { copilotHost, workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { git } from '../support/workspace.mjs'
import { BOUNDED, contentStream, pipelineCanvas, pluginCopy, tokenOf, within } from './canvas-host.mjs'

/** The configuration file of a one-component working copy whose test command is `test`. */
const configurationWith = (test) => JSON.stringify({
  publish: { pullRequest: false },
  components: [{ name: 'mastermind-api', root: '.', stack: 'dotnet', commands: { build: 'dotnet build', test } }],
})

/** A frame that carries content, not a comment or an event. @param {Record<string, string>} frame */
const isContent = (frame) => frame.data !== undefined && frame.event === undefined

const testCommand = (content) => content.configuration.components[0].commands.test

/** A working copy (a Git repository, as a developer's is) with one component, and the canvas of a session in it. */
const configured = async (t, more = {}) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  git(cwd, 'init', '-q')
  writeFileSync(join(cwd, 'skraft-config.json'), configurationWith('make test'))
  return { cwd, ...pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home`, more }) }
}

const PLUGIN_AGENTS = ['com.github.copilot/agents/solution-researcher.agent.md', 'com.anthropic.claude-code/agents/solution-researcher.md']

test('a configuration file edited while the page listens is shown, and the same bytes written again with a new modification time are not read again', BOUNDED, async (t) => {
  const plugin = pluginCopy(t)
  const { cwd, open } = await configured(t, { pluginRoot: plugin })
  const { url } = await open()
  const token = await tokenOf(url)
  const stream = contentStream(t, url, token)
  const first = JSON.parse((await stream.frame(isContent)).data)
  assert.equal(testCommand(first), 'make test')
  assert.notEqual(first.configuration.models.agents, null)
  const file = join(cwd, 'skraft-config.json')

  // Only a read shows that the plugin's agent is gone: the plugin changes nothing a person edits.
  for (const descriptor of PLUGIN_AGENTS) rmSync(join(plugin, ...descriptor.split('/')))
  writeFileSync(file, configurationWith('make test'))
  utimesSync(file, new Date(statSync(file).mtimeMs + 5000), new Date(statSync(file).mtimeMs + 5000))

  assert.equal(await stream.frame(isContent, 1000), null)

  writeFileSync(file, configurationWith('make lint'))
  const shown = await within(t, 10_000, stream.next((content) => testCommand(content) === 'make lint'))
  assert.notEqual(shown, 'still waiting')
  assert.equal(shown.configuration.models.agents, null)
})

test('the Workflow tab follows the active run though no workflow file changed', BOUNDED, async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  git(cwd, 'init', '-q', '-b', 'main')
  git(cwd, 'commit', '-q', '--allow-empty', '-m', 'start')
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

for (const folder of ['.claude', '.github']) {
  test(`a skill written while the page listens in ${folder}/skills is known to the Configuration tab`, BOUNDED, async (t) => {
    const plugin = pluginCopy(t)
    const { cwd, open } = await configured(t, { pluginRoot: plugin })
    const { url } = await open()
    const stream = contentStream(t, url, await tokenOf(url))
    assert.notEqual(JSON.parse((await stream.frame(isContent)).data).configuration.models.agents, null)
    // The plugin's agent goes: only a read of the Configuration tab shows it, and the new skill must cause that read.
    for (const descriptor of PLUGIN_AGENTS) rmSync(join(plugin, ...descriptor.split('/')))
    assert.equal(await stream.frame(isContent, 1000), null)

    mkdirSync(join(cwd, folder, 'skills', 'acme-rules'), { recursive: true })
    writeFileSync(join(cwd, folder, 'skills', 'acme-rules', 'SKILL.md'), '---\nname: acme-rules\n---\n')

    assert.notEqual(await within(t, 10_000, stream.next((content) => content.configuration.models.agents === null)), 'still waiting')
  })
}

const NO_CHMOD = process.platform === 'win32' ? 'chmod 000 does not deny reading on Windows' : process.getuid?.() === 0 ? 'chmod 000 does not deny reading to root' : false

/**
 * A `git` first on the PATH that writes its arguments to a file and runs the real one: how often a
 * read of the configuration asks Git for the remote is how often the tabs were read.
 * @param {import('node:test').TestContext} t @param {string} realGit
 */
const watchedGit = (t, realGit) => {
  const folder = mkdtempSync(join(tmpdir(), 'skraft-watched-git-'))
  const log = join(folder, 'calls.log')
  writeFileSync(join(folder, 'git'), `#!/bin/sh\necho "$@" >> "${log}"\nexec "${realGit}" "$@"\n`, { mode: 0o755 })
  const path = process.env.PATH
  process.env.PATH = `${folder}${delimiter}${path}`
  t.after(() => { process.env.PATH = path; rmSync(folder, { recursive: true, force: true }) })
  return () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter((line) => line.includes(" remote")).length : 0)
}

const NO_SHELL_GIT = process.platform === 'win32' ? 'the watched git is a shell script' : false

test('an ejected workflow the engine refuses shows no workflow, and while nothing a person edits changes the tabs are not read again', { ...BOUNDED, skip: NO_SHELL_GIT }, async (t) => {
  const { cwd, open } = await configured(t)
  mkdirSync(join(cwd, '.skraft'))
  writeFileSync(join(cwd, '.skraft', 'pipeline.skraft.dot'), 'digraph { this is not a workflow')
  const remoteAsks = watchedGit(t, execFileSync('which', ['git'], { encoding: 'utf8' }).trim())
  const { url } = await open()
  const stream = contentStream(t, url, await tokenOf(url))
  const first = JSON.parse((await stream.frame(isContent)).data)
  assert.deepEqual(first.workflows, [])
  assert.equal(first.configuration.status, 'ok')
  const asked = remoteAsks()
  assert.equal(asked > 0, true)

  // The test host polls every 20 ms (canvas-host.mjs): a second is about fifty polls, so a read repeated on each poll shows.
  await delay(1000, undefined, { signal: t.signal, ref: false })

  assert.equal(remoteAsks(), asked)
})



test('a read that threw is not kept while nothing a person edits changed: the next poll reads again and heals', { ...BOUNDED, skip: NO_CHMOD }, async (t) => {
  const plugin = pluginCopy(t)
  const { open } = await configured(t, { pluginRoot: plugin })
  const workflows = join(plugin, 'workflows')
  const { url } = await open()
  const token = await tokenOf(url)
  const stream = contentStream(t, url, token)
  assert.equal((await stream.next()).configuration.status, 'ok')

  // The plugin is no part of what a person edits: the digest stays the same while its folder cannot be read.
  chmodSync(workflows, 0o000)
  t.after(() => { if (existsSync(workflows)) chmodSync(workflows, 0o755) })
  const failed = await within(t, 10_000, contentStream(t, url, token).next())
  assert.equal(failed.configuration.status, 'unreadable')

  chmodSync(workflows, 0o755)

  const healed = await within(t, 10_000, stream.next((content) => content.configuration.status === 'ok'))
  assert.notEqual(healed, 'still waiting')
})

test('a Workflow tab whose read threw is not kept while nothing a person edits changed: the next poll reads again and heals', { ...BOUNDED, skip: NO_CHMOD }, async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  git(cwd, 'init', '-q', '-b', 'main')
  git(cwd, 'commit', '-q', '--allow-empty', '-m', 'start')
  assert.equal((await createInit(createNodeAdapters(copilotHost(cwd))).init({ slug: 'checkout' })).ok, true)
  const events = join(cwd, '.copilot-tracking', 'skraft-plans', 'checkout', 'events.jsonl')
  const { open } = pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home` })
  const { url } = await open()
  const token = await tokenOf(url)
  const stream = contentStream(t, url, token)
  assert.equal((await stream.next()).workflows.length > 0, true)

  // The active run grows by events, not by edits: the digest tells its size and stays the same while the engine cannot read the journal.
  chmodSync(events, 0o000)
  t.after(() => { if (existsSync(events)) chmodSync(events, 0o644) })
  const failed = await within(t, 10_000, contentStream(t, url, token).next())
  assert.deepEqual(failed.workflows, [])

  chmodSync(events, 0o644)

  const healed = await within(t, 10_000, stream.next((content) => content.workflows.length > 0))
  assert.notEqual(healed, 'still waiting')
})
