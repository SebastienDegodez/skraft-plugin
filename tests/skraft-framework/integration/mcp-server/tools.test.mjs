import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SLUG, pipelineRepository, scriptedLlm } from '../support/pipeline-repository.mjs'
import { FIXTURES, commitAll, copyFixture, journal, skraft, tempFolder } from '../support/workspace.mjs'
import { startAgents } from '../agent-loop/simulated-conductor.mjs'
import { mcpHost } from './mcp-host.mjs'

/** The texts of a tool result: stdout, then the log when there is one. @param {any} result */
const texts = (result) => result.content.map(({ text }) => text)

/** A text with its gate logs unnumbered: each gate run writes the next one. @param {string[]} lines */
const unnumbered = (lines) => lines.map((text) => text.replace(/-\d+\.log"/g, '-N.log"'))

/** What the command printed, as a tool result gives it. @param {{ stdout: string, stderr: string }} run */
const printed = ({ stdout, stderr }) => [stdout, stderr].filter(Boolean).map((text) => text.replace(/\n$/, ''))

test('each tool answers what its command line prints in the same folder, a failing doctor or gate included, and is an error only when the command answered nothing', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const host = mcpHost({ roots: [cwd] })
  await host.initialize()

  for (const [name, args, line] of [
    ['skraft_status', {}, ['status', '--json']],
    ['skraft_report', {}, ['report', '--json']],
    ['skraft_journal', {}, ['journal', 'show', '--json']],
    ['skraft_journal', { last: 1 }, ['journal', 'show', '--last', '1', '--json']],
    ['skraft_doctor', {}, ['doctor', '--json']],
    ['skraft_doctor', { run: true, base: 'main' }, ['doctor', '--run', '--base', 'main', '--json']],
    ['skraft_gate', { all: true }, ['gate', '--all', '--json']],
    ['skraft_workflow_check', {}, ['workflow', 'check', '--json']],
    ['skraft_workflow_diff', {}, ['workflow', 'diff', '--json']],
    ['skraft_migrate', {}, ['migrate', '--dry-run', '--json']],
  ]) {
    const result = await host.call(name, args)
    const run = await skraft(cwd, line)
    assert.deepEqual(unnumbered(texts(result)), unnumbered(printed(run)), name)
    assert.equal(result.isError, run.status !== 0 && run.stdout === '', name)
  }
  const gate = await host.call('skraft_gate', { all: true })
  assert.deepEqual([JSON.parse(gate.content[0].text).status, gate.isError], ['failed', false])
  assert.equal(JSON.parse((await host.call('skraft_gate')).content[0].text).status, 'passed')
  const refused = await host.call('skraft_start', { slug: 'Check Out' })
  assert.deepEqual(refused, { content: [{ type: 'text', text: 'slug must be kebab-case: lowercase letters and digits, joined by single hyphens' }], isError: true })
  await host.close()
})

test('in a repository skraft has never seen, the doctor fails on its configuration, and skraft_init detects the components into skraft-config.json, the folders it is given included', async (t) => {
  const root = tempFolder(t, 'skraft-mcp-')
  const cwd = copyFixture(FIXTURES.payment, join(root, 'payment'))
  copyFixture(FIXTURES.react, join(cwd, 'portal'))
  commitAll(cwd)
  const host = mcpHost({ workingDirectory: cwd })
  const configCheck = async () => (await host.json('skraft_doctor')).checks.find(({ subject }) => subject === 'config')

  const before = await configCheck()
  const detected = await host.call('skraft_init', { add: ['portal'] })

  assert.equal(before.status, 'fail')
  assert.match(before.detail, /^no skraft-config\.json/)
  assert.equal(detected.isError, false)
  const config = JSON.parse(readFileSync(join(cwd, 'skraft-config.json'), 'utf8'))
  assert.deepEqual(texts(detected), [texts(detected)[0]])
  assert.ok(config.components.some(({ root: folder }) => folder === 'portal'), JSON.stringify(config.components))
  assert.notEqual((await configCheck()).detail, before.detail)
  await host.close()
})

test('skraft_workflow_eject copies the pipeline into the repository, and the review workflow alone when asked', async (t) => {
  const { cwd } = pipelineRepository(t)
  const host = mcpHost({ workingDirectory: cwd })

  const ejected = await host.call('skraft_workflow_eject')
  const review = await host.call('skraft_workflow_eject', { review: true })

  assert.equal(ejected.isError, false)
  assert.equal(existsSync(join(cwd, '.skraft', 'pipeline.skraft.dot')), true)
  assert.equal(review.isError, false)
  assert.equal(existsSync(join(cwd, '.skraft', 'review.skraft.dot')), true)
  await host.close()
})

test('a step\'s log reaches the host as progress while the tool runs, when the host gave a progress token, and follows the answer in the result', async (t) => {
  const { cwd } = pipelineRepository(t)
  const host = mcpHost({ roots: [cwd] })
  await host.initialize()
  await host.call('skraft_start', { slug: SLUG })

  const result = await host.call('skraft_next', {}, { progressToken: 'run-1' })

  const progress = host.received.filter(({ method }) => method === 'notifications/progress').map(({ params }) => params)
  assert.deepEqual(progress, [
    { progressToken: 'run-1', progress: 1, message: 'phase RESEARCH' },
    { progressToken: 'run-1', progress: 2, message: `${SLUG}: solution-researcher, attempt 1 — researcher · economy · model chosen by the host` },
  ])
  assert.equal(result.content[1].text, progress.map(({ message }) => message).join('\n'))
  assert.equal(JSON.parse(result.content[0].text).then, 'call the skraft_record tool with {}')
  await host.close()
})

/**
 * Conducts the loop through the tools, as an agent of the host does from the run prompt: each
 * dispatch's agents started, then what `then` names; a question answered by the person in their
 * terminal, then skraft_next.
 */
const conductOverMcp = async (host, cwd, llm) => {
  const steps = []
  let step = await host.json('skraft_next')
  while (steps.length < 200) {
    steps.push(step)
    if (step.status === 'waiting') {
      const { question } = JSON.parse((await skraft(cwd, ['status', '--json'])).stdout)
      await skraft(cwd, ['decide', question.key, question.options[0]])
      step = await host.json('skraft_next')
    } else if (step.status === 'dispatch') {
      startAgents(step, llm)
      assert.equal(step.then, 'call the skraft_record tool with {}')
      step = await host.json('skraft_record')
    } else return { step, steps }
  }
  throw new Error('the loop did not end within 200 steps')
}

test('an agent of the host conducts a story to the end through the tools alone, and the journal is the one the command line conducts', async (t) => {
  const { cwd } = pipelineRepository(t)
  const host = mcpHost({ roots: [cwd] })
  await host.initialize()

  const started = await host.call('skraft_start', { slug: SLUG })
  const { step, steps } = await conductOverMcp(host, cwd, scriptedLlm({ cwd }))

  assert.deepEqual(texts(started), [`${SLUG} is the active pipeline`])
  assert.deepEqual(step, { status: 'done', slug: SLUG, phase: 'PUBLISH', code: null, reason: 'PUBLISH closed', dispatches: [], then: null })
  assert.deepEqual(steps.filter(({ status }) => status === 'waiting').map(({ code, then }) => [code, then]), [['adr-ratification', 'call the skraft_next tool with {}'], ['scenario-review', 'call the skraft_next tool with {}']])
  assert.deepEqual(journal(cwd, SLUG).filter(({ type }) => type === 'question.answered').map(({ by }) => by), ['cli-tty', 'cli-tty'])
  assert.equal(journal(cwd, SLUG).at(-1).type, 'run.finished')
  await host.close()
})

test('with several roots, then names the workspace the call was made in', async (t) => {
  const { cwd } = pipelineRepository(t)
  const other = tempFolder(t, 'skraft-mcp-')
  const host = mcpHost({ roots: [other, cwd] })
  await host.initialize()
  await host.call('skraft_start', { slug: SLUG, workspace: 'payment' })

  const step = await host.json('skraft_next', { workspace: 'payment' })

  assert.equal(step.then, 'call the skraft_record tool with {"workspace":"payment"}')
  await host.close()
})
