import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadWorkflow } from '../../../../plugins/skraft-framework/engine/application/workflow/load-workflow.mjs'
import { BUILT_IN_REVIEW, BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'
import { DELIVER_LENSES, designating, edit, host, reviewWithLenses } from './support.mjs'

const CALL = '  deliver_review [shape=house, workflow="review.skraft.dot", mandatory=true]'
const INPUTS = 'input_base="required", input_head="required", input_story="optional", input_documents="optional", input_components="optional"'

/** The errors `skraft workflow check` gives on the working copy's files. @param {Record<string, string>} files */
const errorsOf = async (files, repository = []) => (await host({ files, repository }).commands.check()).errors

/** The plugin's workflow, its call to review.skraft.dot given these attributes. @param {string} attributes */
const calling = (attributes) => designating(edit(BUILT_IN_WORKFLOW, [CALL, `  deliver_review [shape=house, ${attributes}]`]))

test('the plugin\'s DELIVER review is a call to the plugin\'s review.skraft.dot: its lenses, triggers and inputs, each bound to what the run holds of the same name', async () => {
  const { deps } = host()

  const { workflow } = await loadWorkflow(deps, { config: { workflow: null } })

  const call = workflow.nodes.deliver_review
  assert.equal(call.kind, 'call')
  assert.deepEqual(call.lenses, ['test-integrity', 'architecture-boundaries', 'cold-reader', 'mock-fidelity', 'contract-fidelity'])
  assert.deepEqual(call.branches.map(({ id, when }) => `${id} ${when}`), ['test_integrity null', 'architecture_boundaries null', 'cold_reader null', 'mock_fidelity mock', 'contract_fidelity contract'])
  assert.deepEqual(call.call, {
    workflow: 'review.skraft.dot', with: {}, fanIn: 'verdict', mandatory: true,
    inputs: { base: 'base', head: 'head', story: 'story', documents: 'documents', components: 'components' },
  })
  const { path, workflow: review } = workflow.called['review.skraft.dot']
  assert.equal(path, null)
  assert.deepEqual(review.inputs, { base: 'required', head: 'required', story: 'optional', documents: 'optional', components: 'optional' })
  assert.deepEqual([review.order, review.phases], [['start', 'verdict', 'exit'], []])
})

test('a review.skraft.dot of the working copy, at its root or next to the workflow it designates, is the one called: a lens added to it runs in DELIVER', async () => {
  const withSecurity = reviewWithLenses(['acme-security', ...DELIVER_LENSES])

  const root = host({ files: { 'review.skraft.dot': withSecurity }, repository: ['acme-security-lens'] })
  assert.equal((await root.commands.check()).ok, true)
  const plugin = await loadWorkflow(root.deps, { config: { workflow: null } })
  assert.deepEqual([plugin.workflow.nodes.deliver_review.lenses[0], plugin.workflow.called['review.skraft.dot'].path, plugin.sources['acme-security-lens']], ['acme-security', 'review.skraft.dot', 'repository'])

  const families = edit(withSecurity, ['verdict [shape=tripleoctagon, mandatory=true]', 'verdict [shape=tripleoctagon, mandatory=true, model="economy", refuter="frontier"]'])
  const nested = host({ files: { 'skraft-config.json': '{ "workflow": "flows/team.dot" }', 'flows/team.dot': BUILT_IN_WORKFLOW, 'flows/review.skraft.dot': families, 'review.skraft.dot': BUILT_IN_REVIEW }, repository: ['acme-security-lens'] })
  const team = (await loadWorkflow(nested.deps, { config: { workflow: 'flows/team.dot' } })).workflow
  const { lenses, model, refuter } = team.nodes.deliver_review
  assert.deepEqual([lenses[0], model, refuter, team.called['review.skraft.dot'].path], ['acme-security', 'economy', 'frontier', 'flows/review.skraft.dot'])
})

test('a call to a workflow found nowhere, named with a folder, or to one that runs anything but one review is refused with the reason', async () => {
  assert.deepEqual(await errorsOf(calling('workflow="missing.dot"')), [
    "node deliver_review: workflow missing.dot is found neither at missing.dot in the working copy nor in the plugin's workflows/",
  ])
  assert.deepEqual(await errorsOf(calling('workflow="../review.skraft.dot"')), ['node deliver_review: workflow="../review.skraft.dot" must name a .dot file next to the workflow, without a folder'])
  assert.deepEqual(await errorsOf(calling('workflow="review.skraft.dot.bak"')), ['node deliver_review: workflow="review.skraft.dot.bak" must name a .dot file next to the workflow, without a folder'])
  assert.deepEqual(await errorsOf(designating(edit(BUILT_IN_WORKFLOW, ['deliver_review -> visuals [label="APPROVED"]', 'deliver_review -> visuals [label="NEEDS_REWORK"]']))), [
    'node deliver_review: call node needs exactly one APPROVED edge, has 0',
    'node deliver_review: call node takes at most one NEEDS_REWORK edge, has 2',
  ])
  assert.deepEqual(await errorsOf(designating(edit(BUILT_IN_WORKFLOW, [CALL, '  deliver_review [shape=house]']))), ['node deliver_review: a house node needs workflow="…"'])
  assert.deepEqual(await errorsOf(calling('workflow="review.skraft.dot", model="frontier"')), [
    'node deliver_review: attribute model is not supported on a house node (supported: label, shape, phase, workflow, mandatory, with_<input>)',
  ])
  assert.deepEqual(await errorsOf(designating(edit(BUILT_IN_WORKFLOW, ['agent="pr-writer", phase="PUBLISH"', 'agent="pr-writer", phase="PUBLISH", with_story="story"']))), [
    'node pr_writer: attribute with_story is not supported on a box node (supported: label, shape, phase, agent, model, outputs, writes, max_attempts, each)',
  ])
  const unphased = 'digraph mine {\n  start [shape=Mdiamond]\n  review [shape=house, workflow="review.skraft.dot"]\n  exit [shape=Msquare]\n  start -> review -> exit\n}\n'
  assert.deepEqual(await errorsOf(designating(unphased)), ['node review has no phase; set phase="<PHASE>" on it or on a node before it'])

  const nested = edit(BUILT_IN_REVIEW, ['  verdict -> exit [label="APPROVED"]', '  verdict -> second [label="APPROVED"]\n  second [shape=house, workflow="other.dot"]\n  second -> exit'])
  assert.deepEqual(await errorsOf({ 'review.skraft.dot': nested }), ['review.skraft.dot: node second calls other.dot; a called workflow calls no other workflow'])

  const ONE_REVIEW = 'review.skraft.dot must run one review, start -> fan-out -> lens nodes -> fan-in -> exit, with no NEEDS_REWORK edge: the calling node carries it'
  const withAgent = edit(BUILT_IN_REVIEW, ['  verdict -> exit [label="APPROVED"]', '  verdict -> fix [label="APPROVED"]\n  fix [shape=box, agent="software-engineer"]\n  fix -> exit'])
  assert.deepEqual(await errorsOf({ 'review.skraft.dot': withAgent }), [ONE_REVIEW])
  const reworking = edit(BUILT_IN_REVIEW, ['  verdict -> exit [label="APPROVED"]', '  verdict -> exit [label="APPROVED"]\n  verdict -> exit [label="NEEDS_REWORK"]'])
  assert.deepEqual(await errorsOf({ 'review.skraft.dot': reworking }), [ONE_REVIEW])
  const noReview = 'digraph review {\n  graph [input_base="required", input_head="required"]\n  start [shape=Mdiamond]\n  exit [shape=Msquare]\n  start -> exit\n}\n'
  assert.deepEqual(await errorsOf({ 'review.skraft.dot': noReview }), [ONE_REVIEW])
  const agentOnly = noReview.replace('  start -> exit', '  fix [shape=box, agent="software-engineer"]\n  start -> fix -> exit')
  assert.deepEqual(await errorsOf({ 'review.skraft.dot': agentOnly }), [ONE_REVIEW])

  assert.deepEqual(await errorsOf({ 'review.skraft.dot': edit(BUILT_IN_REVIEW, ['lens="cold-reader"', 'lens="Cold Reader"']) }), ['review.skraft.dot: node cold_reader: lens="Cold Reader" must be a kebab-case lens name'])
  const besideTeam = { 'skraft-config.json': '{ "workflow": "flows/team.dot" }', 'flows/team.dot': BUILT_IN_WORKFLOW, 'flows/review.skraft.dot': edit(BUILT_IN_REVIEW, ['lens="cold-reader"', 'lens="Cold Reader"']) }
  assert.deepEqual(await errorsOf(besideTeam), ['flows/review.skraft.dot: node cold_reader: lens="Cold Reader" must be a kebab-case lens name'])
})

test('each input of the called workflow is bound by name, or by its with_; a required input left unbound, a with_ that binds no input, or changes not bound from base to head is refused', async () => {
  const withTicket = (need) => edit(BUILT_IN_REVIEW, [INPUTS, `${INPUTS}, input_ticket="${need}"`])
  assert.deepEqual(await errorsOf({ 'review.skraft.dot': withTicket('required') }), [
    'node deliver_review: review.skraft.dot needs input ticket; bind it with with_ticket="<base | head | story | documents | components>"',
  ])
  const optional = host({ files: { 'review.skraft.dot': withTicket('optional') } })
  assert.equal((await optional.commands.check()).ok, true)
  assert.equal('ticket' in (await loadWorkflow(optional.deps, { config: { workflow: null } })).workflow.nodes.deliver_review.call.inputs, false)

  const bound = host({ files: { ...calling('workflow="review.skraft.dot", mandatory=true, with_ticket="story", with_story="documents"'), 'review.skraft.dot': withTicket('required') } })
  assert.equal((await bound.commands.check()).ok, true)
  const { call } = (await loadWorkflow(bound.deps, { config: { workflow: 'skraft-workflow.dot' } })).workflow.nodes.deliver_review
  assert.deepEqual([call.with, call.inputs], [
    { ticket: 'story', story: 'documents' },
    { base: 'base', head: 'head', story: 'documents', documents: 'documents', components: 'components', ticket: 'story' },
  ])

  assert.deepEqual(await errorsOf(calling('workflow="review.skraft.dot", mandatory=true, with_nothing="base"')), ['node deliver_review: with_nothing binds no input of review.skraft.dot'])
  assert.deepEqual(await errorsOf(calling('workflow="review.skraft.dot", mandatory=true, with_story="pr", with_9="story", "with_pr-x"="story"')), [
    'node deliver_review: with_story="pr" must be base, head, story, documents, components',
    'node deliver_review: with_9="story" must be with_<input>, an input of lower-case letters, digits and _',
    'node deliver_review: with_pr-x="story" must be with_<input>, an input of lower-case letters, digits and _',
  ])

  const withoutBase = edit(BUILT_IN_REVIEW, ['input_base="required", ', ''])
  assert.deepEqual(await errorsOf({ 'review.skraft.dot': withoutBase }), ['node deliver_review: review.skraft.dot binds no input to base; a review reads the changes from base to head'])
  const headless = edit(BUILT_IN_REVIEW, ['input_base="required", input_head="required", ', ''])
  assert.deepEqual(await errorsOf({ 'review.skraft.dot': headless }), ['node deliver_review: review.skraft.dot binds no input to base, head; a review reads the changes from base to head'])

  assert.deepEqual(await errorsOf({ 'review.skraft.dot': edit(BUILT_IN_REVIEW, ['input_story="optional"', 'input_story="maybe", input_9="optional", "input_pr-x"="optional"']) }), [
    'review.skraft.dot: graph: input_story="maybe" must be required or optional',
    'review.skraft.dot: graph: input_9 must be input_<name>, a name of lower-case letters, digits and _',
    'review.skraft.dot: graph: input_pr-x must be input_<name>, a name of lower-case letters, digits and _',
  ])
})
