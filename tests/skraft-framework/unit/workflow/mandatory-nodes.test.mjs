import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'
import { scripted } from '../support/pipeline-host.mjs'
import { designating, edit, host, withLenses } from './support.mjs'

const MANDATORY = 'this node is mandatory and cannot be removed'
const DELIVER_LENSES = ['test-integrity', 'architecture-boundaries', 'cold-reader', 'mock-fidelity when=mock', 'contract-fidelity when=contract']

/** The errors `skraft workflow check` gives on the working copy's workflow `dot`. */
const checked = async (dot, repository = []) => (await host({ files: designating(dot), repository }).commands.check()).errors

test('an ejected copy that drops a mandatory lens is refused, the lens named; one that adds a lens beside the mandatory ones is accepted', async () => {
  const withoutIntegrity = withLenses(BUILT_IN_WORKFLOW, 'deliver_review', DELIVER_LENSES.filter((lens) => lens !== 'test-integrity'))
  assert.deepEqual(await checked(withoutIntegrity), [
    `mandatory node deliver_review_test_integrity (lens test-integrity between deliver_review_lenses and deliver_review) is missing; ${MANDATORY}`,
  ])

  const withoutBoth = withLenses(BUILT_IN_WORKFLOW, 'deliver_review', ['cold-reader'])
  assert.deepEqual(await checked(withoutBoth), [
    `mandatory node deliver_review_test_integrity (lens test-integrity between deliver_review_lenses and deliver_review) is missing; ${MANDATORY}`,
    `mandatory node deliver_review_architecture_boundaries (lens architecture-boundaries between deliver_review_lenses and deliver_review) is missing; ${MANDATORY}`,
  ])

  const added = withLenses(BUILT_IN_WORKFLOW, 'deliver_review', ['acme-security', ...DELIVER_LENSES.map((lens) => lens.replace('test-integrity', 'test-integrity@frontier'))])
  assert.deepEqual(await checked(added, ['acme-security-lens']), [])
})

test('mandatory=false written on a mandatory node changes nothing: the copy is refused for it, and for what it then drops', async () => {
  const falseOnLens = edit(BUILT_IN_WORKFLOW, ['lens="architecture-boundaries", mandatory=true', 'lens="architecture-boundaries", mandatory=false, when="mock"'])
  assert.deepEqual(await checked(falseOnLens), [
    `mandatory node deliver_review_architecture_boundaries must run on every review, without when; ${MANDATORY}`,
    `mandatory node deliver_review_architecture_boundaries says mandatory=false, which changes nothing; ${MANDATORY}`,
  ])

  const falseOnReview = edit(BUILT_IN_WORKFLOW, ['distill_review [shape=tripleoctagon, mandatory=true]', 'distill_review [shape=tripleoctagon, mandatory=false]'])
  assert.deepEqual(await checked(falseOnReview), [`mandatory node distill_review says mandatory=false, which changes nothing; ${MANDATORY}`])
  assert.deepEqual(await checked(edit(BUILT_IN_WORKFLOW, ['distill_review [shape=tripleoctagon, mandatory=true]', 'distill_review [shape=tripleoctagon, mandatory=yes]'])), [
    'node distill_review: mandatory="yes" must be true or false',
  ])

  const unmarked = edit(BUILT_IN_WORKFLOW,
    ['distill_review [shape=tripleoctagon, mandatory=true]', 'distill_review [shape=tripleoctagon]'],
    ['lens="test-integrity", mandatory=true', 'lens="test-integrity"'])
  assert.deepEqual(await checked(unmarked), [])
})

test('a mandatory lens moved to another review, behind another fan-out, or running another lens is refused', async () => {
  const moved = edit(BUILT_IN_WORKFLOW,
    ['  deliver_review_lenses -> deliver_review_test_integrity -> deliver_review\n', ''],
    ['  mutation_review_lenses -> mutation_review_test_integrity -> mutation_review\n', '  mutation_review_lenses -> deliver_review_test_integrity -> mutation_review\n'],
    ['  mutation_review_test_integrity [shape=note, lens="test-integrity"]\n', ''])
  assert.deepEqual(await checked(moved), [`mandatory node deliver_review_test_integrity must stay between deliver_review_lenses and deliver_review; ${MANDATORY}`])

  const renamed = BUILT_IN_WORKFLOW.replaceAll('deliver_review_lenses', 'deliver_lenses')
  assert.deepEqual(await checked(renamed), ['test_integrity', 'architecture_boundaries'].map((lens) => `mandatory node deliver_review_${lens} must stay between deliver_review_lenses and deliver_review; ${MANDATORY}`))

  const swapped = edit(BUILT_IN_WORKFLOW, ['lens="test-integrity", mandatory=true', 'lens="cold-reader-two", mandatory=true'])
  assert.deepEqual(await checked(swapped, ['cold-reader-two-lens']), [`mandatory node deliver_review_test_integrity must run lens test-integrity; ${MANDATORY}`])
})

test('a mandatory review dropped, bypassed, or sending NEEDS_REWORK nowhere or to another phase is refused', async () => {
  const dropped = edit(BUILT_IN_WORKFLOW,
    [/  design_review_lenses \[shape=component\]\n(  design_review_\w+ \[shape=note.*\]\n)+  design_review \[.*\]\n/.exec(BUILT_IN_WORKFLOW)[0], ''],
    [/(  design_review_lenses -> \w+ -> design_review\n)+/.exec(BUILT_IN_WORKFLOW)[0], ''],
    ['research -> design -> design_review_lenses', 'research -> design -> adr'],
    ['  design_review -> design  [label="NEEDS_REWORK", max_visits=3]\n  design_review -> adr     [label="APPROVED"]\n', ''])
  assert.deepEqual(await checked(dropped), [`mandatory node design_review is missing as a review fan-in (shape=tripleoctagon); ${MANDATORY}`])

  const turned = edit(dropped, ['research -> design -> adr', 'research -> design -> design_review -> adr\n  design_review [shape=box, agent="solution-architect"]'])
  assert.deepEqual(await checked(turned), [`mandatory node design_review is missing as a review fan-in (shape=tripleoctagon); ${MANDATORY}`])

  const bypassed = edit(BUILT_IN_WORKFLOW,
    ['research -> design -> design_review_lenses', 'research -> design -> quick\n  quick [shape=parallelogram, gate="build"]\n  quick -> design_review_lenses [label="PASS"]\n  quick -> adr [label="FAIL"]'])
  assert.deepEqual(await checked(bypassed), ['start', 'design'].map((from) => `${from} reaches the exit without passing mandatory node design_review; ${MANDATORY}`))

  const noRework = edit(BUILT_IN_WORKFLOW, ['  distill_review -> distill [label="NEEDS_REWORK", max_visits=3]\n', ''])
  assert.deepEqual(await checked(noRework), [`mandatory node distill_review has no NEEDS_REWORK edge back to an agent of DISTILL; ${MANDATORY}`])

  const elsewhere = edit(BUILT_IN_WORKFLOW, ['design_review -> design  [label="NEEDS_REWORK", max_visits=3]', 'design_review -> distill  [label="NEEDS_REWORK", max_visits=3]'])
  assert.deepEqual(await checked(elsewhere), [`mandatory node design_review must send NEEDS_REWORK back to an agent of DESIGN, not to distill; ${MANDATORY}`])

  const toAsk = edit(BUILT_IN_WORKFLOW, ['design_review -> design  [label="NEEDS_REWORK", max_visits=3]', 'design_review -> adr  [label="NEEDS_REWORK", max_visits=3]'])
  assert.deepEqual(await checked(toAsk), [`mandatory node design_review must send NEEDS_REWORK back to an agent of DESIGN, not to adr; ${MANDATORY}`])

  const renamedPhase = edit(BUILT_IN_WORKFLOW, ['agent="solution-architect", phase="DESIGN"', 'agent="solution-architect", phase="ARCHITECTURE"'])
  assert.deepEqual(await checked(renamedPhase), [`mandatory node design_review must send NEEDS_REWORK back to an agent of DESIGN, not to design; ${MANDATORY}`])
})

test('a run on a copy that drops a mandatory node launches no agent and gives the same reason as the check', async () => {
  const withoutIntegrity = withLenses(BUILT_IN_WORKFLOW, 'deliver_review', DELIVER_LENSES.filter((lens) => lens !== 'test-integrity'))
  const run = scripted({ config: { workflow: 'skraft-workflow.dot' }, files: { 'skraft-workflow.dot': withoutIntegrity } }, () => [])

  const outcome = await run.init()

  assert.equal(outcome.code, 'workflow-invalid')
  assert.equal(outcome.reason, `skraft-workflow.dot is invalid: mandatory node deliver_review_test_integrity (lens test-integrity between deliver_review_lenses and deliver_review) is missing; ${MANDATORY}`)
  assert.equal(run.agentRunner.dispatches.length, 0)
  assert.equal(run.agentRunner.batches.length, 0)
})

test('diff marks each mandatory node it lists as removed or changed', async () => {
  const reshaped = edit(withLenses(BUILT_IN_WORKFLOW, 'deliver_review', DELIVER_LENSES.filter((lens) => lens !== 'test-integrity')),
    ['design_review [shape=tripleoctagon, mandatory=true]', 'design_review [shape=tripleoctagon, mandatory=true, refuter="frontier"]'],
    ['graph [version="2", goal="Deliver the story"]', 'graph [version="2", goal="Deliver the story", skraft_version="2.0.0"]'])

  assert.deepEqual((await host({ files: designating(reshaped) }).commands.diff({ pluginVersion: '2.0.0' })).changes, [
    '- node deliver_review_test_integrity (mandatory)',
    '~ node design_review: refuter none → frontier (mandatory)',
  ])
})

test('an agent of a mandatory review\'s phase that leads to the exit around the review is refused, the DELIVER gates unlocked or not; one in a phase of its own is accepted', async () => {
  const polish = edit(BUILT_IN_WORKFLOW,
    ['adr -> distill   [label="RATIFIED"]', 'adr -> polish   [label="RATIFIED"]\n  polish [shape=box, agent="solution-architect", phase="DESIGN", writes="src/**"]\n  polish -> distill'])
  assert.deepEqual(await checked(polish), [`polish reaches the exit without passing mandatory node design_review; ${MANDATORY}`])

  const ownPhase = edit(polish, ['phase="DESIGN", writes="src/**"', 'phase="HARDENING", writes="src/**"'])
  assert.deepEqual(await checked(ownPhase), [])

  const tweak = edit(BUILT_IN_WORKFLOW,
    ['gate="build,format,lint,test,architecture,coverage"', 'gate="build", unlock="the CI runs the other gates"'],
    ['deliver_review -> visuals [label="APPROVED"]', 'deliver_review -> tweak [label="APPROVED"]\n  tweak [shape=box, agent="software-engineer", writes="src/**"]\n  tweak -> visuals'])
  assert.deepEqual(await checked(tweak), [
    'tweak reaches the exit without passing mutation; keep the run going through mutation, or skip mutation with unlock="<reason>"',
    `tweak reaches the exit without passing mandatory node deliver_review; ${MANDATORY}`,
  ])

  const beforeGates = edit(BUILT_IN_WORKFLOW, ['  deliver -> gates\n', '  deliver -> lint_fix\n  lint_fix [shape=box, agent="software-engineer"]\n  lint_fix -> gates\n'])
  assert.deepEqual(await checked(beforeGates), [])
})

test('a mandatory review the plugin\'s workflow runs only on some paths stays on the paths it is on there: mutation_review after kill_mutants', async () => {
  const gated = edit(BUILT_IN_WORKFLOW, ['kill_mutants -> mutation_review_lenses', 'kill_mutants -> quick\n  quick [shape=parallelogram, gate="build"]\n  quick -> mutation_review_lenses [label="PASS"]\n  quick -> gates [label="FAIL"]'])
  assert.deepEqual(await checked(gated), [`kill_mutants reaches the exit without passing mandatory node mutation_review; ${MANDATORY}`])
})
