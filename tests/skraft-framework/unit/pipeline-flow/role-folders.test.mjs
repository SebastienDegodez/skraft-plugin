import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW, ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, API, DOCS_FOLDERS, nominal, REFS_42, scripted, SLUG } from '../support/pipeline-host.mjs'
import { ALL_KILLED, strykerReport } from '../support/mutation-reports.mjs'
import { UNLISTABLE_ADRS, waitingOnEnvironment } from '../support/decisions.mjs'

// On a repository with no docs folders, the agent's tools may only create files in existing
// folders, so the engine creates the folders of the agent's role before dispatching it.

/** A host on a repository that has none of the docs folders the plugin's agents write in. */
/** The paths of each commit the engine made to create a role's folders, its own commits for an agent with no shell left out. */
const folderCommits = (host) => host.git.engineCommits.filter(({ message }) => message.startsWith('chore: create the folders ')).map(({ paths }) => paths)

const withoutDocsFolders = (options, script) => {
  const host = scripted(options, script)
  for (const path of Object.keys(DOCS_FOLDERS)) host.workspace.files.delete(path)
  return host
}

/** A component that keeps its scenarios in docs/features, as a repository that writes Gherkin names it. */
const GHERKIN = Object.freeze({ ...API, bdd: [{ features: 'docs/features', steps: 'tests/Steps' }] })

test('the engine creates the docs folders of a role that the repository does not have yet, each with an empty .gitkeep it commits alone before the agent starts, and leaves existing ones alone', async () => {
  const host = withoutDocsFolders({ components: [GHERKIN] }, (it) => nominal(it, REFS_42))

  const outcome = await host.start({ story: { issue: 42, title: 'Pay by card' } })

  assert.equal(outcome.status, 'done')
  const kept = [...host.workspace.files.keys()].filter((path) => path.endsWith('/.gitkeep')).sort()
  assert.deepEqual(kept, ['docs/adr/.gitkeep', 'docs/domain/event-model/.gitkeep', 'docs/features/.gitkeep'])
  assert.equal(host.workspace.files.get('docs/adr/.gitkeep'), '')
  assert.equal(host.workspace.files.get('docs/architecture/context-map.md'), '# Context map\n')
  assert.deepEqual(host.git.engineCommits, [
    { dir: '.', paths: ['docs/adr/.gitkeep', 'docs/domain/event-model/.gitkeep'], message: 'chore: create the folders solution-architect writes in\n\nRefs: #42' },
    { dir: '.', paths: ['docs/adr/adr-001-card-payment.md'], message: `docs(${SLUG}): design ${SLUG}\n\nRefs: #42` },
    { dir: '.', paths: ['docs/features/.gitkeep'], message: 'chore: create the folders acceptance-designer writes in\n\nRefs: #42' },
  ])
  const started = host.events().filter((event) => event.type === 'step.started' && event.agent !== undefined)
  assert.deepEqual(started.map(({ step, heads }) => [step, heads]), [
    ['research', [{ repository: '.', sha: 'root-0', dirty: [] }]],
    ['design', [{ repository: '.', sha: 'root-1', dirty: [] }]],
    ['distill', [{ repository: '.', sha: 'root-3', dirty: [] }]],
    ['deliver', [{ repository: '.', sha: 'root-4', dirty: [] }]],
    ['pr_writer', [{ repository: '.', sha: 'root-5', dirty: [] }]],
  ])
})

test('a folder of the role the machine cannot list gets no .gitkeep: the run asks a human to fix it once it needs that folder', async () => {
  const host = withoutDocsFolders({}, nominal)
  host.workspace.unlistable.set('docs/adr', 'EACCES: permission denied')

  const outcome = await host.start()

  assert.deepEqual(outcome, { status: 'waiting', slug: SLUG, phase: 'DESIGN', code: 'environment', reason: waitingOnEnvironment('adr', UNLISTABLE_ADRS) })
  assert.equal(host.workspace.files.has('docs/adr/.gitkeep'), false)
  assert.deepEqual(folderCommits(host), [['docs/domain/event-model/.gitkeep']])
})

const REPORT = 'StrykerOutput/reports/mutation-report.json'
const STRYKER = '. $ dotnet stryker'
/** The built-in workflow whose proposal for surviving mutants is the acceptance designer's. */
const DESIGNER_PROPOSES = BUILT_IN_WORKFLOW.replace('kill_proposal [shape=box, agent="software-engineer"', 'kill_proposal [shape=box, agent="acceptance-designer"')

test('a node that proposes for surviving mutants gets no folder of its agent\'s role: it changes nothing in the working copy', async () => {
  const host = withoutDocsFolders({ components: [GHERKIN], machine: new ScriptedMachine(), answers: [{ answer: 'APPLY' }], files: { '.skraft/pipeline.skraft.dot': DESIGNER_PROPOSES } }, (it) => {
    const [research, design, distill, deliver] = nominal(it)
    const removingScenarios = async () => {
      await deliver()
      it.workspace.files.delete('docs/features/.gitkeep')
    }
    const killing = agent({ work: ({ git }) => git.commit(`test(${SLUG}): kill the checkout mutants`, ['tests/CheckoutTests.cs']) })(it)
    return [research, design, distill, removingScenarios, agent()(it), killing]
  })
  let runs = 0
  host.machine.meanwhile[STRYKER] = async () => {
    runs += 1
    host.machine.exits[STRYKER] = runs === 1 ? 1 : 0
    await host.workspace.write(REPORT, runs === 1 ? strykerReport({ '/work/src/Checkout.cs': [[12, 'Equality', '!=', 'Survived']] }, { projectRoot: '/work/src' }) : ALL_KILLED)
  }

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.ok(host.agentRunner.dispatches.some(({ label }) => label === `skraft ${SLUG} · kill_proposal · group 1 of 1 · attempt 1`), host.agentRunner.dispatches.map(({ label }) => label).join('\n'))
  assert.equal(host.workspace.files.has('docs/features/.gitkeep'), false)
  assert.deepEqual(folderCommits(host), [['docs/adr/.gitkeep', 'docs/domain/event-model/.gitkeep'], ['docs/features/.gitkeep']])
})

test('a component that writes no Gherkin has no features folder created for it: the engine creates what its configuration names, and nothing else', async () => {
  const host = withoutDocsFolders({ components: [{ ...API, bdd: false }] }, nominal)

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(folderCommits(host), [['docs/adr/.gitkeep', 'docs/domain/event-model/.gitkeep']], 'the architect still gets its folders; the designer asks for none')
  assert.equal(host.workspace.files.has('docs/features/.gitkeep'), false)
})
