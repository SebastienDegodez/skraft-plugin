#!/usr/bin/env node
// Copilot host probe: measures, through a headless SDK host and without any model call unless
// --agent-calls is given, the host behaviours the skraft-pipeline driver relies on. Each check is linked to the issue it measures
// (a comment with the result) or, for a requirement, opens an issue when it fails.
//
//   node eng/host-probe/copilot-probe.mjs [--sdk <copilot-sdk dir>] [--copilot <copilot binary>]
//        [--out <dir>] [--report-issues [--dry-run]] [--repo owner/name] [--keep] [--agent-calls]
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir, platform, release, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { QUESTION_KEY, questionEvents, writeIsolationPlugins, writeProbePlugins, writeQuestionRepo } from './fixtures.mjs'
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

/** A host-side elicitation handler that records each request and answers as `answers.mode` says. */
const elicitationRecorder = () => {
  const answers = { mode: 'decline', calls: [] }
  const handler = (context) => {
    answers.calls.push({ message: context?.message ?? null })
    if (answers.mode !== 'accept') return { action: 'decline' }
    const properties = context?.requestedSchema?.properties ?? {}
    if ('confirmed' in properties) return { action: 'accept', content: { confirmed: true } }
    if ('selection' in properties) return { action: 'accept', content: { selection: properties.selection?.enum?.[0] } }
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
      check({ id: 'bad-tool-name-isolation', issue: 246, expected: BADTOOL_EXPECTED, verdict: run.status === 'completed' && run.result?.ran === true ? 'fail' : 'pass', observed: { status: run.status, error: run.error ?? null } }),
    ]
  } finally {
    await session.disconnect?.().catch(() => undefined)
  }
}
const BROKEN_EXPECTED = "Un `defineWorkflow` invalide (sans `phases`) emporte l'outil enregistré dans le même `joinSession` (ce que dit l'issue)."
const BADTOOL_EXPECTED = "Un nom d'outil refusé par l'hôte (`bad name!`) emporte le workflow enregistré dans le même `joinSession` (ce que dit l'issue)."

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
  const result = await execTool(session, 'skraft_decide', { key: QUESTION_KEY, answer: 'RATIFIED' })
  const answered = (await questionEvents(dirs.questionA)).filter((event) => event.type === 'question.answered')
  return check({
    id: 'decide-without-confirm', issue: 244,
    expected: "`skraft_decide` appelé sans humain ratifie une ADR en attente sans aucune demande de confirmation à l'hôte (ce que dit l'issue).",
    verdict: answered.length === 1 && answers.calls.length === callsBefore ? 'pass' : answered.length === 0 ? 'fail' : 'inconclusive',
    observed: { toolResult: result.text ?? result.error, answeredBy: answered.map((event) => event.by), hostAsked: answers.calls.length - callsBefore },
  })
}

// The person confirms here: a driver that asks the host before recording (#244) would otherwise
// record nowhere, and the check could not tell which repository it acts on.
const decideAfterCd = async (session, dirs, pluginRoot, answers) => {
  await writeQuestionRepo(dirs.questionB, pluginRoot, dirs.home)
  try { await setWorkingDirectory(session, dirs.questionB) } catch (error) { return check({ id: 'decide-after-cd', issue: 245, expected: DECIDE_CD_EXPECTED, observed: { error: messageOf(error) } }) }
  await sleep(T.settle)
  await currentTools(session).catch(() => undefined)
  answers.mode = 'accept'
  const result = await execTool(session, 'skraft_decide', { key: QUESTION_KEY, answer: 'RATIFIED' })
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
    log('skraft-framework plugin…')
    checks.push(...await skraftChecks({ sdk, client, dirs, models }))
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

const USAGE = 'usage: node eng/host-probe/copilot-probe.mjs [--sdk <copilot-sdk dir>] [--copilot <copilot binary>] [--out <dir>] [--report-issues [--dry-run]] [--repo owner/name] [--keep] [--agent-calls]'

export const parseArgs = (argv) => {
  const options = { sdk: null, copilot: null, out: 'host-probe-results', reportIssues: false, dryRun: false, repo: DEFAULT_REPO, keep: false, agentCalls: false }
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
    else throw new Error(USAGE)
  }
  return options
}

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
  if (!options.keep) await rm(report.workRoot, { recursive: true, force: true })
  else console.log(`fixtures kept in ${report.workRoot}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(messageOf(error))
    process.exitCode = 1
  })
}

