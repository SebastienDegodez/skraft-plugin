#!/usr/bin/env node
// Copilot host probe: measures, through a headless SDK host and without any model call unless
// --agent-calls is given, the host behaviours the skraft-pipeline driver relies on. Each check is linked to the issue it measures
// (a comment with the result) or, for a requirement, opens an issue when it fails.
//
//   node eng/host-probe/copilot-probe.mjs [--sdk <copilot-sdk dir>] [--copilot <copilot binary>]
//        [--out <dir>] [--report-issues [--dry-run]] [--repo owner/name] [--keep] [--agent-calls]
import { spawnSync } from 'node:child_process'
import { get as httpGet } from 'node:http'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir, platform, release, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { GITHUB_MCP_SERVER, PROBE_CANVAS, PROBE_CANVAS_QUERY, PROBE_MCP, QUESTION_KEY, QUESTION_SLUG, questionEvents, writeCanvasPlugin, writeIsolationPlugins, writeProbeMcpServers, writeProbePlugins, writeQuestionRepo } from './fixtures.mjs'
import { DEFAULT_REPO, reportToGitHub } from './issues.mjs'
import { mergePatch } from '../../plugins/skraft-framework/engine/domain/config/merge-patch.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
/** How long the probe waits: an RPC, extensions to offer their tools, a workflow, a host to settle. */
export const DEFAULT_TIMINGS = Object.freeze({ rpc: 30_000, tools: 45_000, isolationTools: 20_000, workflow: 90_000, poll: 1000, settle: 1000 })
let T = DEFAULT_TIMINGS
const TERMINAL = new Set(['completed', 'halted', 'paused', 'cancelled', 'error'])

// ---------------------------------------------------------------------------------------------
// Small helpers around the session

const messageOf = (error) => String(error?.message ?? error)

const withTimeout = (promise, ms, label) => {
  let timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}: no answer within ${ms} ms`)), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

const parseJson = (text) => {
  try { return JSON.parse(text) } catch { return null }
}

/** The text of a tool result, which the host gives as a string or an expanded object. */
export const toolText = (result) => (typeof result === 'string' ? result : result?.textResultForLlm ?? '')

/** Names of the session's current tools, after asking the host to (re)initialise them. */
const currentTools = async (session) => {
  try { await withTimeout(session.rpc.tools.initializeAndValidate(), T.rpc, 'tools.initializeAndValidate') } catch { /* measured by the tool list below */ }
  const metadata = await withTimeout(session.rpc.tools.getCurrentMetadata(), T.rpc, 'tools.getCurrentMetadata')
  return new Set((metadata?.tools ?? []).map((tool) => tool.name))
}

/** Polls until every wanted tool is offered or the time is up; returns the wanted ones found. */
const waitForTools = async (session, wanted, ms = T.tools) => {
  const deadline = Date.now() + ms
  let found = new Set()
  for (;;) {
    const names = await currentTools(session).catch(() => new Set())
    found = new Set(wanted.filter((name) => names.has(name)))
    if (found.size === wanted.length || Date.now() >= deadline) return found
    await sleep(T.poll)
  }
}

const execTool = async (session, name, args = {}) => {
  try {
    const result = await withTimeout(session.rpc.tools.execute({ name, arguments: args }), T.workflow, `tools.execute ${name}`)
    return { ok: true, type: typeof result === 'string' ? 'success' : result?.resultType ?? null, text: toolText(result) }
  } catch (error) {
    return { ok: false, error: messageOf(error) }
  }
}

/** Starts a workflow and follows it to a terminal state. */
const runWorkflow = async (session, name, args) => {
  let envelope
  try {
    envelope = await withTimeout(session.rpc.workflow.run({ name, args }), T.rpc, `workflow.run ${name}`)
  } catch (error) {
    return { status: 'rpc-error', error: messageOf(error) }
  }
  const deadline = Date.now() + T.workflow
  while (!TERMINAL.has(envelope?.status) && Date.now() < deadline) {
    await sleep(T.poll)
    try { envelope = await withTimeout(session.rpc.workflow.getRun({ runId: envelope.runId }), T.rpc, 'workflow.getRun') } catch (error) { return { status: 'rpc-error', error: messageOf(error) } }
  }
  return TERMINAL.has(envelope?.status) ? envelope : { ...envelope, status: 'timeout' }
}

const setWorkingDirectory = (session, workingDirectory) =>
  withTimeout(session.rpc.metadata.setWorkingDirectory({ workingDirectory }), T.rpc, 'metadata.setWorkingDirectory')

/** What the host's handler types into a text field it accepts. */
const PROBE_INSTRUCTION = 'skraft probe instruction'

/** A host-side elicitation handler that records each request and answers as `answers.mode` says. */
const elicitationRecorder = () => {
  const answers = { mode: 'decline', calls: [] }
  const handler = (context) => {
    const properties = context?.requestedSchema?.properties ?? {}
    answers.calls.push({ message: context?.message ?? null, fields: Object.keys(properties), options: properties.selection?.enum ?? null })
    if (answers.mode !== 'accept') return { action: 'decline' }
    if ('confirmed' in properties) return { action: 'accept', content: { confirmed: true } }
    if ('selection' in properties) return { action: 'accept', content: { selection: properties.selection?.enum?.[0] } }
    if ('value' in properties) return { action: 'accept', content: { value: PROBE_INSTRUCTION } }
    return { action: 'accept', content: {} }
  }
  return { answers, handler }
}

const permissionHandler = (sdk) => async (request, invocation) => {
  if (typeof sdk.approveAll === 'function') {
    try { return await sdk.approveAll(request, invocation) } catch { /* managed settings: fall through */ }
  }
  return { kind: 'approve-once' }
}

const check = (fields) => ({ verdict: 'inconclusive', observed: {}, ...fields })

// ---------------------------------------------------------------------------------------------
// Checks: probe extensions (layout, directory, confirmation, throwing workflow)

const probeChecks = async ({ sdk, client, dirs, agentCalls }) => {
  const checks = []
  const { answers, handler } = elicitationRecorder()
  const session = await client.createSession({
    ...dirs.session, workingDirectory: dirs.repoA, pluginDirectories: [dirs.plugins.agent, dirs.plugins.legacy], requestExtensions: true,
    onPermissionRequest: permissionHandler(sdk), onElicitationRequest: handler,
  })
  try {
    const found = await waitForTools(session, ['skraft_probe_state_a', 'skraft_probe_state_l'])
    let extensions = null
    try { extensions = (await withTimeout(session.rpc.extensions.list(), T.rpc, 'extensions.list'))?.extensions?.map(({ name, status }) => ({ name, status })) } catch (error) { extensions = messageOf(error) }
    checks.push(check({
      id: 'extension-loads-agent-plugins',
      expected: "Une extension sous `com.github.copilot/extensions/<dir>/`, avec un `plugin.json` racine Agent Plugins (la disposition de skraft-framework), est chargée.",
      verdict: found.has('skraft_probe_state_a') ? 'pass' : 'fail',
      observed: { toolOffered: found.has('skraft_probe_state_a'), extensions },
      title: "V2 — Copilot ne charge pas une extension placée sous com.github.copilot/extensions/",
      labels: ['bug', 'gain:reliability'],
      body: "La sonde ne voit pas l'outil d'une extension placée comme celle de skraft-framework (`plugin.json` racine Agent Plugins, extension sous `com.github.copilot/extensions/<dir>/extension.mjs`). Le workflow `skraft-pipeline` et `skraft_decide` ne seraient donc pas disponibles sous Copilot. Correctif : un seul emplacement qui charge, celui que la sonde mesure conforme (`extension-loads-claude-plugin`), et un smoke en CI.",
    }))
    checks.push(check({
      id: 'extension-loads-claude-plugin',
      expected: 'Une extension sous `extensions/<dir>/`, avec un manifeste `.claude-plugin/plugin.json`, est chargée.',
      verdict: found.has('skraft_probe_state_l') ? 'pass' : 'fail',
      observed: { toolOffered: found.has('skraft_probe_state_l') },
    }))
    const suffix = found.has('skraft_probe_state_a') ? 'a' : found.has('skraft_probe_state_l') ? 'l' : null
    if (suffix === null) return { checks, layout: null }
    checks.push(...await cwdAfterCd(session, suffix, dirs))
    checks.push(...await confirmChecks(session, suffix, answers))
    checks.push(...await askChecks(session, suffix, answers))
    checks.push(await throwingWorkflow(session, suffix))
    checks.push(...await refusalChecks({ session, suffix, client, agentCalls }))
    return { checks, layout: suffix === 'a' ? 'agent-plugins' : 'claude-plugin' }
  } finally {
    await session.disconnect?.().catch(() => undefined)
  }
}

const cwdAfterCd = async (session, suffix, dirs) => {
  const tool = `skraft_probe_state_${suffix}`
  const before = parseJson((await execTool(session, tool)).text)
  try { await setWorkingDirectory(session, dirs.repoB) } catch (error) { return [check({ id: 'cwd-after-cd', issue: 245, observed: { error: messageOf(error) }, expected: CWD_EXPECTED }), check({ id: 'snapshot-working-directory', ...SNAPSHOT, observed: { error: messageOf(error) } })] }
  await sleep(T.settle)
  await currentTools(session).catch(() => undefined)
  const after = parseJson((await execTool(session, tool)).text)
  const [a, b] = [await realpath(dirs.repoA), await realpath(dirs.repoB)]
  const real = async (path) => (typeof path === 'string' ? realpath(path).catch(() => path) : path)
  const processCwd = await real(after?.processCwd)
  const tracked = await real(after?.tracked)
  const snapshots = [await real(before?.snapshot), await real(after?.snapshot)]
  return [check({
    id: 'cwd-after-cd', issue: 245, expected: CWD_EXPECTED,
    verdict: after === null ? 'inconclusive' : processCwd === a && tracked === b ? 'pass' : 'fail',
    observed: { atLoad: before?.atLoad ?? null, processCwdAfter: processCwd ?? null, trackedAfter: tracked ?? null, repoA: a, repoB: b },
  }), check({
    id: 'snapshot-working-directory', ...SNAPSHOT,
    verdict: before === null || after === null ? 'inconclusive' : snapshots[0] === a && snapshots[1] === b ? 'pass' : 'fail',
    observed: { atLoad: snapshots[0] ?? null, afterCd: snapshots[1] ?? null, repoA: a, repoB: b },
  })]
}
const SNAPSHOT = Object.freeze({
  expected: "`session.rpc.metadata.snapshot().workingDirectory` donne le répertoire de la session : le premier dépôt au join, le second après `setWorkingDirectory`. Le pilote en tire le répertoire de départ de son suivi (#245).",
  title: 'V2 — le répertoire de session au join ne se lit pas par metadata.snapshot', labels: ['bug', 'gain:reliability'],
  body: "Le pilote Copilot (`drivers/copilot-workflow/register.mjs`) amorce son suivi du répertoire de session par `session.rpc.metadata.snapshot().workingDirectory`, avant tout `session.context_changed`. La sonde ne lit pas ce répertoire : un run ou une décision serait refusé (`no-directory`) tant que la session n'a pas changé de répertoire.",
})
const CWD_EXPECTED = "Après `session.metadata.setWorkingDirectory` vers un second dépôt, `process.cwd()` de l'extension reste le premier, et `session.context_changed` porte le second (ce que dit l'issue)."

const confirmChecks = async (session, suffix, answers) => {
  const tool = `skraft_probe_confirm_${suffix}`
  const state = parseJson((await execTool(session, `skraft_probe_state_${suffix}`)).text)
  answers.mode = 'accept'
  const callsBefore = answers.calls.length
  const accepted = parseJson((await execTool(session, tool)).text)
  answers.mode = 'decline'
  const declined = parseJson((await execTool(session, tool)).text)
  const fromTool = check({
    id: 'confirm-from-tool', issue: 244,
    expected: "Depuis le handler d'un outil d'extension, `session.ui.confirm` atteint le handler d'élicitation de l'hôte : `true` quand il accepte, `false` quand il refuse.",
    verdict: accepted?.value === true && declined?.value === false ? 'pass' : accepted === null ? 'inconclusive' : 'fail',
    observed: { elicitationCapability: state?.elicitation ?? null, mode: state?.mode ?? null, modeError: state?.modeError ?? null, accepted, declined, hostAsked: answers.calls.length - callsBefore },
  })
  const autopilot = await confirmInAutopilot(session, tool, answers)
  answers.mode = 'accept'
  const run = await runWorkflow(session, `skraft-probe-${suffix}`, { confirm: true })
  answers.mode = 'decline'
  const fromWorkflow = check({
    id: 'confirm-from-workflow', issue: 244,
    expected: "Dans un run de workflow, `ctx.session` existe et `ctx.session.ui.confirm` atteint l'hôte : la question humaine peut être posée pendant le run, sans pause ni outil.",
    verdict: run.status === 'completed' ? (run.result?.hasSession === true && run.result?.value === true ? 'pass' : 'fail') : 'inconclusive',
    observed: { status: run.status, result: run.result ?? null, error: run.error ?? null },
  })
  answers.mode = 'accept'
  const joined = await runWorkflow(session, `skraft-probe-${suffix}`, { joinedConfirm: true })
  answers.mode = 'decline'
  const fromJoined = check({
    id: 'confirm-joined-session-from-workflow',
    expected: "Dans un run de workflow, le `session.ui.confirm` de la session que l'extension a jointe (pas `ctx.session`) atteint l'hôte et rend `true` quand il accepte : c'est ce qu'appelle le consentement de `skraft-review` (`host-confirmation.mjs`), avec `rpc.mode.get` lisible pendant le run.",
    verdict: joined.status === 'completed' ? (joined.result?.value === true && typeof joined.result?.mode === 'string' ? 'pass' : 'fail') : 'inconclusive',
    observed: { status: joined.status, result: joined.result ?? null, error: joined.error ?? null },
  })
  return [fromTool, autopilot, fromWorkflow, fromJoined]
}

/**
 * The joined session's select and input inside a workflow run, as the skraft-pipeline run asks its
 * questions: the host's handler gets the options or a text field, and its answer comes back as
 * the value; declined, the value is null.
 */
const askChecks = async (session, suffix, answers) => {
  const asked = async (args) => {
    answers.mode = 'accept'
    const before = answers.calls.length
    const accepted = await runWorkflow(session, `skraft-probe-${suffix}`, args)
    answers.mode = 'decline'
    const declined = await runWorkflow(session, `skraft-probe-${suffix}`, args)
    return { accepted, declined, requests: answers.calls.slice(before).map(({ fields, options }) => ({ fields, options })) }
  }
  const verdict = ({ accepted, declined }, value) => (accepted.status === 'completed' && declined.status === 'completed'
    ? (accepted.result?.value === value && declined.result?.value === null ? 'pass' : 'fail') : 'inconclusive')
  const observed = ({ accepted, declined, requests }) => ({ accepted: accepted.result ?? accepted.error ?? accepted.status, declined: declined.result ?? declined.error ?? declined.status, requests })
  const select = await asked({ joinedSelect: true })
  const input = await asked({ joinedInput: true })
  return [
    check({ id: 'select-joined-session-from-workflow', ...ASKED.select, verdict: verdict(select, 'RATIFIED'), observed: observed(select) }),
    check({ id: 'input-joined-session-from-workflow', ...ASKED.input, verdict: verdict(input, PROBE_INSTRUCTION), observed: observed(input) }),
  ]
}
const ASKED = Object.freeze({
  select: {
    expected: "Dans un run de workflow, le `session.ui.select(message, options)` de la session jointe atteint l'hôte avec les options en `enum` du champ `selection` ; accepté, l'option choisie revient ; refusé, `null`. C'est ainsi que le run `skraft-pipeline` pose une question à options : la valeur rendue est la réponse, sans confirmation de plus.",
    title: 'V2 — une question à options ne se pose pas depuis un run de workflow Copilot', labels: ['bug', 'gain:reliability'],
    body: "Le pilote Copilot (`drivers/copilot-workflow/ctx-human.mjs`) pose chaque question du run par `session.ui.select` de la session jointe. La sonde ne voit pas l'hôte recevoir cette question, ou n'en reçoit pas l'option choisie : le run se mettrait en pause à chaque question.",
  },
  input: {
    expected: "Dans un run de workflow, le `session.ui.input(message)` de la session jointe atteint l'hôte avec un champ texte `value` ; accepté, le texte saisi revient ; refusé, `null`. C'est ainsi que le run `skraft-pipeline` demande l'instruction d'une étape bloquée et la raison d'un refus.",
    title: "V2 — une instruction ne se demande pas depuis un run de workflow Copilot", labels: ['bug', 'gain:reliability'],
    body: "Le pilote Copilot (`drivers/copilot-workflow/ctx-human.mjs`) demande l'instruction d'une étape bloquée et la raison d'un refus par `session.ui.input` de la session jointe. La sonde ne voit pas l'hôte recevoir ce champ, ou n'en reçoit pas le texte saisi.",
  },
})

const confirmInAutopilot = async (session, tool, answers) => {
  const expected = "En mode `autopilot`, l'hôte transmet-il encore `confirm` à son handler ? Le pilote doit refuser lui-même en autopilot, quelle que soit la réponse."
  try {
    await withTimeout(session.rpc.mode.set({ mode: 'autopilot' }), T.rpc, 'mode.set')
  } catch (error) {
    return check({ id: 'confirm-in-autopilot', issue: 244, expected, observed: { modeSetError: messageOf(error) } })
  }
  answers.mode = 'accept'
  const callsBefore = answers.calls.length
  const result = parseJson((await execTool(session, tool)).text)
  answers.mode = 'decline'
  await withTimeout(session.rpc.mode.set({ mode: 'interactive' }), T.rpc, 'mode.set').catch(() => undefined)
  return check({
    id: 'confirm-in-autopilot', issue: 244, expected,
    verdict: result === null ? 'inconclusive' : 'pass',
    observed: { result, hostAsked: answers.calls.length - callsBefore },
  })
}

const throwingWorkflow = async (session, suffix) => {
  const run = await runWorkflow(session, `skraft-probe-${suffix}`, { throw: true })
  const lost = run.result === undefined || run.result === null
  return check({
    id: 'throwing-workflow', issue: 247,
    expected: "Un workflow qui lève se termine sans `result` : le cas à signaler est perdu (ce que dit l'issue).",
    verdict: run.status === 'rpc-error' || run.status === 'timeout' ? 'inconclusive' : lost ? 'pass' : 'fail',
    observed: { status: run.status, hasResult: !lost, error: run.error ?? null, failure: run.failure ?? null },
  })
}

// ---------------------------------------------------------------------------------------------
// Checks: what ctx.agent answers for a model or an effort Copilot cannot run (one agent call each)

const AGENT_CALLS_NEEDED = { reason: 'needs --agent-calls: each of these checks starts one agent, which may spend AI credits' }
const UNKNOWN_MODEL = 'skraft-probe-no-such-model'
const MODEL_REFUSAL_EXPECTED = "`ctx.agent` sur un modèle inconnu : soit l'hôte retombe de lui-même sur le modèle de la session, soit il lève une erreur que `refusalOf` du pilote classe `model` (le pilote passe alors au modèle suivant)."
const EFFORT_REFUSAL_EXPECTED = "`ctx.agent` avec `reasoningEffort: 'max'` sur un modèle non Anthropic : soit l'hôte l'accepte ou le ramène lui-même, soit il lève une erreur que `refusalOf` du pilote classe `effort` (le pilote redemande alors sans effort)."

const refusalChecks = async ({ session, suffix, client, agentCalls }) => {
  if (!agentCalls) return [check({ id: 'copilot-model-refusal', expected: MODEL_REFUSAL_EXPECTED, observed: AGENT_CALLS_NEEDED }), check({ id: 'copilot-effort-refusal', expected: EFFORT_REFUSAL_EXPECTED, observed: AGENT_CALLS_NEEDED })]
  const { refusalOf } = await import(pathToFileURL(join(REPO_ROOT, 'plugins', 'skraft-framework', 'engine', 'drivers', 'copilot-workflow', 'ctx-agent-runner.mjs')).href)
  const model = await runWorkflow(session, `skraft-probe-${suffix}`, { agentCall: { label: 'skraft-probe-unknown-model', model: UNKNOWN_MODEL } })
  const effortModel = await nonAnthropicModel(client)
  const effort = effortModel === null ? null : await runWorkflow(session, `skraft-probe-${suffix}`, { agentCall: { label: 'skraft-probe-max-effort', model: effortModel, reasoningEffort: 'max' } })
  return [
    refusalCheck({ id: 'copilot-model-refusal', expected: MODEL_REFUSAL_EXPECTED, wanted: 'model', refusalOf }, model, { model: UNKNOWN_MODEL }),
    effort === null ? check({ id: 'copilot-effort-refusal', expected: EFFORT_REFUSAL_EXPECTED, observed: { reason: 'listModels names no model outside Anthropic' } })
      : refusalCheck({ id: 'copilot-effort-refusal', expected: EFFORT_REFUSAL_EXPECTED, wanted: 'effort', refusalOf }, effort, { model: effortModel, reasoningEffort: 'max' }),
  ]
}

/** The first model of the catalogue whose name does not look Anthropic's; null when there is none. */
const nonAnthropicModel = async (client) => {
  try {
    return (await withTimeout(client.listModels(), T.rpc, 'listModels')).map((model) => model.id).find((id) => !/claude/i.test(id) && id !== 'auto') ?? null
  } catch {
    return null
  }
}

/** Passes when the host accepts the call or refuses it in words the driver reads as `wanted`. */
const refusalCheck = ({ id, expected, wanted, refusalOf }, run, asked) => {
  if (run.status !== 'completed' || typeof run.result?.threw !== 'boolean') return check({ id, expected, observed: { asked, status: run.status, error: run.error ?? null } })
  if (!run.result.threw) return check({ id, expected, verdict: 'pass', observed: { asked, accepted: true } })
  const classified = refusalOf(run.result.error)
  return check({
    id, expected, verdict: classified === wanted ? 'pass' : 'fail', observed: { asked, accepted: false, error: run.result.error, classified },
    title: `V2 — refus Copilot non reconnu par le pilote (${id})`, labels: ['bug', 'gain:reliability'],
    body: `Copilot refuse l'appel \`ctx.agent\` (${JSON.stringify(asked)}) avec un texte que \`refusalOf\` de \`drivers/copilot-workflow/ctx-agent-runner.mjs\` ne classe pas \`${wanted}\` : le pilote arrête l'agent au lieu de ${wanted === 'model' ? 'passer au modèle suivant' : 'redemander sans effort'}. Ajouter ce texte au test du classifieur et à son motif.`,
  })
}

// ---------------------------------------------------------------------------------------------
// Checks: isolation at join

const isolationChecks = async ({ sdk, client, dirs, layout }) => {
  if (layout === null) {
    const observed = { reason: 'no probe extension loaded' }
    return [check({ id: 'broken-workflow-isolation', issue: 246, expected: BROKEN_EXPECTED, observed }), check({ id: 'bad-tool-name-isolation', issue: 246, expected: BADTOOL_EXPECTED, observed })]
  }
  const plugins = await writeIsolationPlugins(dirs.root, layout)
  const session = await client.createSession({
    ...dirs.session, workingDirectory: dirs.repoA, pluginDirectories: [plugins.broken, plugins.badTool], requestExtensions: true,
    onPermissionRequest: permissionHandler(sdk),
  })
  try {
    const found = await waitForTools(session, ['skraft_probe_iso_tool'], T.isolationTools)
    const run = await runWorkflow(session, 'skraft-probe-iso', {})
    return [
      check({ id: 'broken-workflow-isolation', issue: 246, expected: BROKEN_EXPECTED, verdict: found.has('skraft_probe_iso_tool') ? 'fail' : 'pass', observed: { toolOffered: found.has('skraft_probe_iso_tool') } }),
      check({ id: 'bad-tool-name-isolation', issue: 246, expected: BADTOOL_EXPECTED, verdict: badToolVerdict(run), observed: { status: run.status, error: run.error ?? null } }),
    ]
  } finally {
    await session.disconnect?.().catch(() => undefined)
  }
}

/**
 * What the host answers, with a login, to the run of a workflow whose join the bad tool name took
 * down: the workflow is not registered (CLI 1.0.101-0 and 1.0.102-1, docs/v2/host-verification.md,
 * 2026-10-20, 2026-10-24, 2026-10-27). Any other answer, "Agent workflows are not available"
 * without a login included, says nothing about the isolation.
 */
const NOT_REGISTERED = /^No workflow registered with name "skraft-probe-iso"$/

/** fail when the workflow ran; pass only on the measured "not registered" answer; else inconclusive. */
const badToolVerdict = (run) => {
  if (run.status === 'completed' && run.result?.ran === true) return 'fail'
  return run.status === 'rpc-error' && NOT_REGISTERED.test(run.error ?? '') ? 'pass' : 'inconclusive'
}

const BROKEN_EXPECTED = "Un `defineWorkflow` invalide (sans `phases`) emporte l'outil enregistré dans le même `joinSession` (ce que dit l'issue)."
const BADTOOL_EXPECTED = "Un nom d'outil refusé par l'hôte (`bad name!`) emporte le workflow enregistré dans le même `joinSession` (ce que dit l'issue)."

// ---------------------------------------------------------------------------------------------
// Checks: an extension canvas (ADR-002 decision 10)

const CANVAS_TOOL = 'skraft_probe_canvas_state'
/** The tools a session offers the model to reach canvases (CLI 1.0.102-1, with requestCanvasRenderer). */
export const CANVAS_AGENT_TOOLS = Object.freeze(['invoke_canvas_action', 'list_canvas_capabilities', 'open_canvas'])
const CANVAS_IDS = Object.freeze(['canvas-accepted-at-join', 'canvas-open-headless', 'canvas-action-invoke', 'confirm-from-canvas', 'canvas-close', 'canvas-open-from-extension', 'canvas-agent-tools'])
const CANVAS_EXPECTED = Object.freeze({
  'canvas-accepted-at-join': "Un `joinSession` qui porte un canvas (`createCanvas`) et un outil est accepté : `session.rpc.canvas.list()` nomme le canvas et l'outil est proposé.",
  'canvas-open-headless': "`session.rpc.canvas.open` d'une session SDK headless appelle le `open` de l'extension, qui démarre son serveur loopback : l'instance rend son `url` avec sa chaîne de requête intacte (`?t=…`, où le canvas skraft met son jeton), la page répond 200 ; rouvrir la même instance rappelle `open`.",
  'canvas-action-invoke': "`session.rpc.canvas.action.invoke` sur une instance ouverte atteint le `handler` de l'action et rend son résultat.",
  'confirm-from-canvas': "Une requête de la page du canvas (POST sur son serveur loopback, hors de tout appel d'outil) fait appeler `session.ui.confirm` à la session jointe : le handler d'élicitation de l'hôte reçoit la question et `true` revient quand il accepte. Le canvas `skraft-pipeline` n'en use plus : il ne prend aucune réponse.",
  'canvas-close': '`session.rpc.canvas.close` appelle le `onClose` de l\'extension pour cette instance.',
  'canvas-open-from-extension': "Depuis un appel d'outil, la session jointe de l'extension ouvre son propre canvas par `session.rpc.canvas.open` : l'hôte appelle le `open` de l'extension pour cette instance avec l'`input` donné (`{ tab: 'configuration' }`), et l'appel rend sans erreur. C'est ainsi que le run `skraft-pipeline` ouvre l'onglet Configuration avant de demander s'il démarre.",
  'canvas-agent-tools': "Sans `requestCanvasRenderer`, la session n'offre au modèle aucun outil de canvas ; avec, elle offre `list_canvas_capabilities`, `open_canvas` et `invoke_canvas_action`.",
})
const CANVAS_REQUIREMENT = Object.freeze({
  title: "V2 — un canvas d'extension ne se joint pas ou ne s'ouvre pas sous Copilot", labels: ['bug', 'gain:reliability'],
  body: "La sonde ne voit pas un canvas d'extension (`createCanvas`) joint, ouvert ou appelé comme le pilote `skraft-pipeline` le suppose (ADR-002, décision 10) : le canvas du pipeline ne serait pas disponible sous Copilot.",
})

/** What the canvas fixture's callbacks received, read through its tool; null when it cannot say. */
const canvasSeen = async (session) => parseJson((await execTool(session, CANVAS_TOOL)).text)

/** A session on the canvas fixture; its tool offered or not. */
const canvasSession = async ({ sdk, client, dirs }, plugin, extra) => {
  const session = await client.createSession({ ...dirs.session, workingDirectory: dirs.repoA, pluginDirectories: [plugin], requestExtensions: true, onPermissionRequest: permissionHandler(sdk), ...extra })
  return { session, loaded: (await waitForTools(session, [CANVAS_TOOL], T.isolationTools)).has(CANVAS_TOOL) }
}

const canvasChecks = async ({ sdk, client, dirs, layout }) => {
  if (layout === null) return CANVAS_IDS.map((id) => check({ id, expected: CANVAS_EXPECTED[id], observed: { reason: 'no probe extension loaded' } }))
  const plugin = await writeCanvasPlugin(dirs.root, layout)
  const { answers, handler } = elicitationRecorder()
  const { session, loaded } = await canvasSession({ sdk, client, dirs }, plugin, { onElicitationRequest: handler })
  let measured
  try {
    measured = await canvasLifecycle(session, loaded, answers)
  } finally {
    await session.disconnect?.().catch(() => undefined)
  }
  return [...measured, await canvasAgentTools({ sdk, client, dirs }, plugin, measured[0].verdict === 'pass')]
}

/** Join, open, page, action, confirm from the page, close: one instance, in that order. */
const canvasLifecycle = async (session, loaded, answers) => {
  const listed = await rpcOr(() => session.rpc.canvas.list())
  const declared = (listed.value?.canvases ?? []).some((canvas) => canvas.canvasId === PROBE_CANVAS)
  const joined = check({
    id: 'canvas-accepted-at-join', expected: CANVAS_EXPECTED['canvas-accepted-at-join'], ...CANVAS_REQUIREMENT,
    verdict: loaded && declared ? 'pass' : 'fail', observed: { toolOffered: loaded, canvasListed: declared, error: listed.error, createCanvas: (await canvasSeen(session))?.createCanvas ?? null },
  })
  if (joined.verdict !== 'pass') return [joined, ...CANVAS_IDS.slice(1, -1).map((id) => check({ id, expected: CANVAS_EXPECTED[id], observed: { reason: 'the probe canvas did not join' } }))]
  const opened = await openedCanvas(session)
  return [joined, opened.check, ...await openCanvasChecks(session, opened, answers)]
}

const PROBE_INSTANCE = 'skraft-probe-instance'

/** Opens the probe canvas twice under one instance id, then reads its page. */
const openedCanvas = async (session) => {
  const first = await rpcOr(() => session.rpc.canvas.open({ canvasId: PROBE_CANVAS, instanceId: PROBE_INSTANCE, input: {} }))
  const again = first.error === null ? await rpcOr(() => session.rpc.canvas.open({ canvasId: PROBE_CANVAS, instanceId: PROBE_INSTANCE, input: {} })) : first
  const url = loopbackUrl(first.value?.url)
  const page = url === null ? null : await fetchStatus(url)
  const seen = await canvasSeen(session)
  const open = seen?.opened?.[0] ?? null
  return {
    url,
    check: check({
      id: 'canvas-open-headless', expected: CANVAS_EXPECTED['canvas-open-headless'], ...CANVAS_REQUIREMENT,
      verdict: first.error !== null ? 'fail' : url !== null && new URL(url).search === `?${PROBE_CANVAS_QUERY}` && page === 200 && seen?.opened?.length === 2 ? 'pass' : 'fail',
      observed: { error: first.error, url: first.value?.url ?? null, queryKept: url !== null && new URL(url).search === `?${PROBE_CANVAS_QUERY}`, sameUrlAgain: again.value?.url === first.value?.url, page, openCalls: seen?.opened?.length ?? null, hostCanvases: open?.hostCanvases ?? null, sessionWorkingDirectory: open?.workingDirectory ?? null, title: first.value?.title ?? null },
    }),
  }
}

/** Action, confirm from the page, close, on the instance openedCanvas opened. */
const openCanvasChecks = async (session, { url }, answers) => {
  const invoked = await rpcOr(() => session.rpc.canvas.action.invoke({ instanceId: PROBE_INSTANCE, actionName: 'probe_state', input: {} }))
  const action = check({
    id: 'canvas-action-invoke', expected: CANVAS_EXPECTED['canvas-action-invoke'],
    verdict: invoked.error === null ? (invoked.value?.result?.ok === true ? 'pass' : 'fail') : 'fail', observed: { error: invoked.error, result: invoked.value ?? null },
  })
  const confirmed = await confirmFromPage(url, answers)
  await rpcOr(() => session.rpc.canvas.close({ instanceId: PROBE_INSTANCE }))
  await sleep(T.settle)
  const closed = (await canvasSeen(session))?.closed ?? null
  return [action, confirmed, check({
    id: 'canvas-close', expected: CANVAS_EXPECTED['canvas-close'],
    verdict: closed === null ? 'inconclusive' : closed.includes(PROBE_INSTANCE) ? 'pass' : 'fail', observed: { closed },
  }), await openedFromExtension(session)]
}

/** The extension opens its own canvas through its joined session, from a tool call. */
const openedFromExtension = async (session) => {
  const answer = parseJson((await execTool(session, 'skraft_probe_canvas_open_self')).text)
  const opened = ((await canvasSeen(session))?.opened ?? []).filter(({ instanceId }) => instanceId === 'skraft-probe-self')
  const input = opened[0]?.input ?? null
  await rpcOr(() => session.rpc.canvas.close({ instanceId: 'skraft-probe-self' }))
  return check({
    id: 'canvas-open-from-extension', expected: CANVAS_EXPECTED['canvas-open-from-extension'],
    verdict: answer === null ? 'inconclusive' : answer.error === null && opened.length === 1 && input?.tab === 'configuration' ? 'pass' : 'fail',
    observed: { answer, openCalls: opened.length, input },
  })
}

/** The page asks the joined session to confirm; the host accepts. */
const confirmFromPage = async (url, answers) => {
  if (url === null) return check({ id: 'confirm-from-canvas', expected: CANVAS_EXPECTED['confirm-from-canvas'], observed: { reason: 'the probe canvas gave no loopback url' } })
  answers.mode = 'accept'
  const callsBefore = answers.calls.length
  const answer = await postJson(new URL('/confirm', url))
  answers.mode = 'decline'
  const hostAsked = answers.calls.length - callsBefore
  return check({
    id: 'confirm-from-canvas', expected: CANVAS_EXPECTED['confirm-from-canvas'],
    verdict: answer === null ? 'inconclusive' : answer.value === true && hostAsked === 1 ? 'pass' : 'fail', observed: { answer, hostAsked },
  })
}

/** The canvas tools the model gets, without then with requestCanvasRenderer. */
const canvasAgentTools = async (context, plugin, joined) => {
  const expected = CANVAS_EXPECTED['canvas-agent-tools']
  if (!joined) return check({ id: 'canvas-agent-tools', expected, observed: { reason: 'the probe canvas did not join' } })
  const offered = async (extra) => {
    const { session } = await canvasSession(context, plugin, extra)
    try { return [...await currentTools(session)].filter((name) => CANVAS_AGENT_TOOLS.includes(name)).sort() } finally { await session.disconnect?.().catch(() => undefined) }
  }
  const without = await offered({})
  const withRenderer = await offered({ requestCanvasRenderer: true })
  return check({
    id: 'canvas-agent-tools', expected,
    verdict: without.length === 0 && CANVAS_AGENT_TOOLS.every((name) => withRenderer.includes(name)) ? 'pass' : 'fail', observed: { without, withRenderer },
  })
}

/** An RPC's answer, or its error text. */
const rpcOr = async (call) => {
  try {
    return { value: await withTimeout(call(), T.rpc, 'canvas rpc'), error: null }
  } catch (error) {
    return { value: null, error: messageOf(error) }
  }
}

/** The url when it names the loopback address over http, else null. */
export const loopbackUrl = (url) => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1' ? parsed.href : null
  } catch {
    return null
  }
}

const fetchStatus = async (url) => {
  try { return (await withTimeout(fetch(url), T.rpc, 'canvas page')).status } catch { return null }
}

const postJson = async (url) => {
  try { return await (await withTimeout(fetch(url, { method: 'POST' }), T.workflow, 'canvas confirm')).json() } catch { return null }
}

// ---------------------------------------------------------------------------------------------
// Checks: the session's MCP servers, reached from inside a workflow run without the model (#400)

const MCP_IDS = Object.freeze(['mcp-tool-from-workflow', 'mcp-permission-from-workflow', 'mcp-unavailable-from-workflow', 'mcp-tool-error-from-workflow', 'github-mcp-in-session'])
const MCP_EXPECTED = Object.freeze({
  'mcp-tool-from-workflow': `Dans un run de workflow, la session jointe de l'extension liste le serveur MCP de la session (\`rpc.mcp.list()\`, \`connected\`) et ses outils (\`rpc.mcp.listTools\`), puis appelle son outil \`echo\` par \`rpc.tools.execute({ name: '<serveur>-<outil>' })\` et lit son résultat (\`echo:${PROBE_MCP.sentinel}\`), sans modèle.`,
  'mcp-permission-from-workflow': "Un outil MCP sans `readOnlyHint` appelé depuis l'extension passe par le gestionnaire de permissions de l'hôte (`kind: 'mcp'`), lui seul et une fois par appel : approuvé, il s'exécute ; refusé, il rend `resultType: 'rejected'` sans lever. Un outil `readOnlyHint` ne demande rien.",
  'mcp-unavailable-from-workflow': "Ce que l'extension reçoit quand le serveur manque : `rpc.mcp.listTools` d'un serveur non configuré lève « not connected » ; un serveur dont le processus meurt est listé `failed` ; `rpc.tools.execute` d'un outil absent rend `resultType: 'failure'` sans lever.",
  'mcp-tool-error-from-workflow': `Un outil MCP qui répond une erreur (\`isError: true\`) rend, par \`rpc.tools.execute\`, \`resultType: 'failure'\` avec son texte (\`${PROBE_MCP.failure}\`), sans lever.`,
  'github-mcp-in-session': `Le serveur MCP GitHub (\`${GITHUB_MCP_SERVER}\`, intégré à Copilot CLI ou configuré par le développeur) figure, connecté, dans \`rpc.mcp.list()\` de la session jointe, et \`rpc.mcp.listTools\` en rend les outils. Non concluant quand il n'y est pas : il dépend de la connexion et de la configuration de la machine.`,
})

/** A permission handler that records each MCP request and approves or rejects it as `seen.mode` says. */
const mcpPermissionRecorder = (sdk) => {
  const seen = { mode: 'approve', requests: [] }
  const approve = permissionHandler(sdk)
  const handler = async (request, invocation) => {
    if (request?.kind !== 'mcp') return approve(request, invocation)
    seen.requests.push(request.toolName ?? null)
    return seen.mode === 'reject' ? { kind: 'reject' } : approve(request, invocation)
  }
  return { seen, handler }
}

/** Every MCP check inconclusive, with what stopped the measure. */
const mcpUnmeasured = (observed) => MCP_IDS.map((id) => check({ id, issue: 400, expected: MCP_EXPECTED[id], observed }))

const mcpChecks = async ({ sdk, client, dirs, layout }) => {
  if (layout === null) return mcpUnmeasured({ reason: 'no probe extension loaded' })
  const suffix = layout === 'agent-plugins' ? 'a' : 'l'
  const permissions = mcpPermissionRecorder(sdk)
  let session
  try {
    session = await client.createSession({
      ...dirs.session, workingDirectory: dirs.repoA, pluginDirectories: [suffix === 'a' ? dirs.plugins.agent : dirs.plugins.legacy], requestExtensions: true,
      onPermissionRequest: permissions.handler, mcpServers: await writeProbeMcpServers(dirs.root, process.execPath),
    })
  } catch (error) {
    return mcpUnmeasured({ sessionError: messageOf(error) })
  }
  try {
    await waitForTools(session, [`skraft_probe_state_${suffix}`])
    const approved = await runWorkflow(session, `skraft-probe-${suffix}`, { mcp: true })
    const approvedAsked = permissions.seen.requests.splice(0)
    permissions.seen.mode = 'reject'
    const rejected = await runWorkflow(session, `skraft-probe-${suffix}`, { mcp: true })
    const rejectedAsked = permissions.seen.requests.splice(0)
    return [mcpToolCheck(approved), mcpPermissionCheck({ approved, approvedAsked, rejected, rejectedAsked }), mcpUnavailableCheck(approved), mcpToolErrorCheck(approved), githubMcpCheck(approved)]
  } finally {
    await session.disconnect?.().catch(() => undefined)
  }
}

/** The probe's servers a run saw still `pending`: what they answer is not yet theirs. */
const pendingServers = (run) => (Array.isArray(run.result?.servers) ? run.result.servers.filter(({ status }) => status === 'pending').map(({ name }) => name) : [])

/** The check when the run did not complete, or saw a server still pending: inconclusive, with why; null otherwise. */
const mcpRunFailed = (id, run) => {
  if (run.status !== 'completed') return check({ id, issue: 400, expected: MCP_EXPECTED[id], observed: { status: run.status, error: run.error ?? null } })
  const pending = pendingServers(run)
  return pending.length === 0 ? null : check({ id, issue: 400, expected: MCP_EXPECTED[id], observed: { pending } })
}

/** A server as the run listed it, null when it is not listed. */
const listedServer = (run, name) => (Array.isArray(run.result?.servers) ? run.result.servers.find((server) => server.name === name) ?? null : null)

const mcpToolCheck = (run) => {
  const id = 'mcp-tool-from-workflow'
  const seen = run.result ?? {}
  const connected = listedServer(run, PROBE_MCP.server)?.status === 'connected'
  const listed = Array.isArray(seen.tools) && seen.tools.includes('echo')
  const answered = seen.echo?.text === `echo:${PROBE_MCP.sentinel}`
  return mcpRunFailed(id, run) ?? check({ id, issue: 400, expected: MCP_EXPECTED[id], verdict: connected && listed && answered ? 'pass' : 'fail', observed: { servers: seen.servers ?? null, tools: seen.tools ?? null, echo: seen.echo ?? null } })
}

/** Whether a run asked the host for the side-effect tool alone, once. */
const asksForTouchOnly = (asked) => asked.length === 1 && asked[0] === `${PROBE_MCP.server}-touch`

const mcpPermissionCheck = ({ approved, approvedAsked, rejected, rejectedAsked }) => {
  const id = 'mcp-permission-from-workflow'
  const runs = asksForTouchOnly(approvedAsked) && approved.result?.touch?.type === 'success'
  const refused = asksForTouchOnly(rejectedAsked) && rejected.result?.touch?.type === 'rejected'
  return mcpRunFailed(id, approved) ?? mcpRunFailed(id, rejected) ?? check({
    id, issue: 400, expected: MCP_EXPECTED[id], verdict: runs && refused ? 'pass' : 'fail',
    observed: { approvedAsked, approved: approved.result?.touch ?? null, rejectedAsked, rejected: rejected.result?.touch ?? null },
  })
}

const mcpUnavailableCheck = (run) => {
  const id = 'mcp-unavailable-from-workflow'
  const seen = run.result ?? {}
  const failing = listedServer(run, PROBE_MCP.failing)
  const notConnected = /not connected/.test(seen.absentServer?.error ?? '')
  const pass = notConnected && failing?.status === 'failed' && seen.absentTool?.type === 'failure'
  return mcpRunFailed(id, run) ?? check({ id, issue: 400, expected: MCP_EXPECTED[id], verdict: pass ? 'pass' : 'fail', observed: { absentServer: seen.absentServer ?? null, failing, absentTool: seen.absentTool?.type ?? seen.absentTool ?? null } })
}

const mcpToolErrorCheck = (run) => {
  const id = 'mcp-tool-error-from-workflow'
  const seen = run.result ?? {}
  const pass = seen.fail?.type === 'failure' && String(seen.fail?.text ?? '').includes(PROBE_MCP.failure)
  return mcpRunFailed(id, run) ?? check({ id, issue: 400, expected: MCP_EXPECTED[id], verdict: pass ? 'pass' : 'fail', observed: { fail: seen.fail ?? null } })
}

/** pass when the GitHub MCP server is connected and lists tools; never fail: its presence hangs on the login and the configuration. */
const githubMcpCheck = (run) => {
  const id = 'github-mcp-in-session'
  const seen = run.result ?? {}
  const server = listedServer(run, GITHUB_MCP_SERVER)
  const reachable = server?.status === 'connected' && seen.github?.tools > 0
  if (run.status !== 'completed') return check({ id, issue: 400, expected: MCP_EXPECTED[id], observed: { status: run.status, error: run.error ?? null } })
  return check({ id, issue: 400, expected: MCP_EXPECTED[id], verdict: reachable ? 'pass' : 'inconclusive', observed: { listed: server !== null, status: server?.status ?? null, github: seen.github ?? null } })
}

// ---------------------------------------------------------------------------------------------
// Checks: the real skraft-framework plugin

const skraftChecks = async ({ sdk, client, dirs, models }) => {
  const checks = []
  const pluginRoot = join(REPO_ROOT, 'plugins', 'skraft-framework')
  await writeQuestionRepo(dirs.questionA, pluginRoot, dirs.home)
  const { answers, handler } = elicitationRecorder()
  const session = await client.createSession({
    ...dirs.session, workingDirectory: dirs.questionA, pluginDirectories: [pluginRoot], requestExtensions: true,
    onPermissionRequest: permissionHandler(sdk), onElicitationRequest: handler,
  })
  try {
    const loaded = (await waitForTools(session, ['skraft_decide'])).has('skraft_decide')
    checks.push(check({
      id: 'skraft-extension-loaded', expected: "L'extension `skraft-pipeline` du plugin skraft-framework est chargée : l'outil `skraft_decide` est proposé.",
      verdict: loaded ? 'pass' : 'fail', observed: { skraftDecideOffered: loaded },
      title: "V2 — l'extension skraft-pipeline ne se charge pas sous Copilot", labels: ['bug', 'gain:reliability'],
      body: "Dans un hôte SDK headless, avec `pluginDirectories` sur `plugins/skraft-framework`, l'outil `skraft_decide` n'est pas proposé : l'extension `skraft-pipeline` ne s'est pas chargée (emplacement, manifeste ou erreur au join).",
    }))
    checks.push(...await skraftWorkflowChecks(session))
    if (loaded) {
      checks.push(await decideWithoutConfirm(session, dirs, answers))
      checks.push(...await skraftCanvasChecks(session, dirs, answers))
      checks.push(await decideOneQuestion(session, dirs, answers))
      checks.push(await decideAfterCd(session, dirs, pluginRoot, answers))
    }
    checks.push(await sessionAgents(session, pluginRoot))
  } finally {
    await session.disconnect?.().catch(() => undefined)
  }
  checks.push(await copilotModels(client, models))
  return checks
}

const skraftWorkflowChecks = async (session) => {
  const plain = await runWorkflow(session, 'skraft-pipeline', { slug: 'Not A Slug' })
  const extra = await runWorkflow(session, 'skraft-pipeline', { slug: 'Not A Slug', probeUnknownKey: true })
  const registered = plain.status === 'completed' && plain.result?.code === 'invalid-slug'
  return [
    check({
      id: 'skraft-workflow-registered', expected: "Le workflow `skraft-pipeline` est enregistré : un slug invalide finit `completed` avec `code: invalid-slug`, sans lancer d'agent.",
      verdict: registered ? 'pass' : 'fail', observed: { status: plain.status, result: plain.result ?? null, error: plain.error ?? null },
      title: "V2 — le workflow skraft-pipeline n'est pas enregistré sous Copilot", labels: ['bug', 'gain:reliability'],
      body: "Dans un hôte SDK headless avec le plugin skraft-framework, `session.workflow.run({ name: 'skraft-pipeline' })` ne rend pas l'outcome attendu pour un slug invalide.",
    }),
    check({
      id: 'unknown-arg-ignored', issue: 249,
      expected: "Une clé inconnue dans les arguments du workflow est ignorée en silence : l'outcome est le même que sans elle (ce que dit l'issue).",
      verdict: registered ? (extra.status === 'completed' && extra.result?.code === 'invalid-slug' ? 'pass' : 'fail') : 'inconclusive',
      observed: { status: extra.status, result: extra.result ?? null, error: extra.error ?? null },
    }),
  ]
}

const decideWithoutConfirm = async (session, dirs, answers) => {
  const callsBefore = answers.calls.length
  const result = await execTool(session, 'skraft_decide', {})
  const answered = (await questionEvents(dirs.questionA)).filter((event) => event.type === 'question.answered')
  return check({
    id: 'decide-without-confirm', issue: 244,
    expected: "`skraft_decide` appelé sans humain ratifie une ADR en attente sans aucune demande de confirmation à l'hôte (ce que dit l'issue).",
    verdict: answered.length === 1 && answers.calls.length === callsBefore ? 'pass' : answered.length === 0 ? 'fail' : 'inconclusive',
    observed: { toolResult: result.text ?? result.error, answeredBy: answered.map((event) => event.by), hostAsked: answers.calls.length - callsBefore },
  })
}

/**
 * `skraft_decide` puts the question adr-0 waits on to the host once, as a choice among its
 * options; the option the host's handler chooses is journaled host-confirmed, with no
 * confirmation after it. Runs before decide-after-cd moves the session to the second working copy.
 */
const decideOneQuestion = async (session, dirs, answers) => {
  answers.mode = 'accept'
  const before = answers.calls.length
  const result = await execTool(session, 'skraft_decide', {})
  answers.mode = 'decline'
  const requests = answers.calls.slice(before).map(({ fields, options }) => ({ fields, options }))
  const answered = (await questionEvents(dirs.questionA)).filter((event) => event.type === 'question.answered').map(({ answer, by }) => [answer, by])
  const once = requests.length === 1 && requests[0].fields.join() === 'selection' && requests[0].options?.join() === 'RATIFIED,REJECTED'
  return check({
    id: 'skraft-decide-one-question',
    expected: "`skraft_decide`, sans argument, pose à l'hôte la question qu'attend le pipeline actif, une seule fois, comme un choix parmi ses options (`selection` en `enum`) ; l'option que choisit le handler de l'hôte est journalisée `host-confirmed`, sans confirmation de plus.",
    verdict: result.ok ? (once && answered.length === 1 && answered[0].join() === 'RATIFIED,host-confirmed' ? 'pass' : 'fail') : 'inconclusive',
    observed: { toolResult: result.text ?? result.error, requests, answered },
    title: 'V2 — skraft_decide ne pose pas la question une seule fois sous Copilot', labels: ['bug', 'gain:reliability'],
    body: "Dans un hôte SDK headless avec le plugin skraft-framework, `skraft_decide` ne pose pas à l'hôte la question qu'attend le pipeline actif en une seule élicitation à options, ou ne journalise pas l'option choisie `host-confirmed` : la personne répondrait deux fois, ou pas du tout.",
  })
}

// The skraft-pipeline canvas of the real plugin, in the working copy that waits on adr-0: declared,
// opened headless with the question on its stream, and taking no answer from its page. Runs
// before skraft-decide-one-question answers adr-0.
const SKRAFT_CANVAS = 'skraft-pipeline'
const SKRAFT_INSTANCE = 'skraft-probe-pipeline'
const SKRAFT_CANVAS_EXPECTED = Object.freeze({
  'skraft-canvas-registered': "Le canvas `skraft-pipeline` de l'extension skraft-framework est déclaré dans la session : `session.rpc.canvas.list()` le nomme.",
  'skraft-canvas-opens': "`session.rpc.canvas.open` du canvas `skraft-pipeline`, dans un dépôt dont le pipeline actif attend `adr-0`, rend une url loopback qui porte le jeton du panneau (`?t=`) et le titre du slug ; la page répond 200 sous `default-src 'none'` à cette url et 403 sans le jeton, et son flux d'événements, ouvert avec ce jeton, porte la question `adr-0`.",
  'skraft-canvas-read-only': "Le canvas ne prend aucune réponse : un POST `/answer` avec le jeton et l'Origin de la page répond 404, rien n'est demandé à l'hôte ni journalisé. La question se pose dans le chat.",
})
const SKRAFT_CANVAS_ISSUE = Object.freeze({
  title: "V2 — le canvas skraft-pipeline ne s'ouvre pas sous Copilot", labels: ['bug', 'gain:reliability'],
  body: "Dans un hôte SDK headless avec le plugin skraft-framework, le canvas `skraft-pipeline` n'est pas déclaré, ne s'ouvre pas, ou sa page ne montre pas la question du pipeline actif : la vue du run n'est pas disponible sous Copilot.",
})

const skraftCanvasChecks = async (session, dirs, answers) => {
  const listed = await rpcOr(() => session.rpc.canvas.list())
  const declared = (listed.value?.canvases ?? []).some((canvas) => canvas.canvasId === SKRAFT_CANVAS)
  const registered = check({ id: 'skraft-canvas-registered', expected: SKRAFT_CANVAS_EXPECTED['skraft-canvas-registered'], ...SKRAFT_CANVAS_ISSUE, verdict: declared ? 'pass' : 'fail', observed: { declared, error: listed.error } })
  if (!declared) return [registered, ...['skraft-canvas-opens', 'skraft-canvas-read-only'].map((id) => check({ id, expected: SKRAFT_CANVAS_EXPECTED[id], observed: { reason: 'the skraft-pipeline canvas is not declared' } }))]
  try {
    const opened = await skraftCanvasOpened(session)
    return [registered, opened.check, await skraftCanvasReadOnly(opened.page, dirs, answers)]
  } finally {
    await rpcOr(() => session.rpc.canvas.close({ instanceId: SKRAFT_INSTANCE }))
  }
}

/** Opens the canvas, reads its page and the first content of its stream. */
const skraftCanvasOpened = async (session) => {
  const opened = await rpcOr(() => session.rpc.canvas.open({ canvasId: SKRAFT_CANVAS, instanceId: SKRAFT_INSTANCE, input: {} }))
  const url = loopbackUrl(opened.value?.url)
  const token = url === null ? null : new URL(url).searchParams.get('t')
  const page = token === null ? null : await pageOf(url)
  const withoutToken = token === null ? null : await fetchStatus(new URL('/', url).href)
  const content = page === null ? null : await firstContent(url, token)
  const shows = page?.status === 200 && withoutToken === 403 && /default-src 'none'/.test(page.csp ?? '') && content?.question?.key === QUESTION_KEY && opened.value?.title === `skraft ${QUESTION_SLUG}`
  return {
    page: page === null ? null : { url, token },
    check: check({
      id: 'skraft-canvas-opens', expected: SKRAFT_CANVAS_EXPECTED['skraft-canvas-opens'], ...SKRAFT_CANVAS_ISSUE,
      verdict: shows ? 'pass' : 'fail',
      observed: { error: opened.error, title: opened.value?.title ?? null, status: opened.value?.status ?? null, loopback: url !== null, tokenInUrl: token !== null, page: page?.status ?? null, pageWithoutToken: withoutToken, csp: page?.csp ?? null, question: content?.question?.key ?? null, contentStatus: content?.status ?? null },
    }),
  }
}

/** Posts an answer to adr-0 from the page, the host accepting any dialog: nothing is asked nor journaled. */
const skraftCanvasReadOnly = async (page, dirs, answers) => {
  const expected = SKRAFT_CANVAS_EXPECTED['skraft-canvas-read-only']
  if (page === null) return check({ id: 'skraft-canvas-read-only', expected, observed: { reason: 'the skraft-pipeline canvas gave no page' } })
  answers.mode = 'accept'
  const callsBefore = answers.calls.length
  const posted = await postAnswer(page, { key: QUESTION_KEY, answer: 'RATIFIED' })
  answers.mode = 'decline'
  const by = (await questionEvents(dirs.questionA)).filter((event) => event.type === 'question.answered').map((event) => event.by)
  const hostAsked = answers.calls.length - callsBefore
  return check({
    id: 'skraft-canvas-read-only', expected,
    verdict: posted === null ? 'inconclusive' : posted.status === 404 && by.length === 0 && hostAsked === 0 ? 'pass' : 'fail',
    observed: { posted, answeredBy: by, hostAsked },
  })
}

/** The page's status and CSP; null when it does not answer. */
const pageOf = async (url) => {
  try {
    const response = await withTimeout(fetch(url), T.rpc, 'canvas page')
    return { status: response.status, csp: response.headers.get('content-security-policy') }
  } catch {
    return null
  }
}

/** The first content the page's event stream sends; null when none comes in time. */
const firstContent = (url, token) => withTimeout(new Promise((done) => {
  const request = httpGet(new URL(`/events?token=${token}`, url), (res) => {
    let buffer = ''
    res.setEncoding('utf8')
    res.on('data', (chunk) => {
      buffer += chunk
      if (!buffer.includes('\n\n')) return
      request.destroy()
      done(parseJson(buffer.split('\n\n')[0].replace(/^data: /, '')))
    })
  })
  request.on('error', () => done(null))
}), T.rpc, 'canvas events').catch(() => null)

const postAnswer = async ({ url, token }, body) => {
  try {
    const response = await withTimeout(fetch(new URL('/answer', url), { method: 'POST', headers: { 'content-type': 'application/json', 'x-skraft-token': token, origin: new URL(url).origin }, body: JSON.stringify(body) }), T.workflow, 'canvas answer')
    return { status: response.status, body: await response.json() }
  } catch {
    return null
  }
}

// The person answers here: a driver that asks the host before recording (#244) would otherwise
// record nowhere, and the check could not tell which repository it acts on.
const decideAfterCd = async (session, dirs, pluginRoot, answers) => {
  await writeQuestionRepo(dirs.questionB, pluginRoot, dirs.home)
  try { await setWorkingDirectory(session, dirs.questionB) } catch (error) { return check({ id: 'decide-after-cd', issue: 245, expected: DECIDE_CD_EXPECTED, observed: { error: messageOf(error) } }) }
  await sleep(T.settle)
  await currentTools(session).catch(() => undefined)
  answers.mode = 'accept'
  const result = await execTool(session, 'skraft_decide', {})
  answers.mode = 'decline'
  const answeredInB = (await questionEvents(dirs.questionB)).some((event) => event.type === 'question.answered')
  return check({
    id: 'decide-after-cd', issue: 245, expected: DECIDE_CD_EXPECTED,
    verdict: result.ok ? (answeredInB ? 'fail' : 'pass') : 'inconclusive',
    observed: { toolResult: result.text ?? result.error, answeredInSecondRepo: answeredInB },
  })
}
const DECIDE_CD_EXPECTED = "Après `setWorkingDirectory` vers un second dépôt dont le pipeline attend une ADR, `skraft_decide` agit encore sur le premier : le second reste sans réponse (ce que dit l'issue)."

const sessionAgents = async (session, pluginRoot) => {
  const { resolveAgentId } = await import(pathToFileURL(join(pluginRoot, 'engine', 'drivers', 'copilot-workflow', 'ctx-agent-runner.mjs')).href)
  const ids = readdirSync(join(pluginRoot, 'com.github.copilot', 'agents')).filter((name) => name.endsWith('.agent.md')).map((name) => name.replace(/\.agent\.md$/, ''))
  let listed
  try { listed = (await withTimeout(session.rpc.agent.list({}), T.rpc, 'agent.list'))?.agents ?? [] } catch (error) {
    return check({ id: 'session-agents', expected: AGENTS_EXPECTED, observed: { error: messageOf(error) } })
  }
  const missing = ids.filter((id) => resolveAgentId(id, { listed, pluginName: null }) === null)
  return check({
    id: 'session-agents', expected: AGENTS_EXPECTED, verdict: missing.length === 0 ? 'pass' : 'fail',
    observed: { agentFiles: ids.length, missing, sample: listed.slice(0, 5).map(({ id, name }) => ({ id, name })) },
    title: 'V2 — agents skraft introuvables dans la session Copilot', labels: ['bug', 'gain:reliability'],
    body: "`session.rpc.agent.list` ne permet pas de résoudre tous les agents de `com.github.copilot/agents/` avec `resolveAgentId` : le pilote répondra `unavailable` pour ces étapes.",
  })
}
const AGENTS_EXPECTED = "Chaque agent de `com.github.copilot/agents/` se résout dans `session.rpc.agent.list` par la règle de `resolveAgentId`."

/** Each Copilot model name `models` gives a family (`<family>: { copilot: { model } }`), as `<family>: <name>`. */
const copilotNames = (models) => Object.entries(models).flatMap(([family, hosts]) => [hosts?.copilot?.model ?? []].flat().map((name) => `${family}: ${name}`))

const copilotModels = async (client, models) => {
  const configured = copilotNames(models)
  if (configured.length === 0) return check({ id: 'copilot-models-available', expected: MODELS_EXPECTED, observed: { configured } })
  let ids
  try { ids = new Set((await withTimeout(client.listModels(), T.rpc, 'listModels')).map((model) => model.id)) } catch (error) {
    return check({ id: 'copilot-models-available', expected: MODELS_EXPECTED, observed: { error: messageOf(error) } })
  }
  const missing = configured.filter((entry) => !ids.has(entry.slice(entry.indexOf(': ') + 2)))
  return check({
    id: 'copilot-models-available', expected: MODELS_EXPECTED, verdict: missing.length === 0 ? 'pass' : 'fail',
    observed: { missing, available: [...ids].sort() },
    title: 'V2 — noms de modèles Copilot de skraft-config.json absents du catalogue Copilot', labels: ['bug', 'gain:reliability'],
    body: "Des noms Copilot de `models` dans `skraft-config.json` ne figurent pas dans `client.listModels()`. Le pilote retombe alors sur le modèle de la session, et une famille de modèle déclarée dans le workflow n'est pas respectée.",
  })
}
const MODELS_EXPECTED = 'Chaque nom Copilot de `models` dans `skraft-config.json` figure dans `client.listModels()`.'

/**
 * The names of the tools the skraft-pipeline extension registers: the driver's own register, run
 * against a join that records what it is given, as the driver tests read them.
 */
const skraftToolNames = async (dirs) => {
  const pluginRoot = join(REPO_ROOT, 'plugins', 'skraft-framework')
  const { register } = await import(pathToFileURL(join(pluginRoot, 'engine', 'drivers', 'copilot-workflow', 'register.mjs')).href)
  const names = []
  const session = { log: async () => undefined, rpc: { metadata: { snapshot: async () => ({}) } } }
  await register({
    defineWorkflow: (definition) => definition, pluginRoot, home: dirs.home,
    joinSession: async ({ tools = [] }) => { names.push(...tools.map((tool) => tool.name)); return session },
  })
  return names.sort()
}

/**
 * A tool every measured session offers, with or without a login (CLI 1.0.102-1,
 * docs/v2/host-verification.md, 2026-10-27): a list without it is a host that did not finish
 * loading its tools, and says nothing about collisions.
 */
const KNOWN_NATIVE_TOOL = 'bash'

/** The host's own tools, from a session that loads no plugin and no extension; inconclusive without bash. */
const nativeToolNames = async (sdk, client, dirs) => {
  let native
  let skraft
  try {
    skraft = await skraftToolNames(dirs)
    const session = await client.createSession({ ...dirs.session, workingDirectory: dirs.repoA, pluginDirectories: [], onPermissionRequest: permissionHandler(sdk) })
    try { native = [...await currentTools(session)].sort() } finally { await session.disconnect?.().catch(() => undefined) }
  } catch (error) {
    return check({ id: 'skraft-tool-names-free', expected: TOOL_NAMES_EXPECTED, observed: { error: messageOf(error) } })
  }
  if (skraft.length === 0 || !native.includes(KNOWN_NATIVE_TOOL)) return check({ id: 'skraft-tool-names-free', expected: TOOL_NAMES_EXPECTED, observed: { native, skraft } })
  const collisions = skraft.filter((name) => native.includes(name))
  return check({
    id: 'skraft-tool-names-free', expected: TOOL_NAMES_EXPECTED, verdict: collisions.length === 0 ? 'pass' : 'fail',
    observed: { native, skraft, collisions },
    title: 'V2 — un outil natif de Copilot porte le nom d\'un outil skraft', labels: ['bug', 'gain:reliability'],
    body: "Une session Copilot sans plugin propose déjà un outil du nom d'un outil que l'extension `skraft-pipeline` enregistre : l'hôte peut refuser le join de l'extension ou masquer l'un des deux outils.",
  })
}
const TOOL_NAMES_EXPECTED = "Aucun outil natif d'une session Copilot sans plugin ne porte le nom d'un outil de l'extension `skraft-pipeline`."

// ---------------------------------------------------------------------------------------------
// Run, report

/**
 * Runs every check and returns the report. `sdk` is the `@github/copilot-sdk` module (or a
 * double in tests); `models`: the `models` of the skraft-config.json whose Copilot names are checked;
 * `agentCalls`: whether the checks that start an agent run.
 */
export const runProbe = async ({ sdk, sdkPath, environment, workRoot, home = homedir(), models = {}, agentCalls = false, timings = {}, log = () => undefined }) => {
  T = { ...DEFAULT_TIMINGS, ...timings }
  const root = workRoot ?? await mkdtemp(join(tmpdir(), 'skraft-host-probe-'))
  const dirs = { root, home, repoA: join(root, 'repo-a'), repoB: join(root, 'repo-b'), questionA: join(root, 'question-a'), questionB: join(root, 'question-b') }
  // The in-process runtime has no bundled SDK to fall back on for extension subprocesses.
  dirs.session = sdkPath ? { extensionSdkPath: sdkPath } : {}
  await mkdir(dirs.repoA, { recursive: true })
  await mkdir(dirs.repoB, { recursive: true })
  dirs.plugins = await writeProbePlugins(root)
  const client = new sdk.CopilotClient({ logLevel: 'error' })
  await client.start()
  const checks = []
  try {
    log('probe extensions…')
    const probe = await probeChecks({ sdk, client, dirs, agentCalls })
    checks.push(...probe.checks)
    log('isolation at join…')
    checks.push(...await isolationChecks({ sdk, client, dirs, layout: probe.layout }))
    log('canvas…')
    checks.push(...await canvasChecks({ sdk, client, dirs, layout: probe.layout }))
    log('MCP servers from the extension…')
    checks.push(...await mcpChecks({ sdk, client, dirs, layout: probe.layout }))
    log('skraft-framework plugin…')
    checks.push(...await skraftChecks({ sdk, client, dirs, models }))
    log('native tools…')
    checks.push(await nativeToolNames(sdk, client, dirs))
  } finally {
    await client.stop().catch(() => undefined)
  }
  return { date: new Date().toISOString(), environment, workRoot: root, checks }
}

/** The report as Markdown, ready for docs/v2/host-verification.md. */
export const reportMarkdown = ({ date, environment, checks }) => [
  `## Sonde d'hôte Copilot — ${date.slice(0, 10)}`,
  '',
  `Copilot CLI ${environment.copilot ?? '?'} · SDK ${environment.sdk ?? '?'} · Node ${environment.node} · ${environment.os}. ${checksCallAgents(checks) ? 'Deux appels d\'agent (--agent-calls).' : 'Aucun appel de modèle.'}`,
  '',
  '| Contrôle | Issue | Verdict | Observé |',
  '| --- | --- | --- | --- |',
  ...checks.map((item) => `| \`${item.id}\` | ${item.issue ? `#${item.issue}` : '—'} | ${item.verdict} | ${JSON.stringify(item.observed).replace(/\|/g, '\\|').slice(0, 300)} |`),
  '',
].join('\n')

/** Whether the refusal checks started their agents. */
const checksCallAgents = (checks) => checks.some((item) => item.id === 'copilot-model-refusal' && item.observed !== AGENT_CALLS_NEEDED)

// ---------------------------------------------------------------------------------------------
// CLI

const USAGE = 'usage: node eng/host-probe/copilot-probe.mjs [--sdk <copilot-sdk dir>] [--copilot <copilot binary>] [--out <dir>] [--report-issues [--dry-run]] [--repo owner/name] [--keep] [--agent-calls] [--require <check,...>]'

export const parseArgs = (argv) => {
  const options = { sdk: null, copilot: null, out: 'host-probe-results', reportIssues: false, dryRun: false, repo: DEFAULT_REPO, keep: false, agentCalls: false, require: [] }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    const value = () => {
      const next = argv[++index]
      if (next === undefined || next.startsWith('--')) throw new Error(USAGE)
      return next
    }
    if (arg === '--sdk') options.sdk = value()
    else if (arg === '--copilot') options.copilot = value()
    else if (arg === '--out') options.out = value()
    else if (arg === '--repo') options.repo = value()
    else if (arg === '--report-issues') options.reportIssues = true
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--keep') options.keep = true
    else if (arg === '--agent-calls') options.agentCalls = true
    else if (arg === '--require') options.require = value().split(',').map((id) => id.trim()).filter(Boolean)
    else throw new Error(USAGE)
  }
  return options
}

/** Each required check that did not pass, as `<id>: <verdict>`; `<id>: missing` when the report has no such check. */
export const requiredFailures = (report, ids) => ids.flatMap((id) => {
  const verdict = report.checks.find((item) => item.id === id)?.verdict ?? 'missing'
  return verdict === 'pass' ? [] : [`${id}: ${verdict}`]
})

/** The SDK the local Copilot CLI ships (`~/.copilot/pkg/<platform>/<version>/copilot-sdk`), newest first. */
const bundledSdks = () => {
  const pkg = join(homedir(), '.copilot', 'pkg')
  if (!existsSync(pkg)) return []
  const byVersion = (a, b) => b.version.localeCompare(a.version, undefined, { numeric: true })
  return readdirSync(pkg).flatMap((target) => {
    const dir = join(pkg, target)
    try { return readdirSync(dir).map((version) => ({ version, path: join(dir, version, 'copilot-sdk') })) } catch { return [] }
  }).filter(({ path }) => existsSync(join(path, 'index.js'))).sort(byVersion)
}

const loadSdk = async (explicit) => {
  const devDependency = join(REPO_ROOT, 'node_modules', '@github', 'copilot', 'copilot-sdk')
  const candidates = [explicit, process.env.SKRAFT_PROBE_SDK, ...bundledSdks().map(({ path }) => path), devDependency].filter(Boolean)
  for (const candidate of candidates) {
    const path = isAbsolute(candidate) ? candidate : resolve(candidate)
    const entry = path.endsWith('.js') || path.endsWith('.mjs') ? path : join(path, 'index.js')
    if (!existsSync(entry)) continue
    return { sdk: await import(pathToFileURL(entry).href), version: sdkVersionAt(dirname(entry)), path: dirname(entry) }
  }
  try {
    return { sdk: await import('@github/copilot-sdk'), version: 'node_modules' }
  } catch {
    throw new Error('Copilot SDK not found: pass --sdk <dir containing index.js> (e.g. ~/.copilot/pkg/<platform>/<version>/copilot-sdk), or install @github/copilot-sdk next to this repo.')
  }
}

const sdkVersionAt = (dir) => {
  try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version } catch { return basename(dirname(dir)) }
}

const copilotVersion = (binary) => {
  const names = binary ? [binary] : platform() === 'win32' ? ['copilot.cmd', 'copilot.exe', 'copilot'] : ['copilot']
  for (const name of names) {
    const run = spawnSync(name, ['--version'], { encoding: 'utf8' })
    if (run.status === 0) return run.stdout.trim().split(/\r?\n/)[0]
  }
  return null
}

/**
 * The CLI entry the install ships next to its SDK (`<version>/index.js`). Without it the SDK
 * looks for an npm platform package the CLI install does not have, and its bare
 * `copilot-runtime` cannot launch extensions.
 */
const adjacentCli = (sdkPath) => {
  const entry = join(dirname(sdkPath), 'index.js')
  return existsSync(entry) ? entry : null
}

/**
 * The `models` the configuration gives in the directory the probe runs from: ~/.skraft/config.json,
 * skraft-config.json and skraft-config.local.json, merged in that order; none when they give none.
 */
const configuredModels = (paths) => {
  const merged = paths.reduce((target, path) => mergePatch(target, modelsIn(path)), {})
  return merged !== null && typeof merged === 'object' && !Array.isArray(merged) ? merged : {}
}

/** The `models` of one configuration file; none when it is absent, unreadable or names none. */
const modelsIn = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')).models ?? {}
  } catch {
    return {}
  }
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const copilot = copilotVersion(options.copilot ? resolve(options.copilot) : process.env.COPILOT_CLI_PATH)
  if (options.copilot) process.env.COPILOT_CLI_PATH = resolve(options.copilot)
  const { sdk, version, path } = await loadSdk(options.sdk)
  const cli = path && !process.env.COPILOT_CLI_PATH ? adjacentCli(path) : null
  if (cli) process.env.COPILOT_CLI_PATH = cli
  const environment = { copilot, sdk: version, node: process.version, os: `${platform()} ${release()}` }
  console.log(`skraft host probe — Copilot ${environment.copilot ?? '?'}, SDK ${environment.sdk}`)
  const report = await runProbe({ sdk, sdkPath: path, environment, models: configuredModels([join(homedir(), '.skraft', 'config.json'), resolve('skraft-config.json'), resolve('skraft-config.local.json')]), agentCalls: options.agentCalls, log: (line) => console.log(line) })
  await mkdir(options.out, { recursive: true })
  const stamp = report.date.replace(/[:.]/g, '-')
  await writeFile(join(options.out, `host-probe-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(join(options.out, `host-probe-${stamp}.md`), reportMarkdown(report))
  for (const item of report.checks) console.log(`${item.verdict.padEnd(12)} ${item.id}${item.issue ? ` (#${item.issue})` : ''}`)
  console.log(`report: ${resolve(options.out)}`)
  if (options.reportIssues) await reportToGitHub(report, { repo: options.repo, dryRun: options.dryRun })
  const failures = requiredFailures(report, options.require)
  for (const failure of failures) console.error(`required check not passed: ${failure}`)
  if (failures.length > 0) process.exitCode = 1
  if (!options.keep) await rm(report.workRoot, { recursive: true, force: true })
  else console.log(`fixtures kept in ${report.workRoot}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(messageOf(error))
    process.exitCode = 1
  })
}

