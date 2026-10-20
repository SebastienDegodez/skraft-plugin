// A whole host for RunPipeline, Init and Observe: every port is a hand-written double, the
// LLM is a scripted behaviour per dispatch that writes what an agent would write.
import assert from 'node:assert/strict'
import { answerYaml } from './answer-yaml.mjs'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { createObserve } from '../../../../plugins/skraft-framework/engine/application/pipeline/observe-usecase.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-framework/engine/application/pipeline/run-pipeline-usecase.mjs'
import { createDecide } from '../../../../plugins/skraft-framework/engine/application/decisions/decide-usecase.mjs'
import {
  FakeHasher, FixedClock, InMemoryAgentCatalog, InMemoryGit, InMemoryTemplates, InMemoryTracking, InMemoryWorkflowSource, InMemoryWorkspace,
  RecordingProgress, ScriptedAgentRunner, ScriptedHuman, ScriptedMachine, ScriptedReplay,
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
 *   workflow?: string, clock?: FixedClock, answers?: Array<{ answer: string, reason?: string } | null>,
 * }} [options] config: the rest of skraft-config.json; files: more files of the working copy;
 *   answers: what the human at the host answers, in order
 */
export const pipelineHost = ({
  components = [API], config = {}, files = {}, behaviours = [], git = new InMemoryGit(), machine, replay, catalog = new InMemoryAgentCatalog(),
  workflow, clock = new FixedClock('2026-10-11T09:00:00.000Z'), answers = [],
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
    human: new ScriptedHuman(answers),
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
    human: deps.human,
    workspace: deps.workspace,
    progress: deps.progress,
    machine: deps.commandRunner,
    replay: deps.commitReplay,
    events: () => tracking.journal(SLUG),
    types: () => tracking.journal(SLUG).map((event) => event.type),
    /** @param {object} [request] */
    init: (request = {}) => createInit(deps).init({ slug: SLUG, ...request }),
    run: () => createRunPipeline(deps).run({ slug: SLUG }),
    view: () => createObserve(deps).view(),
    /** @param {object} decision */
    decide: (decision) => createDecide(deps).decide(decision),
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
 * An agent that fills its outputs, writes its result, then does `work` (changes files, commits);
 * a solution architect also leaves a passing consistency matrix unless `records` is false.
 * @param {{ result?: object | string | null, fill?: boolean, records?: boolean, work?: (host: { git: InMemoryGit, tracking: InMemoryTracking }) => void, answer?: object }} [behaviour]
 *   result null writes none; a string is written as is.
 */
/** The consistency matrix a solution architect leaves when its documents agree. */
export const PASSING_MATRIX = Object.freeze(['details/2026-10-11/consistency-matrix-checkout.md', '| ADR | Verdict |\n- consistency-gate: PASS\n'])

export const agent = ({ result = { status: 'done', summary: 'done' }, fill = true, records = true, work = () => {}, answer } = {}) => (host) => async () => {
  const step = asked(host.tracking)
  if (records && step.agent === 'solution-architect') await host.tracking.write(SLUG, ...PASSING_MATRIX)
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

/**
 * A lens's answer as its final message.
 * @param {string} lens @param {'pass' | 'fail' | 'inconclusive'} verdict @param {object[]} [findings]
 */
export const says = (lens, verdict, findings = []) => answerYaml({ lens, verdict, findings })

/** A finding of a lens's answer. @param {string} id @param {string} severity @param {string} description @param {object} [more] */
export const finding = (id, severity, description, more = {}) => ({ id, gate: 'G1', severity, location: 'src/Checkout.cs:12', description, ...more })

/** The refuter's answer. @param {'confirmed' | 'refuted' | 'unverifiable'} verdict @param {string} [reason] */
export const refutes = (verdict, reason = `${verdict} by the patch`) => answerYaml({ verdict, reason })

/**
 * Answers lenses and the refuter from queues: `byLens[name]` for the lens `<name>-lens`,
 * `refuter` for the finding checks, in dispatch order; what a queue does not script passes or
 * is confirmed.
 * @param {Record<string, Array<string | object>> & { refuter?: Array<string | object> }} byLens
 */
export const lenses = (byLens) => {
  const queues = Object.fromEntries(Object.entries(byLens).map(([name, answers]) => [name, [...answers]]))
  return (dispatch) => {
    const name = dispatch.agent === 'finding-refuter' ? 'refuter' : dispatch.agent.replace(/-lens$/, '')
    const next = queues[name]?.shift()
    if (next !== undefined) return next
    return name === 'refuter' ? refutes('confirmed') : says(name, 'pass')
  }
}

/** The step.recorded of the review nodes: step, visit, outcome, next. @param {ReturnType<typeof pipelineHost>} host */
export const reviews = (host) => host.events()
  .filter((event) => event.type === 'step.recorded' && event.step.endsWith('_review'))
  .map(({ step, visit, outcome, next }) => [step, visit, outcome, next])
