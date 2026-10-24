/**
 * The skraft pipeline run through the Copilot SDK from a terminal or a VS Code task: a headless
 * Copilot CLI session in the working copy, with the skraft plugin's extension, runs the
 * `skraft-pipeline` workflow and the driver follows it to its end. The session path is the one the
 * host probe measures (Copilot CLI 1.0.101-0: `createSession` with `pluginDirectories` and
 * `requestExtensions`, `rpc.workflow.run`, then `rpc.workflow.getRun` until a terminal status;
 * an unregistered workflow is rejected). Nothing on the run path throws: every failure is an
 * outcome whose reason is fixed here, never the SDK's or the host's text.
 *
 * @typedef {import('../../application/pipeline/active-run.mjs').RunOutcome} RunOutcome
 * @typedef {{ status: RunOutcome['status'] | 'error', slug: string | null, phase: string | null, code: string | null, reason: string }} SdkOutcome
 * @typedef {{ slug?: string, issue?: number, title?: string, base?: string, fromArtifacts?: true }} WorkflowArgs
 * @typedef {{ status: string, runId?: string, result?: unknown }} RunEnvelope
 * @typedef {{
 *   rpc: { workflow: { run: (request: { name: string, args: WorkflowArgs }) => Promise<RunEnvelope>, getRun: (request: { runId: string }) => Promise<RunEnvelope> } },
 *   disconnect: () => Promise<unknown>,
 * }} SdkSession
 * @typedef {{ start: () => Promise<unknown>, stop: () => Promise<unknown>, createSession: (options: object) => Promise<SdkSession> }} SdkClient
 * @typedef {{ CopilotClient: new (options: object) => SdkClient }} CopilotSdkModule
 * @typedef {(request: Record<string, unknown>) => Promise<{ kind: 'approve-once' | 'reject' }>} PermissionDecider
 * @typedef {{
 *   sdk: CopilotSdkModule, sdkPath: string, cwd: string, pluginRoot: string,
 *   permissions: PermissionDecider, log: (line: string) => void,
 *   timings?: { ready?: number, poll?: number }, signal?: AbortSignal,
 * }} SdkHost
 *   sdkPath: the SDK folder, which the CLI's extension process loads; cwd: the working copy;
 *   timings: how long the workflow may take to register, and how often the run is read (ms).
 */

export const SKRAFT_PIPELINE = 'skraft-pipeline'
export const DEFAULT_TIMINGS = Object.freeze({ ready: 45_000, poll: 1000 })
const TERMINAL = new Set(['completed', 'halted', 'paused', 'cancelled', 'error'])
const RUN_STATUSES = new Set(['done', 'blocked', 'waiting', 'refused'])

const REASONS = Object.freeze({
  'sdk-start-failed': 'the Copilot SDK could not start the Copilot CLI; check that copilot runs and is signed in, then run skraft doctor',
  'session-failed': 'the Copilot CLI refused a session in this working copy with the skraft plugin',
  'workflow-unavailable': 'the skraft-pipeline workflow was not registered in time: the skraft extension did not load in the Copilot session',
  'workflow-error': 'the skraft-pipeline run failed in the Copilot session; start skraft-run again to resume it from its journal',
  'workflow-halted': 'the Copilot session halted the skraft-pipeline run; start skraft-run again to resume it from its journal',
  'workflow-cancelled': 'the skraft-pipeline run was cancelled; start skraft-run again to resume it from its journal',
  'unexpected-result': 'the skraft-pipeline run completed without a skraft outcome',
  'run-unreadable': 'the Copilot session stopped answering about the skraft-pipeline run; start skraft-run again to resume it from its journal',
  cancelled: 'stopped before the run ended; start skraft-run again to resume it from its journal',
})

const PAUSED = Object.freeze({
  status: 'waiting', slug: null, phase: null, code: 'paused',
  reason: 'the run waits on a question: see it with skraft status, answer it with skraft decide, then start skraft-run again',
})

/**
 * Starts the Copilot CLI through the SDK, runs the workflow in a session, and stops the CLI.
 * @param {SdkHost} host @param {WorkflowArgs} args @returns {Promise<SdkOutcome>}
 */
export const runPipelineThroughSdk = async (host, args) => {
  const client = new host.sdk.CopilotClient({ logLevel: 'error' })
  try {
    return (await succeeds(() => client.start())) ? await inSession(host, client, args) : failed('sdk-start-failed')
  } finally {
    await succeeds(() => client.stop())
  }
}

/**
 * @param {SdkHost} host @param {SdkClient} client @param {WorkflowArgs} args
 * @returns {Promise<SdkOutcome>}
 */
const inSession = async (host, client, args) => {
  const session = await valueOf(() => client.createSession(sessionOptions(host)))
  if (session === null) return failed('session-failed')
  try {
    return await followed(host, session, await startedRun(host, session, args))
  } finally {
    await succeeds(() => session.disconnect())
  }
}

/** @param {SdkHost} host */
const sessionOptions = ({ sdkPath, cwd, pluginRoot, permissions }) => ({
  extensionSdkPath: sdkPath,
  workingDirectory: cwd,
  pluginDirectories: [pluginRoot],
  requestExtensions: true,
  onPermissionRequest: permissions,
})

/**
 * The run's first envelope, asked until the extension has registered the workflow; null when
 * the time runs out or the run is stopped.
 * @param {SdkHost} host @param {SdkSession} session @param {WorkflowArgs} args
 * @returns {Promise<RunEnvelope | null>}
 */
const startedRun = async (host, session, args) => {
  const deadline = Date.now() + timingsOf(host).ready
  for (;;) {
    const envelope = await valueOf(() => session.rpc.workflow.run({ name: SKRAFT_PIPELINE, args }))
    if (envelope !== null || Date.now() >= deadline || host.signal?.aborted) return envelope
    await pause(timingsOf(host).poll)
  }
}

/**
 * Reads the run until its status is terminal, saying each status it moves to.
 * @param {SdkHost} host @param {SdkSession} session @param {RunEnvelope | null} first
 * @returns {Promise<SdkOutcome>}
 */
const followed = async (host, session, first) => {
  if (first === null) return failed(host.signal?.aborted ? 'cancelled' : 'workflow-unavailable')
  host.log(statusLine(first.status))
  let envelope = first
  while (!TERMINAL.has(envelope.status)) {
    const read = await readAgain(host, session, envelope)
    if ('outcome' in read) return read.outcome
    envelope = read.envelope
  }
  return outcomeOf(envelope)
}

/**
 * The run read again after a pause, under its first run id; an outcome when the run is stopped
 * or cannot be read.
 * @param {SdkHost} host @param {SdkSession} session @param {RunEnvelope} envelope
 * @returns {Promise<{ envelope: RunEnvelope } | { outcome: SdkOutcome }>}
 */
const readAgain = async (host, session, { runId, status }) => {
  if (host.signal?.aborted) return { outcome: failed('cancelled') }
  await pause(timingsOf(host).poll)
  const read = await valueOf(() => session.rpc.workflow.getRun({ runId: /** @type {string} */ (runId) }))
  if (read === null) return { outcome: failed('run-unreadable') }
  if (read.status !== status) host.log(statusLine(read.status))
  return { envelope: { ...read, runId } }
}

/** @param {string} status */
const statusLine = (status) => `skraft-run: ${SKRAFT_PIPELINE} ${status}`

/**
 * The run's end as skraft says it: the engine's outcome when it completed, a question when it
 * paused, else the host's status.
 * @param {RunEnvelope} envelope @returns {SdkOutcome}
 */
const outcomeOf = ({ status, result }) => {
  if (status === 'paused') return { ...PAUSED }
  if (status !== 'completed') return failed(/** @type {keyof typeof REASONS} */ (`workflow-${status}`))
  return isRunOutcome(result) ? runOutcome(result) : failed('unexpected-result')
}

/** @param {unknown} value @returns {value is RunOutcome} */
const isRunOutcome = (value) => {
  const outcome = /** @type {Record<string, unknown> | null} */ (value)
  return typeof outcome === 'object' && outcome !== null && RUN_STATUSES.has(/** @type {string} */ (outcome.status)) && typeof outcome.reason === 'string'
}

/** The fields of a skraft outcome, and only those. @param {RunOutcome} outcome @returns {SdkOutcome} */
const runOutcome = ({ status, slug, phase, code, reason }) => ({ status, slug, phase, code, reason })

/** @param {keyof typeof REASONS} code @returns {SdkOutcome} */
const failed = (code) => ({ status: 'error', slug: null, phase: null, code, reason: REASONS[code] })

/** @param {SdkHost} host */
const timingsOf = ({ timings }) => ({ ...DEFAULT_TIMINGS, ...timings })

/** @param {number} ms */
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/** Whether the call settled without an error. @param {() => Promise<unknown>} call */
const succeeds = async (call) => (await valueOf(async () => (await call(), true))) === true

/**
 * What the call answers; null when it fails.
 * @template T @param {() => Promise<T>} call @returns {Promise<T | null>}
 */
const valueOf = async (call) => {
  try {
    return await call()
  } catch {
    return null
  }
}

/**
 * How the terminal answers each permission a skraft agent asks for: every one approved once
 * with `allowAll`, else the person is asked; no answer is a rejection.
 * @param {{ allowAll: boolean, confirm: (question: string) => Promise<boolean> }} options
 * @returns {PermissionDecider}
 */
export const permissionDecider = ({ allowAll, confirm }) => async (request) => {
  if (allowAll || (await valueOf(() => confirm(permissionQuestion(request)))) === true) return { kind: 'approve-once' }
  return { kind: 'reject' }
}

/**
 * The question for one permission: its kind and what it acts on, as the SDK's request types
 * name it (SDK 1.0.102-1 typings, not measured).
 * @param {Record<string, unknown>} request
 */
export const permissionQuestion = (request) => {
  const subject = [request.fullCommandText, request.fileName, request.path, request.url, request.toolName].find((value) => typeof value === 'string')
  return `skraft-run: allow ${typeof request.kind === 'string' ? request.kind : 'a tool'}${subject === undefined ? '' : `: ${subject}`}? [y/N] `
}
