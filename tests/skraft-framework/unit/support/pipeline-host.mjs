// A whole host for RunPipeline, Init and Observe: every port is a hand-written double, the
// LLM is a scripted behaviour per dispatch that writes what an agent would write.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { answerYaml, withContext } from './answer-yaml.mjs'
import { strykerWritesItsReports } from './mutation-reports.mjs'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { createStartMutation } from '../../../../plugins/skraft-framework/engine/application/mutation/start-mutation-usecase.mjs'
import { createObserve } from '../../../../plugins/skraft-framework/engine/application/pipeline/observe-usecase.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-framework/engine/application/pipeline/run-pipeline-usecase.mjs'
import { createDecide } from '../../../../plugins/skraft-framework/engine/application/decisions/decide-usecase.mjs'
import { createPublish } from '../../../../plugins/skraft-framework/engine/application/publish/publish-usecase.mjs'
import { createPrecheck } from '../../../../plugins/skraft-framework/engine/application/pipeline/precheck-usecase.mjs'
import {
  BUILT_IN_MUTATION, BUILT_IN_WORKFLOW, FakeHasher, FixedClock, InMemoryAgentCatalog, InMemoryCodeHost, InMemoryGit, InMemoryPullRequests, InMemoryRunLock, InMemoryTemplates, InMemoryTracking, InMemoryUserSettings, InMemoryWorkflowSource, InMemoryWorkspace,
  ManualTimer, RecordingProgress, ScriptedAgentRunner, ScriptedHuman, ScriptedMachine,
} from './in-memory-host.mjs'

export const SLUG = 'checkout'

/**
 * The docs folders the plugin's agents write in, as a repository that already has them holds
 * them; a scenario of a repository without them deletes them from the workspace.
 */
export const DOCS_FOLDERS = Object.freeze({ 'docs/adr/.gitkeep': '', 'docs/domain/event-model/.gitkeep': '', 'docs/features/.gitkeep': '' })
/** The consent questions the default workflow asks before its first agent. */
/** The publication consents settled, as /skraft-init leaves them: a configuration a run may start on. */
export const SETTLED_PUBLISH = Object.freeze({ pullRequest: false, visuals: false, questionVersions: Object.freeze({ pullRequest: 2, visuals: 1 }) })
export const RESEARCH_TEMPLATE = '<!-- markdownlint-disable-file -->\n# Research: {{topic}}\n'
export const TRACKING = `/work/.copilot-tracking/skraft-plans/${SLUG}`
/** The plugin's templates of the pull request prose the pr-writer fills, for an English story and a French one. */
export const PROSE_TEMPLATE = readFileSync(new URL('../../../../plugins/skraft-framework/assets/templates/pull-request-prose.en.template.md', import.meta.url), 'utf8')
export const PROSE_TEMPLATE_FR = readFileSync(new URL('../../../../plugins/skraft-framework/assets/templates/pull-request-prose.fr.template.md', import.meta.url), 'utf8')

/** One .NET component at the root of the working copy, its tests under tests/, mutated by Stryker.NET. */
export const API = Object.freeze({
  name: 'api', root: '.', stack: 'dotnet', mocking: { strategy: 'inprocess' },
  paths: { src: ['src'], tests: ['tests'] },
  commands: { build: 'dotnet build', test: 'dotnet test', mutation: 'dotnet stryker' },
  bdd: false,
})

/**
 * @param {{
 *   components?: object[], config?: object, files?: Record<string, string>, behaviours?: Array<Function>,
 *   git?: InMemoryGit, machine?: ScriptedMachine, catalog?: InMemoryAgentCatalog,
 *   workflow?: string, clock?: FixedClock, answers?: Array<{ answer: string, reason?: string } | null>, user?: string, codeHost?: InMemoryCodeHost,
 *   tracking?: InMemoryTracking, owner?: string, journalKeys?: import('./in-memory-host.mjs').InMemoryJournalKeys,
 * }} [options] config: the rest of skraft-config.json, where a run of a workflow that asks the publish-consent or the
 *   reporting-consent question finds publish.pullRequest or publish.visuals set to false unless config
 *   says otherwise, so that no question waits on a consent; files: more files of the working copy;
 *   answers: what the human at the host answers, in order; user: the text of ~/.skraft/config.json;
 *   tracking: the tracking folder, shared with another session's host; owner: this session's id;
 *   journalKeys: the machine's journal keys, the tracking folder's machine by default;
 *   forge: the forge the code host double stands for, github unless given; slug: the run's slug, checkout unless given;
 *   follows: the workflow the run follows by its base name, the pipeline unless given; mutation follows the plugin's
 *   mutation workflow unless workflow says otherwise
 */
export const pipelineHost = ({
  components = [API], config = {}, files = {}, behaviours = [], git = new InMemoryGit(), machine, catalog = new InMemoryAgentCatalog(),
  workflow, clock = new FixedClock('2026-10-11T09:00:00.000Z'), answers = [], user, codeHost = new InMemoryCodeHost(),
  tracking = new InMemoryTracking(), owner = 'session-a', journalKeys = tracking.journalKeys, forge = 'github',
  slug = SLUG, scenarioReviews = null, follows = 'pipeline',
} = {}) => {
  const answered = answeredConsents()
  const deps = {
    journal: tracking,
    activePipeline: tracking,
    files: tracking,
    templates: new InMemoryTemplates({ 'research.template.md': RESEARCH_TEMPLATE, 'pull-request-prose.en.template.md': PROSE_TEMPLATE, 'pull-request-prose.fr.template.md': PROSE_TEMPLATE_FR }),
    clock,
    hasher: new FakeHasher(),
    journalKeys,
    agentRunner: new ScriptedAgentRunner(behaviours),
    human: new ScriptedHuman(answers, { scenarioReviews }),
    progress: new RecordingProgress(),
    workspace: new InMemoryWorkspace({ 'skraft-config.json': JSON.stringify({ ...answered, ...config, components }), ...DOCS_FOLDERS, 'docs/architecture/context-map.md': '# Context map\n', ...files }),
    userSettings: new InMemoryUserSettings(user),
    sourceControl: git,
    commandRunner: machine ?? new ScriptedMachine({ clock }),
    workflowSource: follows === 'pipeline' ? new InMemoryWorkflowSource(workflow) : new InMemoryWorkflowSource(workflow ?? BUILT_IN_MUTATION, undefined, follows),
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
    codeHost,
    timer: deps.timer,
    /** The lock file of the pipeline, null when none. */
    lock: () => tracking.files.get(`${slug}/.lock`) ?? null,
    /** What the next pr-writers do, in order; once spent, each writes PROSE. @type {Array<ReturnType<typeof prWriter>>} */
    prWriters: [],
    events: () => tracking.journal(slug),
    types: () => tracking.journal(slug).map((event) => event.type),
    /** @param {object} [request] */
    init: (request = {}) => (follows === 'mutation' ? createStartMutation(deps).start() : createInit(deps).init({ slug, ...request })),
    run: () => createRunPipeline(deps).run({ slug }),
    view: () => createObserve(deps).view(),
    report: () => createObserve(deps).report(),
    /** @param {{ last: number }} [request] */
    journal: (request = { last: 1000 }) => createObserve(deps).journal(request),
    /** @param {object} decision */
    decide: (decision) => createDecide(deps).decide(decision),
    /** skraft publish. */
    publish: () => createPublish(deps).publish(),
    /** skraft precheck, as a producer agent calls it during its attempt. @param {object} [request] */
    precheck: (request = {}) => createPrecheck(deps).precheck(request),
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

/** The publication consents settled, as /skraft-init leaves them, so that no run is refused for want of them. */
const answeredConsents = () => ({ publish: SETTLED_PUBLISH })

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

/**
 * @param {{ result?: object | string | null, fill?: boolean, records?: boolean, work?: Function, answer?: object, plan?: Array<[string, string?, string?]>, exemption?: string }} [behaviour]
 *   plan: the scenarios the acceptance designer lists on the pass that writes them, each `[title, component, tags]`;
 *   one walking skeleton in the first component unless given; exemption: the walking skeleton exemption it declares under them
 */
export const agent = ({ result = { status: 'done', summary: 'done' }, fill = true, records = true, work, answer, plan, exemption } = {}) => (host) => async () => {
  const step = asked(host)
  const matrix = records && step.agent === 'solution-architect'
  const [matrixPath, matrixText] = passingMatrix(host.slug)
  if (matrix) await host.tracking.write(host.slug, matrixPath, matrixText)
  if (fill) {
    for (const path of step.outputs.filter((output) => !(matrix && output === matrixPath))) {
      const before = (await host.tracking.read(host.slug, path)) ?? ''
      await host.tracking.write(host.slug, path, `${before.replace(/\{\{[^{}]*\}\}/g, 'filled in')}\nFindings for ${step.step}.\n${plansScenarios(step) ? scenarioTable(host, plan, exemption) : ''}`)
    }
  }
  if (result !== null) await host.tracking.write(host.slug, step.result, typeof result === 'string' ? result : JSON.stringify(result))
  await (work ?? scenarioWork(host, step, exemption))(host)
  return answer
}

/**
 * What a scripted agent with no work of its own commits, as its descriptor asks: the acceptance
 * designer one red holding the walking skeleton and every acceptance test on the pass that writes
 * the plan (the acceptance tests alone for a story exempt of a walking skeleton), the software
 * engineer one green per group of the plan the story is still owed; nothing on any other pass.
 * @param {ReturnType<typeof pipelineHost>} host @param {object} step its step.started @param {string} [exemption]
 */
const scenarioWork = (host, step, exemption) => {
  if (plansScenarios(step)) return exemption === undefined ? scenarioCommit(host, { type: 'test', subject: 'walking skeleton', paths: 'tests', file: 'Integration/WalkingSkeletonTests.cs' }) : scenarioCommit(host, { type: 'test', subject: 'acceptance tests', paths: 'tests', file: 'Acceptance/AcceptanceTests.cs' })
  const owed = step.agent === 'software-engineer' ? groupsOwed(host) : []
  return (repos) => owed.forEach(({ index, label }) => scenarioCommit(host, { type: 'feat', subject: `${label} group ${index}`, paths: 'src', file: `Scenario${index}.cs` })(repos))
}

/**
 * The groups of the last plan no green made pass yet, each with its subject label, from the
 * journal: the story's delivery pass owes them all.
 * @param {ReturnType<typeof pipelineHost>} host
 */
const groupsOwed = (host) => {
  const recorded = host.events().filter((event) => event.type === 'step.recorded')
  const planned = recorded.findLast((event) => event.groups !== undefined)
  const delivered = Math.max(0, ...recorded.map((event) => event.green?.group ?? 0))
  return (planned?.groups ?? []).filter(({ index }) => index > delivered).map(({ index, scenarios }) => ({ index, label: scenarios.map((number) => `S${number}`).join(', ') }))
}

/**
 * A commit of the scenario in the first component, under its first path of that kind, its body
 * referencing the story's issue when it has one.
 * @param {ReturnType<typeof pipelineHost>} host @param {{ type: string, index?: number, subject?: string, paths: 'src' | 'tests', file: string }} commit
 */
const scenarioCommit = (host, { type, index, subject = `scenario ${index}`, paths, file }) => ({ git }) => {
  const [first = { root: '.', paths: { [paths]: [paths] } }] = JSON.parse(host.workspace.files.get('skraft-config.json')).components ?? []
  const folder = [first.root, first.paths?.[paths]?.[0]].filter((part) => part && part !== '.').join('/')
  const issue = host.events()[0]?.story?.issue
  git.commit(`${type}(${host.slug}): ${subject}`, [`${folder === '' ? '' : `${folder}/`}${file}`], issue ? `Refs: #${issue}` : '')
}

/** The pass of the acceptance designer that writes the story's scenarios. @param {object} step */
const plansScenarios = (step) => step.agent === 'acceptance-designer' && step.outputs.some((path) => path.includes('/test-plan-'))

/**
 * The Scenarios table of a test plan: the scenarios given, or one walking skeleton in the first
 * component of the configuration; then the walking skeleton exemption, when one is given.
 * @param {ReturnType<typeof pipelineHost>} host @param {Array<[string, string?, string?]> | undefined} plan @param {string} [exemption]
 */
export const scenarioTable = (host, plan, exemption) => {
  const [first = { name: 'api' }] = JSON.parse(host.workspace.files.get('skraft-config.json') ?? '{}').components ?? []
  const rows = (plan ?? [['Customer pays by card']]).map(([title, component = first.name, tags], index) => `| S${index + 1} | ${title} | ${component} | ${tags ?? (index === 0 ? '@walking-skeleton' : '@happy-path')} |`)
  return `\n## Scenarios\n\n| # | Scenario | Component | Tags |\n|---|---|---|---|\n${rows.join('\n')}\n${exemption === undefined ? '' : `\nWalking skeleton exemption: ${exemption}\n`}`
}

/**
 * The scenario review a human is asked on a story whose plan is the default one, a single
 * scenario in one group: the walking skeleton and its acceptance test the red commit given.
 * @param {{ sha?: string, subject?: string, files?: string, key?: string }} [red]
 */
export const scenarioReview = ({ sha = 'root-1', subject = `test(${SLUG}): walking skeleton`, files = 'tests/Integration/WalkingSkeletonTests.cs', key = 'scenario_review-1' } = {}) => ({
  key,
  kind: 'scenario-review',
  text: `Read the 1 scenario of the story before DELIVER builds them: S1 "Customer pays by card" (api; @walking-skeleton). DELIVER makes them pass in one pass, one commit per group, in this order: 1. S1. The acceptance tests of every scenario, the walking skeleton and the skeleton of its chain are commit ${sha} "${subject}": ${files}. skraft does not run them: check that each fails on its own assertion; the designer's run is in ${TRACKING}/logs/distill-1-red.log. APPROVED delivers them; REVISE sends DISTILL back with your corrections (edit the .feature or the test yourself first if you like, and say so).`,
  options: ['APPROVED', 'REVISE'],
  refusals: ['REVISE'],
  header: 'Scenarios',
})

/** What a pr-writer writes by default. */
export const PROSE = Object.freeze({
  summary: 'Pay by card at checkout',
  what: 'Checkout takes a card payment and records it.',
  why: 'Customers asked to pay by card instead of on delivery.',
  limitations: 'Refunds are out of scope.',
})

/**
 * A pr-writer that fills its template, the French one when the engine pre-created it, with the
 * prose given, then writes its result.
 * @param {Partial<typeof PROSE>} [prose]
 */
export const prWriter = (prose = {}) => (host) => async () => {
  const step = asked(host)
  const { summary, what, why, limitations } = { ...PROSE, ...prose }
  const precreated = (await host.tracking.read(host.slug, step.outputs[0])) ?? ''
  const filled = (precreated.includes('\n## Ce qui change\n') ? PROSE_TEMPLATE_FR : PROSE_TEMPLATE).replace('{{summary}}', summary).replace('{{what}}', what).replace('{{why}}', why).replace('{{limitations}}', limitations)
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
 * The one green commit that makes a group of scenarios pass in the api component: the code and
 * the unit tests of its inner loop, its subject starting with the group's scenarios.
 * @param {string} [story] @param {string} [name] @param {string} [body] its body: `Refs: #<issue>` for a story with one
 * @param {string} [label] the group's scenarios, as its green names them
 */
export const green = (story = SLUG, name = 'Checkout', body = '', label = 'S1') => ({ git }) => {
  git.commit(`feat(${story}): ${label} ${name} pays by card`, [`src/${name}.cs`, `tests/${name}Tests.cs`], body)
}

/**
 * The nominal run: each agent of the default workflow does its part, the story's one scenario
 * committed red by DISTILL, then green by DELIVER.
 * @param {ReturnType<typeof pipelineHost>} host
 * @param {string} [body] each commit's body: `Refs: #<issue>` for a story with one
 */
export const nominal = (host, body = '') => [
  agent()(host),
  agent({ work: ({ git }) => git.change('docs/adr/adr-001-card-payment.md') })(host),
  agent({ work: ({ git }) => git.commit('test(checkout): acceptance of the card payment', ['tests/Acceptance/CheckoutAcceptanceTests.cs'], body) })(host),
  agent({ work: green(SLUG, 'Checkout', body) })(host),
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

/**
 * A finding of a lens's answer, with the context every finding carries: why its severity, its
 * drift, where it holds (its location unless `more` names others).
 * @param {string} id @param {string} severity @param {string} description @param {object} [more]
 */
export const finding = (id, severity, description, more = {}) => withContext({ id, gate: 'G1', severity, location: 'src/Checkout.cs:12', description, ...more })


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
