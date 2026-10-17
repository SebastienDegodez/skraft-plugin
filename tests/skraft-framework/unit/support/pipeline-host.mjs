// A whole host for RunPipeline, Init and Observe: every port is a hand-written double, the
// LLM is a scripted behaviour per dispatch that writes what an agent would write.
import assert from 'node:assert/strict'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/init.mjs'
import { createObserve } from '../../../../plugins/skraft-framework/engine/application/observe.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-framework/engine/application/run-pipeline.mjs'
import {
  FakeHasher, FixedClock, InMemoryAgentCatalog, InMemoryGit, InMemoryTemplates, InMemoryTracking, InMemoryWorkflowSource, InMemoryWorkspace,
  RecordingProgress, ScriptedAgentRunner, ScriptedMachine, ScriptedReplay,
} from './in-memory-host.mjs'

export const SLUG = 'checkout'
export const RESEARCH_TEMPLATE = '<!-- markdownlint-disable-file -->\n# Research: {{topic}}\n'
export const TRACKING = `/work/.copilot-tracking/skraft-plans/${SLUG}`

/** One .NET component at the root of the working copy, its tests under tests/. */
export const API = Object.freeze({
  name: 'api', root: '.', stack: 'dotnet', mocking: { strategy: 'inprocess' },
  paths: { src: ['src'], tests: ['tests'] },
  commands: { build: 'dotnet build', test: 'dotnet test' },
})

/**
 * @param {{
 *   components?: object[], config?: object, files?: Record<string, string>, behaviours?: Array<Function>,
 *   git?: InMemoryGit, machine?: ScriptedMachine, replay?: ScriptedReplay, catalog?: InMemoryAgentCatalog,
 *   workflow?: string, clock?: FixedClock,
 * }} [options] config: the rest of skraft-config.json; files: more files of the working copy
 */
export const pipelineHost = ({
  components = [API], config = {}, files = {}, behaviours = [], git = new InMemoryGit(), machine, replay, catalog = new InMemoryAgentCatalog(),
  workflow, clock = new FixedClock('2026-10-11T09:00:00.000Z'),
} = {}) => {
  const tracking = new InMemoryTracking()
  const deps = {
    journal: tracking,
    activePipeline: tracking,
    files: tracking,
    templates: new InMemoryTemplates({ 'research.template.md': RESEARCH_TEMPLATE }),
    clock,
    hasher: new FakeHasher(),
    agentRunner: new ScriptedAgentRunner(behaviours),
    progress: new RecordingProgress(),
    workspace: new InMemoryWorkspace({ 'skraft-config.json': JSON.stringify({ ...config, components }), ...files }),
    sourceControl: git,
    commandRunner: machine ?? new ScriptedMachine({ clock }),
    commitReplay: replay ?? new ScriptedReplay({ clock }),
    workflowSource: new InMemoryWorkflowSource(workflow),
    agentCatalog: catalog,
  }
  const host = {
    deps,
    tracking,
    git,
    clock,
    agentRunner: deps.agentRunner,
    progress: deps.progress,
    machine: deps.commandRunner,
    replay: deps.commitReplay,
    events: () => tracking.journal(SLUG),
    types: () => tracking.journal(SLUG).map((event) => event.type),
    /** @param {object} [request] */
    init: (request = {}) => createInit(deps).init({ slug: SLUG, ...request }),
    run: () => createRunPipeline(deps).run({ slug: SLUG }),
    view: () => createObserve(deps).view(),
    /** Init then RunPipeline. @param {object} [request] */
    start: async (request = {}) => {
      const initialised = await host.init(request)
      assert.equal(initialised.ok, true, initialised.reason)
      return host.run()
    },
  }
  return host
}

/** The last step.started of the journal: what the dispatched agent was asked for. */
const asked = (tracking) => tracking.journal(SLUG).filter((event) => event.type === 'step.started').at(-1)

/**
 * An agent that fills its outputs, writes its result, then does `work` (changes files, commits).
 * @param {{ result?: object | string | null, fill?: boolean, work?: (host: { git: InMemoryGit }) => void, answer?: object }} [behaviour]
 *   result null writes none; a string is written as is.
 */
export const agent = ({ result = { status: 'done', summary: 'done' }, fill = true, work = () => {}, answer } = {}) => (host) => async () => {
  const step = asked(host.tracking)
  if (fill) {
    for (const path of step.outputs) {
      const before = (await host.tracking.read(SLUG, path)) ?? ''
      await host.tracking.write(SLUG, path, `${before.replace(/\{\{[^{}]*\}\}/g, 'filled in')}\nFindings for ${step.step}.\n`)
    }
  }
  if (result !== null) await host.tracking.write(SLUG, step.result, typeof result === 'string' ? result : JSON.stringify(result))
  work(host)
  return answer
}

/** The red, green and refactor commits of one TDD cycle in the api component. */
export const tddCycle = (story = SLUG, name = 'Checkout') => ({ git }) => {
  git.commit(`test(${story}): ${name} pays by card`, [`tests/${name}Tests.cs`])
  git.commit(`feat(${story}): ${name} pays by card`, [`src/${name}.cs`])
  git.commit(`refactor(${story}): name the card payment`, [`src/${name}.cs`])
}

/**
 * The nominal run: each agent of the default workflow does its part.
 * @param {ReturnType<typeof pipelineHost>} host
 */
export const nominal = (host) => [
  agent()(host),
  agent({ work: ({ git }) => git.commit('docs(checkout): ADR for the card payment', ['docs/adr/adr-001-card-payment.md']) })(host),
  agent({ work: ({ git }) => git.commit('test(checkout): acceptance of the card payment', ['tests/Acceptance/CheckoutAcceptanceTests.cs']) })(host),
  agent({ work: tddCycle() })(host),
]

/** A host whose agents behave as given, scripted after the host exists. @param {Parameters<typeof pipelineHost>[0]} options @param {(host: ReturnType<typeof pipelineHost>) => Function[]} script */
export const scripted = (options, script) => {
  const host = pipelineHost(options)
  host.agentRunner.behaviours.push(...script(host))
  return host
}
