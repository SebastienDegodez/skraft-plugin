// A whole host for RunPipeline, Init and Observe: every port is a hand-written double, the
// LLM is a scripted behaviour per dispatch that writes what an agent would write.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { answerYaml } from './answer-yaml.mjs'
import { strykerWritesItsReports } from './mutation-reports.mjs'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { createObserve } from '../../../../plugins/skraft-framework/engine/application/pipeline/observe-usecase.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-framework/engine/application/pipeline/run-pipeline-usecase.mjs'
import { createDecide } from '../../../../plugins/skraft-framework/engine/application/decisions/decide-usecase.mjs'
import { createPublish } from '../../../../plugins/skraft-framework/engine/application/publish/publish-usecase.mjs'
import {
  BUILT_IN_WORKFLOW, FakeHasher, FixedClock, InMemoryAgentCatalog, InMemoryCodeHost, InMemoryGit, InMemoryPullRequests, InMemoryRunLock, InMemoryTemplates, InMemoryTracking, InMemoryUserSettings, InMemoryWorkflowSource, InMemoryWorkspace,
  ManualTimer, RecordingProgress, ScriptedAgentRunner, ScriptedHuman, ScriptedMachine, ScriptedReplay,
} from './in-memory-host.mjs'

export const SLUG = 'checkout'
/** The consent questions the default workflow asks before its first agent. */
export const CONSENTS = Object.freeze(['publish_consent', 'visuals_consent'])
export const RESEARCH_TEMPLATE = '<!-- markdownlint-disable-file -->\n# Research: {{topic}}\n'
export const TRACKING = `/work/.copilot-tracking/skraft-plans/${SLUG}`
/** The plugin's template of the pull request prose the pr-writer fills. */
export const PROSE_TEMPLATE = readFileSync(new URL('../../../../plugins/skraft-framework/assets/templates/pull-request-prose.template.md', import.meta.url), 'utf8')

/** One .NET component at the root of the working copy, its tests under tests/, mutated by Stryker.NET. */
export const API = Object.freeze({
  name: 'api', root: '.', stack: 'dotnet', mocking: { strategy: 'inprocess' },
  paths: { src: ['src'], tests: ['tests'] },
  commands: { build: 'dotnet build', test: 'dotnet test', mutation: 'dotnet stryker' },
})

/**
 * @param {{
 *   components?: object[], config?: object, files?: Record<string, string>, behaviours?: Array<Function>,
 *   git?: InMemoryGit, machine?: ScriptedMachine, replay?: ScriptedReplay, catalog?: InMemoryAgentCatalog,
 *   workflow?: string, clock?: FixedClock, answers?: Array<{ answer: string, reason?: string } | null>, user?: string, codeHost?: InMemoryCodeHost,
 *   tracking?: InMemoryTracking, owner?: string, journalKeys?: import('./in-memory-host.mjs').InMemoryJournalKeys,
 * }} [options] config: the rest of skraft-config.json, where a run of a workflow that asks the publish-consent or the
 *   reporting-consent question finds publish.pullRequest or publish.visuals set to false unless config
 *   says otherwise, so that no question waits on a consent; files: more files of the working copy;
 *   answers: what the human at the host answers, in order; user: the text of ~/.skraft/config.json;
 *   tracking: the tracking folder, shared with another session's host; owner: this session's id;
 *   journalKeys: the machine's journal keys, the tracking folder's machine by default;
 *   forge: the forge the code host double stands for, github unless given; slug: the run's slug, checkout unless given
 */
export const pipelineHost = ({
  components = [API], config = {}, files = {}, behaviours = [], git = new InMemoryGit(), machine, replay, catalog = new InMemoryAgentCatalog(),
  workflow, clock = new FixedClock('2026-10-11T09:00:00.000Z'), answers = [], user, codeHost = new InMemoryCodeHost(),
  tracking = new InMemoryTracking(), owner = 'session-a', journalKeys = tracking.journalKeys, forge = 'github',
  slug = SLUG,
} = {}) => {
  const answered = answeredConsents(workflow ?? BUILT_IN_WORKFLOW)
  const deps = {
    journal: tracking,
    activePipeline: tracking,
    files: tracking,
    templates: new InMemoryTemplates({ 'research.template.md': RESEARCH_TEMPLATE, 'pull-request-prose.template.md': PROSE_TEMPLATE }),
    clock,
    hasher: new FakeHasher(),
    journalKeys,
    agentRunner: new ScriptedAgentRunner(behaviours),
    human: new ScriptedHuman(answers),
    progress: new RecordingProgress(),
    workspace: new InMemoryWorkspace({ 'skraft-config.json': JSON.stringify({ ...answered, ...config, components }), 'docs/architecture/context-map.md': '# Context map\n', ...files }),
    userSettings: new InMemoryUserSettings(user),
    sourceControl: git,
    commandRunner: machine ?? new ScriptedMachine({ clock }),
    commitReplay: replay ?? new ScriptedReplay({ clock }),
    workflowSource: new InMemoryWorkflowSource(workflow),
    agentCatalog: catalog,
    forges: { [forge]: { codeHost, pullRequests: new InMemoryPullRequests({ repository: codeHost.named }) } },
    runLock: new InMemoryRunLock(tracking, owner),
    timer: new ManualTimer(clock),
  }
  strykerWritesItsReports(deps)
  const host = {
    deps,
    slug,
    tracking,
    git,
    clock,
    agentRunner: deps.agentRunner,
    human: deps.human,
    workspace: deps.workspace,
    progress: deps.progress,
    machine: deps.commandRunner,
    replay: deps.commitReplay,
    codeHost,
    timer: deps.timer,
    /** The lock file of the pipeline, null when none. */
    lock: () => tracking.files.get(`${slug}/.lock`) ?? null,
    /** What the next pr-writers do, in order; once spent, each writes PROSE. @type {Array<ReturnType<typeof prWriter>>} */
    prWriters: [],
    events: () => tracking.journal(slug),
    types: () => tracking.journal(slug).map((event) => event.type),
    /** @param {object} [request] */
    init: (request = {}) => createInit(deps).init({ slug, ...request }),
    run: () => createRunPipeline(deps).run({ slug }),
    view: () => createObserve(deps).view(),
    report: () => createObserve(deps).report(),
    /** @param {{ last: number }} [request] */
    journal: (request = { last: 1000 }) => createObserve(deps).journal(request),
    /** @param {object} decision */
    decide: (decision) => createDecide(deps).decide(decision),
    /** skraft publish. */
    publish: () => createPublish(deps).publish(),
    /** Init then RunPipeline. @param {object} [request] */
    start: async (request = {}) => {
      const initialised = await host.init(request)
      assert.equal(initialised.ok, true, initialised.reason)
      return host.run()
    },
  }
  codeHost.read = (file) => tracking.files.get(file.slice(`${tracking.root}/`.length)) ?? ''
  deps.agentRunner.writer = (dispatch) => (host.prWriters.shift() ?? prWriter())(host)(dispatch)
  return host
}

/** publish set to false for each consent the workflow asks, none when it asks neither. @param {string} workflow */
const answeredConsents = (workflow) => {
  const publish = {
    ...(workflow.includes('"publish-consent"') ? { pullRequest: false } : {}),
    ...(workflow.includes('"reporting-consent"') ? { visuals: false } : {}),
  }
  return Object.keys(publish).length > 0 ? { publish } : {}
}

/** The last step.started of the journal: what the dispatched agent was asked for. */
const asked = (host) => host.tracking.journal(host.slug).filter((event) => event.type === 'step.started').at(-1)

/**
 * An agent that fills its outputs, writes its result, then does `work` (changes files, commits);
 * a solution architect leaves a passing consistency matrix as its output unless `records` is false.
 * @param {{ result?: object | string | null, fill?: boolean, records?: boolean, work?: (host: { git: InMemoryGit, tracking: InMemoryTracking }) => void, answer?: object }} [behaviour]
 *   result null writes none; a string is written as is.
 */
/** The consistency matrix a solution architect leaves when its documents agree. */
const passingMatrix = (slug) => Object.freeze([`details/2026-10-11/consistency-matrix-${slug}.md`, '| ADR | Verdict |\n- docs-relied-on: docs/architecture/context-map.md\n- consistency-gate: PASS\n'])
export const PASSING_MATRIX = passingMatrix(SLUG)

export const agent = ({ result = { status: 'done', summary: 'done' }, fill = true, records = true, work = () => {}, answer } = {}) => (host) => async () => {
  const step = asked(host)
  const matrix = records && step.agent === 'solution-architect'
  const [matrixPath, matrixText] = passingMatrix(host.slug)
  if (matrix) await host.tracking.write(host.slug, matrixPath, matrixText)
  if (fill) {
    for (const path of step.outputs.filter((output) => !(matrix && output === matrixPath))) {
      const before = (await host.tracking.read(host.slug, path)) ?? ''
      await host.tracking.write(host.slug, path, `${before.replace(/\{\{[^{}]*\}\}/g, 'filled in')}\nFindings for ${step.step}.\n`)
    }
  }
  if (result !== null) await host.tracking.write(host.slug, step.result, typeof result === 'string' ? result : JSON.stringify(result))
  work(host)
  return answer
}

/** What a pr-writer writes by default. */
export const PROSE = Object.freeze({
  summary: 'Pay by card at checkout',
  what: 'Checkout takes a card payment and records it.',
  why: 'Customers asked to pay by card instead of on delivery.',
  limitations: 'Refunds are out of scope.',
})

/**
 * A pr-writer that fills its template with the prose given, then writes its result.
 * @param {Partial<typeof PROSE>} [prose]
 */
export const prWriter = (prose = {}) => (host) => async () => {
  const step = asked(host)
  const { summary, what, why, limitations } = { ...PROSE, ...prose }
  const filled = PROSE_TEMPLATE.replace('{{summary}}', summary).replace('{{what}}', what).replace('{{why}}', why).replace('{{limitations}}', limitations)
  await host.tracking.write(host.slug, step.outputs[0], filled)
  await host.tracking.write(host.slug, step.result, JSON.stringify({ status: 'done', summary: 'prose written' }))
}

/** The body of a commit for the story's issue 42. */
export const REFS_42 = 'Refs: #42'

/**
 * The red, green and refactor commits of one TDD cycle in the api component.
 * @param {string} [story] @param {string} [name] @param {string} [body] each commit's body: `Refs: #<issue>` for a story with one
 */
export const tddCycle = (story = SLUG, name = 'Checkout', body = '') => ({ git }) => {
  git.commit(`test(${story}): ${name} pays by card`, [`tests/${name}Tests.cs`], body)
  git.commit(`feat(${story}): ${name} pays by card`, [`src/${name}.cs`], body)
  git.commit(`refactor(${story}): name the card payment`, [`src/${name}.cs`], body)
}

/**
 * The nominal run: each agent of the default workflow does its part.
 * @param {ReturnType<typeof pipelineHost>} host
 * @param {string} [body] each commit's body: `Refs: #<issue>` for a story with one
 */
export const nominal = (host, body = '') => [
  agent()(host),
  agent({ work: ({ git }) => git.commit('docs(checkout): ADR for the card payment', ['docs/adr/adr-001-card-payment.md'], body) })(host),
  agent({ work: ({ git }) => git.commit('test(checkout): acceptance of the card payment', ['tests/Acceptance/CheckoutAcceptanceTests.cs'], body) })(host),
  agent({ work: tddCycle(SLUG, 'Checkout', body) })(host),
]

/** A host whose agents behave as given, scripted after the host exists. @param {Parameters<typeof pipelineHost>[0]} options @param {(host: ReturnType<typeof pipelineHost>) => Function[]} script */
/**
 * A script whose forge stops being reachable once the run is past its start (and its consent),
 * as the first agent works: the reason the forge's adapter then gives.
 * @param {(host: any) => Array<() => Promise<unknown>>} script @param {string} reason
 */
export const forgeLostAtFirstAgent = (script, reason) => (host) => {
  const [first, ...rest] = script(host)
  return [async () => { host.codeHost.missing = reason; return first() }, ...rest]
}

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
