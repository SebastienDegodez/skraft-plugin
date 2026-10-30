import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, reportMarkdown, requiredFailures, runProbe, toolText } from '../../../eng/host-probe/copilot-probe.mjs'
import { planIssueActions } from '../../../eng/host-probe/issues.mjs'
import { CONFIGURED_MODELS, NATIVE_TOOLS, REFUSALS, WORKFLOWS_UNAVAILABLE, notRegistered, simulatedSdk } from './simulated-copilot-host.mjs'

const FAST = { tools: 50, isolationTools: 50, poll: 10, settle: 0 }
const ENVIRONMENT = { copilot: '1.0.100', sdk: 'test', node: 'v22', os: 'linux' }

const probe = async (t, host, models = CONFIGURED_MODELS, agentCalls = false) => {
  const workRoot = await mkdtemp(join(tmpdir(), 'skraft-host-probe-test-'))
  t.after(() => rm(workRoot, { recursive: true, force: true }))
  const home = join(workRoot, 'home')
  const report = await runProbe({ sdk: simulatedSdk({ ...host, home }), environment: ENVIRONMENT, workRoot, home, models, agentCalls, timings: FAST })
  return { report, verdicts: Object.fromEntries(report.checks.map((item) => [item.id, item.verdict])) }
}

test('on a host that behaves as the issues say, every host premise is measured, the fixed driver no longer shows the premises of its issues, and every requirement passes', async (t) => {
  const { report, verdicts } = await probe(t)

  assert.deepEqual(verdicts, {
    'extension-loads-agent-plugins': 'pass',
    'extension-loads-claude-plugin': 'pass',
    'cwd-after-cd': 'pass',
    'snapshot-working-directory': 'pass',
    'confirm-from-tool': 'pass',
    'confirm-in-autopilot': 'pass',
    'confirm-from-workflow': 'pass',
    'confirm-joined-session-from-workflow': 'pass',
    'select-joined-session-from-workflow': 'pass',
    'input-joined-session-from-workflow': 'pass',
    'throwing-workflow': 'pass',
    'workflow-undeclared-phase': 'pass',
    'copilot-model-refusal': 'inconclusive',
    'copilot-effort-refusal': 'inconclusive',
    'agent-skills-preload': 'inconclusive',
    'broken-workflow-isolation': 'pass',
    'bad-tool-name-isolation': 'pass',
    'canvas-accepted-at-join': 'pass',
    'canvas-open-headless': 'pass',
    'canvas-action-invoke': 'pass',
    'confirm-from-canvas': 'pass',
    'canvas-close': 'pass',
    'canvas-open-from-extension': 'pass',
    'canvas-reopen-other-tab': 'pass',
    'canvas-agent-tools': 'pass',
    'mcp-tool-from-workflow': 'pass',
    'mcp-permission-from-workflow': 'pass',
    'mcp-unavailable-from-workflow': 'pass',
    'mcp-tool-error-from-workflow': 'pass',
    'github-mcp-in-session': 'inconclusive',
    'skraft-extension-loaded': 'pass',
    'skraft-workflow-registered': 'pass',
    'unknown-arg-ignored': 'fail',
    'decide-without-confirm': 'fail',
    'skraft-canvas-registered': 'pass',
    'skraft-canvas-opens': 'pass',
    'skraft-canvas-read-only': 'pass',
    'skraft-decide-one-question': 'pass',
    'decide-after-cd': 'fail',
    'session-agents': 'pass',
    'copilot-models-available': 'pass',
    'skraft-tool-names-free': 'pass',
  })
  assert.deepEqual(report.checks.find((item) => item.id === 'skraft-tool-names-free').observed, { native: ['bash', 'edit', 'view'], skraft: ['skraft_decide'], collisions: [] })
  assert.deepEqual(report.checks.find((item) => item.id === 'bad-tool-name-isolation').observed, { status: 'rpc-error', error: notRegistered('skraft-probe-iso') })
  const decided = report.checks.find((item) => item.id === 'decide-without-confirm')
  assert.deepEqual(decided.observed.answeredBy, [])
  assert.equal(decided.observed.hostAsked, 1)
  assert.equal(report.checks.find((item) => item.id === 'decide-after-cd').observed.answeredInSecondRepo, true)
  assert.deepEqual(['select', 'input'].map((kind) => report.checks.find((item) => item.id === `${kind}-joined-session-from-workflow`).observed), [
    { accepted: { elicitation: true, value: 'RATIFIED' }, declined: { elicitation: true, value: null }, requests: [{ fields: ['selection'], options: ['RATIFIED', 'REJECTED'] }, { fields: ['selection'], options: ['RATIFIED', 'REJECTED'] }] },
    { accepted: { elicitation: true, value: 'skraft probe instruction' }, declined: { elicitation: true, value: null }, requests: [{ fields: ['value'], options: null }, { fields: ['value'], options: null }] },
  ])
})

test('with --agent-calls, a skill an agent lists under skills is measured as preloaded only when that agent knows its token and its twin without the field does not', async (t) => {
  const knowsOf = (report) => report.checks.find((item) => item.id === 'agent-skills-preload')
  assert.deepEqual(knowsOf((await probe(t, {})).report).observed.reason, 'needs --agent-calls: each of these checks starts one agent, which may spend AI credits')

  const preloads = knowsOf((await probe(t, { preload: 'preloads' }, CONFIGURED_MODELS, true)).report)
  assert.deepEqual([preloads.verdict, preloads.observed.preloadingKnows, preloads.observed.plainKnows], ['pass', true, false])

  const ignores = knowsOf((await probe(t, { preload: 'ignores' }, CONFIGURED_MODELS, true)).report)
  assert.deepEqual([ignores.verdict, ignores.observed.preloadingKnows, ignores.observed.plainKnows], ['fail', false, false])

  const leaks = knowsOf((await probe(t, { preload: 'everyone-knows' }, CONFIGURED_MODELS, true)).report)
  assert.deepEqual([leaks.verdict, leaks.observed.plainKnows], ['inconclusive', true])

  const unlisted = knowsOf((await probe(t, { preload: 'preloads', agents: [] }, CONFIGURED_MODELS, true)).report)
  assert.deepEqual([unlisted.verdict, unlisted.observed.reason], ['inconclusive', 'the probe agents are not in session.rpc.agent.list'])
})

test('without --agent-calls no agent is started; with it, a refusal of the model or of the effort passes when the driver reads it as such, or when the host accepts the call', async (t) => {
  const { report } = await probe(t)
  assert.deepEqual(report.checks.find((item) => item.id === 'copilot-effort-refusal').observed.reason, 'needs --agent-calls: each of these checks starts one agent, which may spend AI credits')
  assert.match(reportMarkdown(report), /Aucun appel de modèle/)

  const called = await probe(t, {}, CONFIGURED_MODELS, true)
  assert.deepEqual(['copilot-model-refusal', 'copilot-effort-refusal'].map((id) => called.report.checks.find((item) => item.id === id)), [
    { id: 'copilot-model-refusal', verdict: 'pass', expected: called.report.checks.find((item) => item.id === 'copilot-model-refusal').expected, observed: { asked: { model: 'skraft-probe-no-such-model' }, accepted: false, error: REFUSALS.model, classified: 'model' }, title: 'V2 — refus Copilot non reconnu par le pilote (copilot-model-refusal)', labels: ['bug', 'gain:reliability'], body: called.report.checks.find((item) => item.id === 'copilot-model-refusal').body },
    { id: 'copilot-effort-refusal', verdict: 'pass', expected: called.report.checks.find((item) => item.id === 'copilot-effort-refusal').expected, observed: { asked: { model: 'copilot-small', reasoningEffort: 'max' }, accepted: false, error: REFUSALS.effort, classified: 'effort' }, title: 'V2 — refus Copilot non reconnu par le pilote (copilot-effort-refusal)', labels: ['bug', 'gain:reliability'], body: called.report.checks.find((item) => item.id === 'copilot-effort-refusal').body },
  ])
  assert.match(reportMarkdown(called.report), /Appels d'agent \(--agent-calls\)/)

  const accepting = await probe(t, { refusals: { model: null, effort: null } }, CONFIGURED_MODELS, true)
  assert.deepEqual(accepting.report.checks.filter(({ id }) => id.endsWith('-refusal')).map(({ verdict, observed }) => [verdict, observed.accepted]), [['pass', true], ['pass', true]])

  const unread = await probe(t, { refusals: { model: 'no such thing', effort: 'max is out of range' } }, CONFIGURED_MODELS, true)
  assert.deepEqual(unread.report.checks.filter(({ id }) => id.endsWith('-refusal')).map(({ verdict, observed }) => [verdict, observed.classified]), [['fail', null], ['fail', null]])
  assert.deepEqual(planIssueActions(unread.report, { openTitles: new Set() }).filter((action) => action.kind === 'open').map((action) => action.check), ['copilot-model-refusal', 'copilot-effort-refusal'])

  const anthropicOnly = await probe(t, { models: ['claude-sonnet-5.5', 'auto'] }, {}, true)
  assert.deepEqual(anthropicOnly.report.checks.find((item) => item.id === 'copilot-effort-refusal').observed, { reason: 'listModels names no model outside Anthropic' })
})

test('a canvas opens headless on its loopback page, its action and the page\'s confirmation reach the host, and its close reaches the extension', async (t) => {
  const { report } = await probe(t)
  const observed = (id) => report.checks.find((item) => item.id === id).observed

  assert.deepEqual(observed('canvas-accepted-at-join'), { toolOffered: true, canvasListed: true, error: null, createCanvas: true })
  assert.match(observed('canvas-open-headless').url, /^http:\/\/127\.0\.0\.1:\d+\/\?t=skraft-probe-token$/)
  assert.deepEqual({ ...observed('canvas-open-headless'), url: null, sessionWorkingDirectory: null }, { error: null, url: null, queryKept: true, sameUrlAgain: true, page: 200, openCalls: 2, hostCanvases: null, sessionWorkingDirectory: null, title: 'skraft probe canvas' })
  assert.deepEqual(observed('canvas-action-invoke'), { error: null, result: { result: { ok: true, opened: 2 } } })
  assert.deepEqual(observed('confirm-from-canvas'), { answer: { value: true, error: null }, hostAsked: 1 })
  assert.deepEqual(observed('canvas-close'), { closed: ['skraft-probe-instance'] })
  assert.deepEqual({ ...observed('canvas-reopen-other-tab'), firstUrl: null, againUrl: null, keptUrl: null }, { error: null, inputs: [{}, { tab: 'configuration' }], firstUrl: null, againUrl: null, keptUrl: null, keptInput: { tab: 'configuration' }, openedEvents: null })
  assert.match(observed('canvas-reopen-other-tab').againUrl, /\?t=skraft-probe-token&tab=configuration$/)
  assert.equal(observed('canvas-reopen-other-tab').keptUrl, observed('canvas-reopen-other-tab').againUrl)
  assert.deepEqual(observed('canvas-agent-tools'), { without: [], withRenderer: ['invoke_canvas_action', 'list_canvas_capabilities', 'open_canvas'] })
})

test('a host that refuses a join carrying a canvas fails both canvas requirements, opens one issue for each, and measures nothing else of the canvases; skraft joins without its canvas', async (t) => {
  const { report, verdicts } = await probe(t, { refuseCanvases: true })

  assert.equal(verdicts['canvas-accepted-at-join'], 'fail')
  assert.deepEqual(report.checks.find((item) => item.id === 'canvas-accepted-at-join').observed, { toolOffered: false, canvasListed: false, error: null, createCanvas: null })
  assert.deepEqual(['canvas-open-headless', 'canvas-action-invoke', 'confirm-from-canvas', 'canvas-close', 'canvas-agent-tools', 'skraft-canvas-opens', 'skraft-canvas-read-only'].map((id) => verdicts[id]), ['inconclusive', 'inconclusive', 'inconclusive', 'inconclusive', 'inconclusive', 'inconclusive', 'inconclusive'])
  assert.deepEqual([verdicts['skraft-canvas-registered'], verdicts['skraft-extension-loaded']], ['fail', 'pass'])
  assert.deepEqual(planIssueActions(report, { openTitles: new Set() }).filter((action) => action.kind === 'open').map((action) => action.check), ['canvas-accepted-at-join', 'skraft-canvas-registered'])
})

test('the skraft-pipeline canvas opens on the pipeline that waits on adr-0 and shows its question on the page\'s stream, but takes no answer; skraft_decide puts that question once and records the option chosen', async (t) => {
  const { report } = await probe(t)
  const observed = (id) => report.checks.find((item) => item.id === id).observed

  assert.deepEqual(observed('skraft-canvas-registered'), { declared: true, error: null })
  assert.deepEqual(observed('skraft-canvas-opens'), {
    error: null, title: 'skraft probe-question', status: 'waiting', loopback: true, tokenInUrl: true, page: 200, pageWithoutToken: 403,
    csp: "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'", question: 'adr-0', contentStatus: 'waiting',
  })
  assert.deepEqual(observed('skraft-canvas-read-only'), { posted: { status: 404, body: { error: 'nothing here' } }, answeredBy: [], hostAsked: 0 })
  assert.deepEqual(observed('skraft-decide-one-question'), {
    toolResult: 'Recorded: probe-question: adr-0 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).',
    requests: [{ fields: ['selection'], options: ['RATIFIED', 'REJECTED'] }], answered: [['RATIFIED', 'host-confirmed']],
  })
})

test('a host that cannot open a canvas fails both open requirements and the open from the extension, and the skraft canvas page is not measured', async (t) => {
  const { report, verdicts } = await probe(t, { refuseCanvasOpen: true })

  assert.deepEqual(['canvas-open-headless', 'skraft-canvas-opens', 'skraft-canvas-read-only', 'canvas-open-from-extension'].map((id) => verdicts[id]), ['fail', 'fail', 'inconclusive', 'fail'])
  assert.equal(report.checks.find((item) => item.id === 'skraft-canvas-opens').observed.error, 'Canvas rendering is not available')
  assert.deepEqual(planIssueActions(report, { openTitles: new Set() }).filter((action) => action.kind === 'open').map((action) => action.check), ['canvas-open-headless', 'skraft-canvas-opens'])
})

test('a host that only focuses an open instance, without calling open again, fails the reopen check: an open page could not be moved to another tab', async (t) => {
  const { report, verdicts } = await probe(t, { reopenFocusesOnly: true })

  assert.equal(verdicts['canvas-reopen-other-tab'], 'fail')
  assert.deepEqual(report.checks.find((item) => item.id === 'canvas-reopen-other-tab')?.observed.inputs, [{}])
})

test('a host that drops the query string of a canvas url fails both open requirements: the skraft page cannot be read without its token', async (t) => {
  const { report, verdicts } = await probe(t, { dropCanvasQuery: true })

  assert.deepEqual(['canvas-open-headless', 'skraft-canvas-opens', 'skraft-canvas-read-only'].map((id) => verdicts[id]), ['fail', 'fail', 'inconclusive'])
  assert.equal(report.checks.find((item) => item.id === 'canvas-open-headless').observed.queryKept, false)
  assert.equal(report.checks.find((item) => item.id === 'skraft-canvas-opens').observed.tokenInUrl, false)
})

test('a joined session that declares no elicitation leaves the question skraft_decide should put unasked and unrecorded, and its check fails', async (t) => {
  const { report, verdicts } = await probe(t, { joinedElicitation: false })

  assert.equal(verdicts['skraft-decide-one-question'], 'fail')
  assert.deepEqual(report.checks.find((item) => item.id === 'skraft-decide-one-question').observed, {
    toolResult: 'Refused: this Copilot host cannot put a question to you; answer it with skraft decide adr-0 RATIFIED|REJECTED typed in a terminal; nothing was recorded.',
    requests: [], answered: [],
  })
})

test('a select or an input from a workflow run whose answer never comes back fails its check', async (t) => {
  const { report, verdicts } = await probe(t, { askedUnanswered: true })

  assert.deepEqual([verdicts['select-joined-session-from-workflow'], verdicts['input-joined-session-from-workflow']], ['fail', 'fail'])
  assert.deepEqual(report.checks.find((item) => item.id === 'select-joined-session-from-workflow').observed.accepted, { elicitation: true, value: null })
})

test('a confirmation asked from a canvas page that never reaches the host fails its check', async (t) => {
  const { report, verdicts } = await probe(t, { canvasConfirmUnheard: true })

  assert.equal(verdicts['confirm-from-canvas'], 'fail')
  assert.deepEqual(report.checks.find((item) => item.id === 'confirm-from-canvas').observed, { answer: { value: false, error: null }, hostAsked: 0 })
})

test('a conclusive check linked to an issue becomes a comment on it, and opens nothing', async (t) => {
  const { report } = await probe(t)
  const actions = planIssueActions(report, { openTitles: new Set() })

  assert.deepEqual([...new Set(actions.map((action) => action.kind))], ['comment'])
  assert.deepEqual([...new Set(actions.map((action) => action.issue))].sort(), [244, 245, 246, 247, 249, 400])
  assert.match(actions.find((action) => action.check === 'decide-without-confirm').body, /mesuré non conforme/)
  assert.match(actions[0].body, /Copilot CLI 1\.0\.100/)
})

test('a failed requirement opens one issue, unless an open issue already has its title', async (t) => {
  const { report, verdicts } = await probe(t, { skraftLoads: false, models: ['copilot-medium'] })

  assert.equal(verdicts['skraft-extension-loaded'], 'fail')
  assert.equal(verdicts['skraft-workflow-registered'], 'fail')
  assert.equal(verdicts['copilot-models-available'], 'fail')
  assert.equal(verdicts['decide-without-confirm'], undefined)
  const models = report.checks.find((item) => item.id === 'copilot-models-available')
  assert.deepEqual(models.observed.missing, ['economy: copilot-small', 'standard: copilot-medium-old'])

  const opened = planIssueActions(report, { openTitles: new Set() }).filter((action) => action.kind === 'open')
  assert.deepEqual(opened.map((action) => action.check), ['skraft-extension-loaded', 'skraft-workflow-registered', 'copilot-models-available'])
  assert.match(opened[0].body, /Mesure\*\* \(`skraft-extension-loaded`/)

  const known = new Set([opened[0].title])
  assert.deepEqual(planIssueActions(report, { openTitles: known }).filter((action) => action.kind === 'open').map((action) => action.check), ['skraft-workflow-registered', 'copilot-models-available'])
})

test('a session snapshot that keeps the first directory after a change fails its requirement and opens an issue', async (t) => {
  const { report, verdicts } = await probe(t, { staleSnapshot: true })

  assert.equal(verdicts['snapshot-working-directory'], 'fail')
  const snapshot = report.checks.find((item) => item.id === 'snapshot-working-directory')
  assert.equal(snapshot.observed.atLoad, snapshot.observed.repoA)
  assert.equal(snapshot.observed.afterCd, snapshot.observed.repoA)
  assert.deepEqual(planIssueActions(report, { openTitles: new Set() }).filter((action) => action.kind === 'open').map((action) => action.check), ['snapshot-working-directory'])
})

test('a native Copilot tool named like a skraft tool fails its requirement and opens an issue', async (t) => {
  const { report, verdicts } = await probe(t, { nativeTools: [...NATIVE_TOOLS, 'skraft_decide'] })

  assert.equal(verdicts['skraft-tool-names-free'], 'fail')
  assert.deepEqual(report.checks.find((item) => item.id === 'skraft-tool-names-free').observed.collisions, ['skraft_decide'])
  assert.deepEqual(planIssueActions(report, { openTitles: new Set() }).filter((action) => action.kind === 'open').map((action) => action.check), ['skraft-tool-names-free'])
})

test('a host that refuses every workflow run leaves the bad tool name isolation and the MCP checks inconclusive, not passed', async (t) => {
  const { report, verdicts } = await probe(t, { workflowRunError: WORKFLOWS_UNAVAILABLE })

  assert.equal(verdicts['bad-tool-name-isolation'], 'inconclusive')
  assert.deepEqual(report.checks.find((item) => item.id === 'bad-tool-name-isolation').observed, { status: 'rpc-error', error: WORKFLOWS_UNAVAILABLE })
  assert.equal(verdicts['broken-workflow-isolation'], 'pass')
  assert.deepEqual(MCP_CHECKS.map((id) => [verdicts[id], report.checks.find((item) => item.id === id).observed]), MCP_CHECKS.map(() => ['inconclusive', { status: 'rpc-error', error: WORKFLOWS_UNAVAILABLE }]))
})

test('an undeclared phase is measured as kept only when the run completes and the host lists it entered, with no ordinal', async (t) => {
  const kept = await probe(t)
  const throwing = await probe(t, { undeclaredPhase: 'throws' })
  const ignoring = await probe(t, { undeclaredPhase: 'ignored' })
  const unavailable = await probe(t, { workflowRunError: WORKFLOWS_UNAVAILABLE })
  const observed = ({ report }) => report.checks.find((item) => item.id === 'workflow-undeclared-phase').observed

  assert.deepEqual([kept, throwing, ignoring, unavailable].map(({ verdicts }) => verdicts['workflow-undeclared-phase']), ['pass', 'fail', 'fail', 'inconclusive'])
  assert.deepEqual(observed(kept).phases, [{ title: 'Probe', ordinal: 0, status: 'completed', entryCount: 2 }, { title: 'UNDECLARED', ordinal: null, status: 'completed', entryCount: 1 }])
  assert.equal(observed(throwing).threw, true)
  assert.equal(observed(ignoring).phases.some(({ title }) => title === 'UNDECLARED'), false)
  assert.deepEqual(observed(unavailable), { status: 'rpc-error', error: WORKFLOWS_UNAVAILABLE })
})

test('a host that gives the declared phase no ordinal once an undeclared one was opened before it fails the undeclared phase check', async (t) => {
  const { report, verdicts } = await probe(t, { undeclaredPhase: 'shifts' })

  assert.equal(verdicts['workflow-undeclared-phase'], 'fail')
  const { phases } = report.checks.find((item) => item.id === 'workflow-undeclared-phase').observed
  assert.deepEqual(phases.map(({ title, ordinal }) => [title, ordinal]), [['Probe', null], ['UNDECLARED', null]])
})

test('a host that leaves out the declared phase opened after an undeclared one fails the undeclared phase check, though the declared phase keeps its ordinal', async (t) => {
  const { report, verdicts } = await probe(t, { undeclaredPhase: 'forgets' })

  assert.equal(verdicts['workflow-undeclared-phase'], 'fail')
  const { phases } = report.checks.find((item) => item.id === 'workflow-undeclared-phase').observed
  assert.deepEqual(phases.map(({ title, ordinal, entryCount }) => [title, ordinal, entryCount]), [['Probe', 0, 1], ['UNDECLARED', null, 1]])
})

const MCP_CHECKS = ['mcp-tool-from-workflow', 'mcp-permission-from-workflow', 'mcp-unavailable-from-workflow', 'mcp-tool-error-from-workflow', 'github-mcp-in-session']

test('inside a workflow run the extension lists the session\'s MCP server, calls its tool and reads the result; a tool with side effects goes through the host\'s permission handler; a missing server, a missing tool and a tool error come back as such', async (t) => {
  const { report } = await probe(t)
  const observed = (id) => report.checks.find((item) => item.id === id).observed

  assert.deepEqual(observed('mcp-tool-from-workflow'), {
    servers: [{ name: 'skraft-probe-mcp', status: 'connected' }, { name: 'skraft-probe-mcp-failing', status: 'failed', error: 'MCP server process exited before completing the MCP initialize handshake (exit code 3)' }],
    tools: ['echo', 'touch', 'fail'],
    echo: { type: 'success', text: 'echo:skraft-probe-sentinel' },
  })
  assert.deepEqual(observed('mcp-permission-from-workflow'), {
    approvedAsked: ['skraft-probe-mcp-touch'], approved: { type: 'success', text: 'touched' },
    rejectedAsked: ['skraft-probe-mcp-touch'], rejected: { type: 'rejected', text: 'The user rejected this tool call.' },
  })
  assert.deepEqual(observed('mcp-unavailable-from-workflow'), {
    absentServer: { error: 'Request session.mcp.listTools failed with message: MCP server "skraft-probe-mcp-absent" is not connected' },
    failing: { name: 'skraft-probe-mcp-failing', status: 'failed', error: 'MCP server process exited before completing the MCP initialize handshake (exit code 3)' },
    absentTool: 'failure',
  })
  assert.deepEqual(observed('mcp-tool-error-from-workflow'), { fail: { type: 'failure', text: 'skraft-probe-tool-error' } })
  assert.deepEqual(observed('github-mcp-in-session'), { listed: false, status: null, github: { error: 'Request session.mcp.listTools failed with message: MCP server "github-mcp-server" is not connected' } })
  assert.deepEqual(planIssueActions(report, { openTitles: new Set() }).filter((action) => action.issue === 400).map((action) => action.check), ['mcp-tool-from-workflow', 'mcp-permission-from-workflow', 'mcp-unavailable-from-workflow', 'mcp-tool-error-from-workflow'])
})

// One departure from the measured host at a time, and the MCP verdicts it gives, in MCP_CHECKS order.
const MCP_DEPARTURES = [
  ['a joined session with no rpc.mcp and no MCP tool', { reachable: false }, ['fail', 'fail', 'fail', 'fail', 'inconclusive']],
  ['the probe server listed but not connected', { listedStatus: 'disabled' }, ['fail', 'pass', 'pass', 'pass', 'inconclusive']],
  ['listTools that does not name echo', { listedTools: ['touch'] }, ['fail', 'pass', 'pass', 'pass', 'inconclusive']],
  ['echo answering another text', { echoText: 'echo:something else' }, ['fail', 'pass', 'pass', 'pass', 'inconclusive']],
  ['read-only tools that ask permission too', { asksReadOnly: true }, ['pass', 'fail', 'pass', 'pass', 'inconclusive']],
  ['a first side-effect call run without asking', { firstUnasked: true }, ['pass', 'fail', 'pass', 'pass', 'inconclusive']],
  ['a later side-effect call rejected without asking', { rejectsUnasked: true }, ['pass', 'fail', 'pass', 'pass', 'inconclusive']],
  ['a rejected call that runs anyway', { ignoresReject: true }, ['pass', 'fail', 'pass', 'pass', 'inconclusive']],
  ['an approved side-effect call that fails', { touchFails: true }, ['pass', 'fail', 'pass', 'pass', 'inconclusive']],
  ['a dying server listed stopped', { failingStatus: 'stopped' }, ['pass', 'pass', 'fail', 'pass', 'inconclusive']],
  ['an absent server refused with another error', { absentServerError: 'boom' }, ['pass', 'pass', 'fail', 'pass', 'inconclusive']],
  ['an absent tool that throws', { absentToolThrows: true }, ['pass', 'pass', 'fail', 'pass', 'inconclusive']],
  ['a tool error that comes back a success', { errorAsSuccess: true }, ['pass', 'pass', 'pass', 'fail', 'inconclusive']],
  ['a probe server that offers no erroring tool', { withoutFailTool: true }, ['pass', 'pass', 'pass', 'fail', 'inconclusive']],
  ['a probe server still pending', { failingStatus: 'pending' }, ['inconclusive', 'inconclusive', 'inconclusive', 'inconclusive', 'inconclusive']],
  ['a connected GitHub server with tools', { githubTools: 3 }, ['pass', 'pass', 'pass', 'pass', 'pass']],
  ['a GitHub server listed failed whose tools still answer', { githubTools: 3, githubStatus: 'failed' }, ['pass', 'pass', 'pass', 'pass', 'inconclusive']],
  ['a connected GitHub server with no tool', { githubTools: 0 }, ['pass', 'pass', 'pass', 'pass', 'inconclusive']],
  ['a CLI that refuses a session with mcpServers', { refusesConfig: true }, ['inconclusive', 'inconclusive', 'inconclusive', 'inconclusive', 'inconclusive']],
]

for (const [name, mcp, expected] of MCP_DEPARTURES) {
  test(`MCP checks on ${name}: ${expected.join(', ')}`, async (t) => {
    const { verdicts } = await probe(t, { mcp })

    assert.deepEqual(MCP_CHECKS.map((id) => verdicts[id]), expected)
  })
}

test('a probe server still pending and a refused session say why the MCP checks are inconclusive, and the rest of the probe still runs', async (t) => {
  const pending = await probe(t, { mcp: { failingStatus: 'pending' } })
  const refused = await probe(t, { mcp: { refusesConfig: true } })

  assert.deepEqual(pending.report.checks.find((item) => item.id === 'mcp-tool-from-workflow').observed, { pending: ['skraft-probe-mcp-failing'] })
  assert.deepEqual(refused.report.checks.find((item) => item.id === 'mcp-tool-from-workflow').observed, { sessionError: 'mcpServers is not supported' })
  assert.equal(refused.verdicts['skraft-extension-loaded'], 'pass')
})

test('a workflow run that ends in an error the probe does not know leaves the bad tool name isolation inconclusive', async (t) => {
  const { report, verdicts } = await probe(t, { workflowRunError: 'socket hang up' })

  assert.equal(verdicts['bad-tool-name-isolation'], 'inconclusive')
  assert.deepEqual(report.checks.find((item) => item.id === 'bad-tool-name-isolation').observed, { status: 'rpc-error', error: 'socket hang up' })
})

test('a host whose native tools lack bash leaves the tool names check inconclusive, not passed', async (t) => {
  const { report, verdicts } = await probe(t, { nativeTools: ['extensions_manage', 'extensions_reload'] })

  assert.equal(verdicts['skraft-tool-names-free'], 'inconclusive')
  assert.deepEqual(report.checks.find((item) => item.id === 'skraft-tool-names-free').observed, { native: ['extensions_manage', 'extensions_reload'], skraft: ['skraft_decide'] })
})

test('without Copilot model names in skraft-config.json, the model check is inconclusive', async (t) => {
  const { report, verdicts } = await probe(t, {}, { haiku: { 'claude-code': 'haiku' } })
  assert.equal(verdicts['copilot-models-available'], 'inconclusive')
  assert.deepEqual(report.checks.find((item) => item.id === 'copilot-models-available').observed, { configured: [] })
})

test('an inconclusive check reaches no issue', () => {
  const report = { environment: ENVIRONMENT, checks: [{ id: 'cwd-after-cd', issue: 245, verdict: 'inconclusive', expected: 'x', observed: {} }, { id: 'r', verdict: 'inconclusive', title: 'T', expected: 'x', observed: {} }] }
  assert.deepEqual(planIssueActions(report, { openTitles: new Set() }), [])
})

test('the Markdown report lists each check with its issue and escapes table pipes', () => {
  const text = reportMarkdown({ date: '2026-10-20T10:00:00Z', environment: ENVIRONMENT, checks: [{ id: 'cwd-after-cd', issue: 245, verdict: 'pass', observed: { a: 'x|y' } }, { id: 'session-agents', verdict: 'fail', observed: {} }] })
  assert.match(text, /\| `cwd-after-cd` \| #245 \| pass \| \{"a":"x\\\|y"\} \|/)
  assert.match(text, /\| `session-agents` \| — \| fail \|/)
})

test('the command line takes known options only', () => {
  assert.deepEqual(parseArgs(['--report-issues', '--dry-run', '--out', 'r']), { sdk: null, copilot: null, out: 'r', reportIssues: true, dryRun: true, repo: 'SebastienDegodez/skraft-plugin', keep: false, agentCalls: false, require: [] })
  assert.deepEqual(parseArgs(["--require", "cwd-after-cd,skraft-extension-loaded"]).require, ["cwd-after-cd", "skraft-extension-loaded"])
  assert.equal(parseArgs(['--agent-calls']).agentCalls, true)
  assert.throws(() => parseArgs(['--bogus']), /usage/)
  assert.throws(() => parseArgs(['--sdk']), /usage/)
})

test('a required check fails the run unless it passed, and a required check the report lacks fails it too', async (t) => {
  const { report } = await probe(t, { skraftLoads: false })

  assert.deepEqual(requiredFailures(report, ["cwd-after-cd", "skraft-extension-loaded", "confirm-in-autopilot", "no-such-check"]), ["skraft-extension-loaded: fail", "no-such-check: missing"])
  assert.deepEqual(requiredFailures(report, ["cwd-after-cd"]), [])
})

test('a tool result is read from a string or from an expanded result', () => {
  assert.equal(toolText('plain'), 'plain')
  assert.equal(toolText({ textResultForLlm: 'expanded', resultType: 'success' }), 'expanded')
  assert.equal(toolText(undefined), '')
})
