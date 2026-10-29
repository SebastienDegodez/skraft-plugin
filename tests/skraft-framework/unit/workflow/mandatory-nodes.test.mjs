import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_REVIEW, BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'
import { scripted } from '../support/pipeline-host.mjs'
import { DELIVER_LENSES, ejectedPipeline, edit, host, reviewWithLenses, withLenses } from './support.mjs'

const MANDATORY = 'this node is mandatory and cannot be removed'

/** The errors `skraft workflow check` gives on the working copy's workflow `dot`, beside the .skraft/review.skraft.dot given. */
const checked = async (dot, repository = [], review = {}) => (await host({ files: { ...ejectedPipeline(dot), ...review }, repository }).commands.check()).errors

/** The errors `skraft workflow check` gives on the plugin's workflow calling the working copy's .skraft/review.skraft.dot `dot`. */
const checkedReview = async (dot, repository = []) => (await host({ files: { '.skraft/review.skraft.dot': dot }, repository }).commands.check()).errors

/** The refusal of a mandatory lens of review dropped. @param {string} id @param {string} lens */
const lensMissing = (id, lens) => `mandatory node ${id} (lens ${lens} between lenses and verdict of review) is missing; ${MANDATORY}`

test('an ejected .skraft/review.skraft.dot that drops a mandatory lens is refused, the lens named, whether the plugin\'s workflow or an ejected one calls it; one that adds a lens beside the mandatory ones is accepted', async () => {
  const withoutIntegrity = reviewWithLenses(DELIVER_LENSES.filter((lens) => lens !== 'test-integrity'))
  assert.deepEqual(await checkedReview(withoutIntegrity), [lensMissing('test_integrity', 'test-integrity')])
  assert.deepEqual(await checked(BUILT_IN_WORKFLOW, [], { '.skraft/review.skraft.dot': withoutIntegrity }), [lensMissing('test_integrity', 'test-integrity')])

  const withoutBoth = reviewWithLenses(['cold-reader'])
  assert.deepEqual(await checkedReview(withoutBoth), [lensMissing('test_integrity', 'test-integrity'), lensMissing('architecture_boundaries', 'architecture-boundaries')])

  const added = reviewWithLenses(['acme-security', ...DELIVER_LENSES.map((lens) => lens.replace('test-integrity', 'test-integrity@frontier'))])
  assert.deepEqual(await checkedReview(added, ['acme-security-lens']), [])
})

test('a mandatory call dropped, turned into a review, or calling a file that lacks the mandatory lenses is refused; one calling a file that keeps them is accepted', async () => {
  const call = '  deliver_review [shape=house, workflow="review", mandatory=true]\n'
  const fanIn = withLenses(edit(BUILT_IN_WORKFLOW,
    [call, '  deliver_review_lenses [shape=component]\n  deliver_review [shape=tripleoctagon, mandatory=true]\n'],
    ['gates -> deliver_review [label="PASS"]', 'gates -> deliver_review_lenses [label="PASS"]']), 'deliver_review', DELIVER_LENSES)
  assert.deepEqual(await checked(fanIn), [
    `mandatory node deliver_review is missing as a call (shape=house); ${MANDATORY}`,
    lensMissing('test_integrity', 'test-integrity'), lensMissing('architecture_boundaries', 'architecture-boundaries'),
  ])

  const elsewhere = edit(BUILT_IN_WORKFLOW, [call, '  deliver_review [shape=house, workflow="team-review"]\n'])
  assert.deepEqual(await checked(elsewhere, [], { '.skraft/team-review.skraft.dot': reviewWithLenses(['cold-reader']) }), [
    lensMissing('test_integrity', 'test-integrity'), lensMissing('architecture_boundaries', 'architecture-boundaries'),
  ])
  assert.deepEqual(await checked(elsewhere, ['acme-security-lens'], { '.skraft/team-review.skraft.dot': reviewWithLenses(['acme-security', ...DELIVER_LENSES]) }), [])
})

test('the fan-in of review stays, under its id and without mandatory=false, whatever file the mandatory call calls', async () => {
  assert.deepEqual(await checkedReview(BUILT_IN_REVIEW.replaceAll('verdict', 'decision')), [`mandatory node verdict (the fan-in of review) is missing; ${MANDATORY}`])
  assert.deepEqual(await checkedReview(edit(BUILT_IN_REVIEW, ['verdict [shape=tripleoctagon, mandatory=true]', 'verdict [shape=tripleoctagon, mandatory=false]'])), [
    `mandatory node verdict says mandatory=false, which changes nothing; ${MANDATORY}`,
  ])
  const elsewhere = edit(BUILT_IN_WORKFLOW, ['workflow="review"', 'workflow="team-review"'])
  assert.deepEqual(await checked(elsewhere, [], { '.skraft/team-review.skraft.dot': BUILT_IN_REVIEW.replaceAll('verdict', 'decision') }), [
    `mandatory node verdict (the fan-in of team-review) is missing; ${MANDATORY}`,
  ])
})

test('a mandatory lens the plugin puts on a review of its own workflow stays between its fan-out and its fan-in', async () => {
  const builtIn = edit(BUILT_IN_WORKFLOW, ['lens="fitness"', 'lens="fitness", mandatory=true'])
  const dropped = withLenses(builtIn, 'design_review', ['consistency', 'architecture-compliance'])
  assert.deepEqual((await host({ builtIn, files: ejectedPipeline(dropped) }).commands.check()).errors, [
    `mandatory node design_review_fitness (lens fitness between design_review_lenses and design_review) is missing; ${MANDATORY}`,
  ])
})

test('mandatory=false written on a mandatory node changes nothing: the copy is refused for it, and for what it then drops', async () => {
  const falseOnLens = edit(BUILT_IN_REVIEW, ['lens="architecture-boundaries", mandatory=true', 'lens="architecture-boundaries", mandatory=false, when="mock"'])
  assert.deepEqual(await checkedReview(falseOnLens), [
    `mandatory node architecture_boundaries must run on every review, without when; ${MANDATORY}`,
    `mandatory node architecture_boundaries says mandatory=false, which changes nothing; ${MANDATORY}`,
  ])
  assert.deepEqual(await checked(edit(BUILT_IN_WORKFLOW, ['workflow="review", mandatory=true', 'workflow="review", mandatory=false'])), [
    `mandatory node deliver_review says mandatory=false, which changes nothing; ${MANDATORY}`,
  ])

  const falseOnReview = edit(BUILT_IN_WORKFLOW, ['distill_review [shape=tripleoctagon, mandatory=true]', 'distill_review [shape=tripleoctagon, mandatory=false]'])
  assert.deepEqual(await checked(falseOnReview), [`mandatory node distill_review says mandatory=false, which changes nothing; ${MANDATORY}`])
  assert.deepEqual(await checked(edit(BUILT_IN_WORKFLOW, ['distill_review [shape=tripleoctagon, mandatory=true]', 'distill_review [shape=tripleoctagon, mandatory=yes]'])), [
    'node distill_review: mandatory="yes" must be true or false',
  ])

  const unmarked = edit(BUILT_IN_WORKFLOW,
    ['distill_review [shape=tripleoctagon, mandatory=true]', 'distill_review [shape=tripleoctagon]'],
    ['workflow="review", mandatory=true', 'workflow="review"'])
  const unmarkedReview = edit(BUILT_IN_REVIEW, ['lens="test-integrity", mandatory=true', 'lens="test-integrity"'], ['verdict [shape=tripleoctagon, mandatory=true]', 'verdict [shape=tripleoctagon]'])
  assert.deepEqual(await checked(unmarked, [], { '.skraft/review.skraft.dot': unmarkedReview }), [])
})

test('a mandatory lens dropped from review.skraft.dot stays missing when the pipeline holds a decoy review whose lens node takes its id', async () => {
  const decoy = edit(BUILT_IN_WORKFLOW,
    ['  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  lenses [shape=component]\n  test_integrity [shape=note, lens="test-integrity"]\n  decoy [shape=tripleoctagon]'],
    ['  visuals -> pr_writer -> publish -> exit', '  visuals -> lenses -> test_integrity -> decoy -> pr_writer -> publish -> exit'])
  const withoutIntegrity = reviewWithLenses(DELIVER_LENSES.filter((lens) => lens !== 'test-integrity'))

  assert.deepEqual(await checked(decoy, [], { '.skraft/review.skraft.dot': withoutIntegrity }), [lensMissing('test_integrity', 'test-integrity')])

  const noCall = edit(decoy,
    ['  deliver_review [shape=house, workflow="review", mandatory=true]\n', ''],
    ['  gates -> deliver_review [label="PASS"]', '  gates -> mutation [label="PASS"]'],
    ['  deliver_review -> deliver [label="NEEDS_REWORK", max_visits=3]\n  deliver_review -> mutation [label="APPROVED"]\n', ''])
  assert.deepEqual(await checked(noCall), [
    `mandatory node deliver_review is missing as a call (shape=house); ${MANDATORY}`,
    lensMissing('test_integrity', 'test-integrity'), lensMissing('architecture_boundaries', 'architecture-boundaries'),
  ])
})

test('a mandatory lens behind another fan-out, or running another lens, is refused', async () => {
  const renamed = BUILT_IN_REVIEW.replace('  lenses [shape=component]', '  fan_out [shape=component]').replaceAll('  lenses -> ', '  fan_out -> ').replace('start -> lenses', 'start -> fan_out')
  assert.deepEqual(await checkedReview(renamed), ['test_integrity', 'architecture_boundaries'].map((lens) => `mandatory node ${lens} must stay between lenses and verdict of review; ${MANDATORY}`))

  const swapped = edit(BUILT_IN_REVIEW, ['lens="test-integrity", mandatory=true', 'lens="cold-reader-two", mandatory=true'])
  assert.deepEqual(await checkedReview(swapped, ['cold-reader-two-lens']), [`mandatory node test_integrity must run lens test-integrity; ${MANDATORY}`])
})

test('a mandatory review dropped, bypassed, or sending NEEDS_REWORK nowhere or to another phase is refused', async () => {
  const dropped = edit(BUILT_IN_WORKFLOW,
    [/  subgraph cluster_design_review \{\n[^}]*\n  \}\n/.exec(BUILT_IN_WORKFLOW)[0], ''],
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
  const withoutIntegrity = reviewWithLenses(DELIVER_LENSES.filter((lens) => lens !== 'test-integrity'))
  const run = scripted({ files: { '.skraft/review.skraft.dot': withoutIntegrity } }, () => [])

  const outcome = await run.init()

  assert.equal(outcome.code, 'workflow-invalid')
  assert.equal(outcome.reason, `skraft is invalid: ${lensMissing('test_integrity', 'test-integrity')}`)
  assert.equal(run.agentRunner.dispatches.length, 0)
  assert.equal(run.agentRunner.batches.length, 0)
})

test('diff marks each mandatory node it lists as removed or changed', async () => {
  const reshaped = edit(BUILT_IN_WORKFLOW,
    ['design_review [shape=tripleoctagon, mandatory=true]', 'design_review [shape=tripleoctagon, mandatory=true, refuter="frontier"]'],
    ['workflow="review"', 'workflow="team-review"'],
    ['graph [version="2", goal="Deliver the story"]', 'graph [version="2", goal="Deliver the story", skraft_version="2.0.0"]'])

  const team = reviewWithLenses(DELIVER_LENSES.filter((lens) => lens !== 'cold-reader'))
  assert.deepEqual((await host({ files: { ...ejectedPipeline(reshaped), '.skraft/team-review.skraft.dot': team } }).commands.diff({ pluginVersion: '2.0.0' })).changes, [
    '~ node design_review: refuter none → frontier (mandatory)',
    '~ node deliver_review: workflow review → team-review (mandatory)',
    '+ workflow .skraft/team-review.skraft.dot',
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
    ['mutation -> visuals [label="PASS"]', 'mutation -> tweak [label="PASS"]\n  tweak [shape=box, agent="software-engineer", writes="src/**"]\n  tweak -> visuals'])
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
