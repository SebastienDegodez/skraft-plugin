import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { actsAs, scriptedModHost } from './support/scripted-mod-host.mjs'
import { answerChoices } from '../../../../plugins/skraft-framework/engine/drivers/claude-mod/run-view.mjs'
import { ADR, ADR_PATH, NOMINAL, SLUG, commit, fillOutputs, pipelineRepository, scriptedLlm, writeResult } from '../support/pipeline-repository.mjs'
import { git, journal } from '../support/workspace.mjs'

const RATIFY = `Ratify the Proposed ADRs ${ADR_PATH}? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.`
const REASON = 'use the bank gateway, not Stripe'

/** `/skraft <slug>` on the repository with these dialog answers, until the run stops. */
const runOn = async (cwd, answers) => {
  const llm = scriptedLlm({ cwd })
  const mod = await scriptedModHost({ cwd, otherwise: actsAs(llm), answers })
  await mod.command(SLUG)
  return { mod, outcome: await mod.settled() }
}

/** The phase agents' spawns, the review lenses left out. */
const phaseSpawns = (mod) => mod.spawns.filter((spawn) => !spawn.description.includes('_review · '))
const descriptions = (mod) => phaseSpawns(mod).map((spawn) => spawn.description)
/** @param {object} mod @param {string} step e.g. `design · pass 2 · attempt 1` */
const spawnOf = (mod, step) => mod.spawns.find((spawn) => spawn.description === `skraft ${SLUG} · ${step}`)

test('the ratification is asked in a dialog with its options; RATIFIED goes on in the same run and commits the Accepted ADR', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { mod, outcome } = await runOn(cwd, ['RATIFIED'])

  assert.equal(outcome.status, 'done')
  assert.deepEqual(mod.asked, [{ question: RATIFY, options: { options: ['RATIFIED', 'REJECTED'], header: 'ADR' } }])
  assert.match(readFileSync(join(cwd, ...ADR_PATH.split('/')), 'utf8'), /^status: Accepted$/m)
  assert.equal(git(cwd, 'log', '-1', '--format=%s', '--', ADR_PATH), 'docs(adr): ratify ADR-001')
})

test('a dismissed dialog leaves the run waiting; /skraft decide records the answer and resumes it without spawning an agent again', async (t) => {
  const { cwd } = pipelineRepository(t)
  const { mod, outcome } = await runOn(cwd, [null])

  assert.deepEqual({ status: outcome.status, code: outcome.code }, { status: 'waiting', code: 'adr-ratification' })
  assert.equal(mod.notes.at(-1), `skraft ${SLUG}: waiting (adr-ratification) — ${RATIFY} Answer with skraft decide adr-1 RATIFIED|REJECTED (a refusal with its reason).`)
  assert.ok(mod.published.at(-1).view.question !== null)
  assert.equal(await mod.command(''), [
    `skraft ${SLUG} — waiting`, '✓ RESEARCH', '▶ DESIGN', '· DISTILL', '· DELIVER', '· PUBLISH', RATIFY,
    'question: adr-ratification (adr)', 'answer: /skraft decide adr-1 RATIFIED|REJECTED (with your reason after REJECTED)',
    'review design_review: approved — consistency pass, architecture-compliance pass, fitness pass',
  ].join('\n'))

  const text = await mod.command('decide RATIFIED')

  assert.equal(text, `${SLUG}: adr-1 answered RATIFIED; run the pipeline again to go on\nskraft ${SLUG} started — progress in the Skraft pane.`)
  assert.equal((await mod.settled()).status, 'done')
  assert.deepEqual(descriptions(mod), [
    `skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · design · attempt 1`, `skraft ${SLUG} · distill · attempt 1`, `skraft ${SLUG} · deliver · attempt 1`, `skraft ${SLUG} · pr_writer · attempt 1`,
  ])
})

test('a button pressed in the pane records its answer by host and resumes the run; a pressed refusal asks its reason first, and without one nothing is recorded', async (t) => {
  const { cwd } = pipelineRepository(t)
  const { mod } = await runOn(cwd, [null])
  const [ratified, rejected] = answerChoices(mod.published.at(-1).view)

  const refused = await mod.press(rejected)

  assert.equal(refused, 'skraft: not recorded — REJECTED needs the reason, which goes back to the agent')
  assert.deepEqual(mod.asked.at(-1), { question: 'Why REJECTED? Type the reason under Other; it goes back to the agent.', options: { options: ['Not now', 'Answer later'], header: 'ADR' } })
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered'), [])

  const dialogs = mod.asked.length
  const text = await mod.press(ratified)

  assert.equal(text, `${SLUG}: adr-1 answered RATIFIED; run the pipeline again to go on\nskraft ${SLUG} started — progress in the Skraft pane.`)
  assert.equal(mod.asked.length, dialogs)
  assert.equal((await mod.settled()).status, 'done')
  assert.deepEqual(mod.notes.slice(-3, -1), [refused, text])
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ key, answer, reason, by }) => [key, answer, reason, by]), [['adr-1', 'RATIFIED', null, 'host']])

  assert.equal(await mod.press(rejected), 'skraft: not recorded — adr-1 was already answered RATIFIED')
  assert.equal(mod.asked.length, dialogs)
})

test('a refusal pressed in the pane with its reason typed in the dialog sends the architect back with it', async (t) => {
  const { cwd } = pipelineRepository(t)
  const { mod } = await runOn(cwd, [null, REASON, 'RATIFIED'])

  await mod.press(answerChoices(mod.published.at(-1).view)[1])

  assert.equal((await mod.settled()).status, 'done')
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ answer, reason, by }) => [answer, reason, by]), [['REJECTED', REASON, 'host'], ['RATIFIED', null, 'host']])
  assert.ok(spawnOf(mod, 'design · pass 2 · attempt 1').prompt.endsWith(`A human refused the work of pass 1:\n- ${ADR_PATH}: ${REASON}`))
})

test('REJECTED asks its reason in a second dialog, and the architect gets it on a new pass', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { mod, outcome } = await runOn(cwd, ['REJECTED', REASON, 'RATIFIED'])

  assert.equal(outcome.status, 'done')
  assert.deepEqual(mod.asked.map(({ question }) => question), [RATIFY, 'Why REJECTED? Type the reason under Other; it goes back to the agent.', RATIFY])
  assert.deepEqual(descriptions(mod).slice(1, 3), [`skraft ${SLUG} · design · attempt 1`, `skraft ${SLUG} · design · pass 2 · attempt 1`])
  const revised = spawnOf(mod, 'design · pass 2 · attempt 1').prompt
  assert.ok(revised.endsWith(`A human refused the work of pass 1:\n- ${ADR_PATH}: ${REASON}`), revised)
})

test('text typed under Other is a rejection with that reason; a reason dialog left with "Not now" leaves the run waiting', async (t) => {
  const typed = pipelineRepository(t)
  const { mod } = await runOn(typed.cwd, [REASON, 'RATIFIED'])
  assert.deepEqual(journal(typed.cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ answer, reason }) => [answer, reason]), [['REJECTED', REASON], ['RATIFIED', null]])
  assert.equal(phaseSpawns(mod).length, 6)

  const later = pipelineRepository(t)
  const { mod: waiting, outcome } = await runOn(later.cwd, ['REJECTED', 'Not now'])
  assert.deepEqual({ status: outcome.status, code: outcome.code }, { status: 'waiting', code: 'adr-ratification' })
  assert.deepEqual(waiting.published.at(-1).log.filter((line) => line.includes('not answered')), [])
})

test('an answer typed under Other in any case is that answer, not a rejection', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { outcome } = await runOn(cwd, [' ratified '])

  assert.equal(outcome.status, 'done')
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ answer, reason }) => [answer, reason]), [['RATIFIED', null]])
})

test('Git unable to list docs/adr asks the human to fix the machine and never skips the ratification; RETRY goes on to it', async (t) => {
  const { cwd } = pipelineRepository(t)
  const mod = await scriptedModHost({ cwd, otherwise: actsAs(scriptedLlm({ cwd })), answers: [null] })
  const run = mod.host.run
  let listing = 'fails'
  mod.host.run = (argv, init) => (listing === 'fails' && argv.includes('ls-files') && String(init?.cwd).replaceAll('\\', '/').endsWith('/docs/adr')
    ? Promise.resolve({ exitCode: 128, stdout: '', stderr: 'fatal: index file corrupt\n' })
    : run(argv, init))
  await mod.command(SLUG)

  const outcome = await mod.settled()

  assert.deepEqual({ status: outcome.status, code: outcome.code }, { status: 'waiting', code: 'environment' })
  assert.match(mod.asked[0].question, /^design cannot run on this machine: docs\/adr cannot be listed: git ls-files failed \(exit 128\)\. Fix it, then RETRY/)
  assert.equal(mod.asked[0].question.includes("index file corrupt"), false)
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'step.recorded' && event.step === 'adr'), [])
  listing = 'works'
  await mod.command('decide RETRY')
  assert.equal((await mod.settled()).status, 'done')
  assert.deepEqual(mod.asked.map(({ options }) => options.header), ['Environment', 'ADR'])
  assert.match(readFileSync(join(cwd, ...ADR_PATH.split('/')), 'utf8'), /^status: Accepted$/m)
})

test('skraft-config.json left invalid in the environment dialog stops the run before any command; fixed, /skraft goes on without spawning an agent again', async (t) => {
  const { cwd } = pipelineRepository(t)
  const configPath = join(cwd, 'skraft-config.json')
  const config = readFileSync(configPath, 'utf8')
  const parsed = JSON.parse(config)
  writeFileSync(configPath, JSON.stringify({ ...parsed, components: [{ ...parsed.components[0], commands: { ...parsed.components[0].commands, build: 'skraft-missing-build' } }] }))
  const mod = await scriptedModHost({ cwd, otherwise: actsAs(scriptedLlm({ cwd })) })
  const ask = mod.host.ask
  let environmentDialogs = 0
  mod.host.ask = async (question, options) => {
    if (options.header !== 'Environment') return ask(question, options)
    environmentDialogs += 1
    if (environmentDialogs > 1) return 'ABORT'
    writeFileSync(configPath, '{ invalid JSON')
    return 'RETRY'
  }
  await mod.command(SLUG)

  const outcome = await mod.settled()

  assert.deepEqual({ status: outcome.status, code: outcome.code }, { status: 'blocked', code: 'config-invalid' })
  assert.equal(journal(cwd, SLUG).at(-1).type, 'question.answered')
  writeFileSync(configPath, config)
  await mod.command(SLUG)
  assert.equal((await mod.settled()).status, 'done')
  assert.equal(phaseSpawns(mod).length, 5)
})

test('an unpublished ADR the architect supersedes on the refused pass is refused; edited in place, it is asked again', async (t) => {
  const { cwd } = pipelineRepository(t)
  const tokens = 'docs/adr/adr-002-card-tokens.md'
  const supersedes = (brief, { cwd: dir, slug }) => {
    fillOutputs(brief, 'Tokens.\n')
    commit(dir, `docs(${slug}): tokens supersede the card payment`, { [tokens]: ADR.replace('adr: 1', 'adr: 2').replace('supersedes: null', 'supersedes: ADR-001') })
    writeResult(brief, { status: 'done', summary: 'ADR-002 supersedes ADR-001' })
  }
  const inPlace = (brief, { cwd: dir, slug }) => {
    commit(dir, `docs(${slug}): card payment with tokens`, { [tokens]: null, [ADR_PATH]: `${ADR}\nWith tokens.\n` })
    writeResult(brief, { status: 'done', summary: 'ADR-001 edited in place' })
  }
  const llm = scriptedLlm({ cwd, acts: { 'solution-architect': [NOMINAL['solution-architect'], supersedes, inPlace] } })
  const mod = await scriptedModHost({ cwd, otherwise: actsAs(llm), answers: ['REJECTED', 'tokens belong in ADR-001', 'RATIFIED'] })
  await mod.command(SLUG)

  assert.equal((await mod.settled()).status, 'done')
  const design = journal(cwd, SLUG).filter((event) => event.type === 'step.recorded' && event.step === 'design')
  assert.deepEqual(design.map(({ visit, attempt, code }) => [visit, attempt, code]), [[1, 1, null], [2, 1, 'adr-lifecycle'], [2, 2, null]])
  assert.deepEqual(design[1].failures, [`${tokens} supersedes ADR-001, which is not on the default branch yet: edit ${ADR_PATH} in place instead`])
  const retried = spawnOf(mod, 'design · pass 2 · attempt 2').prompt
  assert.ok(retried.includes(`Refused in attempt 1 of 3:\n- ${tokens} supersedes ADR-001`), retried)
  assert.deepEqual(mod.asked.filter(({ question }) => question.startsWith('Ratify')).length, 2)
  assert.match(readFileSync(join(cwd, ...ADR_PATH.split('/')), 'utf8'), /^status: Accepted$/m)
})
