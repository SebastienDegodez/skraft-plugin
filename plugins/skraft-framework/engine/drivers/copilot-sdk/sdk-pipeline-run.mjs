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
 *   timings?: { ready?: number, poll?: number, rpc?: number, follow?: number }, signal?: AbortSignal,
 * }} SdkHost
 *   sdkPath: the SDK folder, which the CLI's extension process loads; cwd: the working copy;
 *   timings (ms): how long the workflow may take to register, how often the run is read, how
 *   long one call to the SDK may take, how long the run may be followed.
 */

export const SKRAFT_PIPELINE = 'skraft-pipeline'
export const DEFAULT_TIMINGS = Object.freeze({ ready: 45_000, poll: 1000, rpc: 30_000, follow: 12 * 60 * 60_000 })
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
  'workflow-refused': 'the Copilot session refused to start the skraft-pipeline run',
  'rpc-timeout': 'the Copilot session did not answer a call in time; start skraft-run again to resume the run from its journal',
  'run-too-long': 'the skraft-pipeline run outlasted the time skraft-run follows it; start skraft-run again to resume it from its journal',
  cancelled: 'stopped before the run ended; start skraft-run again to resume it from its journal',
})

/** The host's answer to a workflow that is not registered yet (Copilot CLI 1.0.101-0, host probe `bad-tool-name-isolation`). */
const NOT_REGISTERED = /no workflow registered/i

/** A call to the SDK that did not settle in time. */
class RpcTimeout extends Error {}

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
    const started = await called(host, () => client.start())
    return started.ok ? await inSession(host, client, args) : failed(failureOf(started.error, 'sdk-start-failed'))
  } finally {
    await called(host, () => client.stop())
  }
}

/**
 * @param {SdkHost} host @param {SdkClient} client @param {WorkflowArgs} args
 * @returns {Promise<SdkOutcome>}
 */
const inSession = async (host, client, args) => {
  const session = await called(host, () => client.createSession(sessionOptions(host)))
  if (!session.ok) return failed(failureOf(session.error, 'session-failed'))
  try {
    const first = await startedRun(host, session.value, args)
    return 'outcome' in first ? first.outcome : await followed(host, session.value, first.envelope)
  } finally {
    await called(host, () => session.value.disconnect())
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
 * The run's first envelope, asked again only while the host answers that the extension has not
 * registered the workflow yet; any other refusal, the time running out or a stop is an outcome.
 * @param {SdkHost} host @param {SdkSession} session @param {WorkflowArgs} args
 * @returns {Promise<{ envelope: RunEnvelope } | { outcome: SdkOutcome }>}
 */
const startedRun = async (host, session, args) => {
  const deadline = Date.now() + timingsOf(host).ready
  for (;;) {
    const run = await called(host, () => session.rpc.workflow.run({ name: SKRAFT_PIPELINE, args }))
    if (run.ok) return { envelope: run.value }
    const stopped = notStartedYet(host, run.error, deadline)
    if (stopped !== null) return { outcome: failed(stopped) }
    await pause(timingsOf(host).poll)
  }
}

/**
 * Why a refused start ends the run: the run stopped, another refusal than "not registered", or
 * no registration in time; null to ask again.
 * @param {SdkHost} host @param {unknown} error @param {number} deadline
 * @returns {keyof typeof REASONS | null}
 */
const notStartedYet = (host, error, deadline) => {
  if (host.signal?.aborted) return 'cancelled'
  if (!NOT_REGISTERED.test(messageOf(error))) return failureOf(error, 'workflow-refused')
  return Date.now() >= deadline ? 'workflow-unavailable' : null
}

/**
 * Reads the run until its status is terminal, saying each status it moves to, for as long as
 * skraft-run follows a run.
 * @param {SdkHost} host @param {SdkSession} session @param {RunEnvelope} first
 * @returns {Promise<SdkOutcome>}
 */
const followed = async (host, session, first) => {
  host.log(statusLine(first.status))
  const following = { envelope: first, misses: 0, deadline: Date.now() + timingsOf(host).follow }
  while (!TERMINAL.has(following.envelope.status)) {
    const stopped = await readAgain(host, session, following)
    if (stopped !== null) return stopped
  }
  return outcomeOf(following.envelope)
}

/**
 * Reads the run again after a pause, under its first run id; one failed read in a row is
 * forgiven. An outcome when the run is stopped, outlasts its deadline or cannot be read.
 * @param {SdkHost} host @param {SdkSession} session
 * @param {{ envelope: RunEnvelope, misses: number, deadline: number }} following
 * @returns {Promise<SdkOutcome | null>}
 */
const readAgain = async (host, session, following) => {
  if (host.signal?.aborted) return failed('cancelled')
  if (Date.now() >= following.deadline) return failed('run-too-long')
  await pause(timingsOf(host).poll)
  const runId = /** @type {string} */ (following.envelope.runId)
  const read = await called(host, () => session.rpc.workflow.getRun({ runId }))
  if (!read.ok) return missed(following, read.error)
  following.misses = 0
  if (read.value.status !== following.envelope.status) host.log(statusLine(read.value.status))
  following.envelope = { ...read.value, runId }
  return null
}

/**
 * A failed read: forgiven once in a row, else the end of the run.
 * @param {{ misses: number }} following @param {unknown} error @returns {SdkOutcome | null}
 */
const missed = (following, error) => {
  following.misses += 1
  return following.misses > 1 ? failed(failureOf(error, 'run-unreadable')) : null
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

/**
 * A call to the SDK, bounded by the RPC timeout: what it answers, or the error it failed with.
 * @template T @param {SdkHost} host @param {() => Promise<T>} call
 * @returns {Promise<{ ok: true, value: T } | { ok: false, error: unknown }>}
 */
const called = async (host, call) => {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new RpcTimeout()), timingsOf(host).rpc) })
  try {
    return { ok: true, value: await Promise.race([call(), timeout]) }
  } catch (error) {
    return { ok: false, error }
  } finally {
    clearTimeout(timer)
  }
}

/** A timed-out call has its own reason; any other failure the step's. @param {unknown} error @param {keyof typeof REASONS} code */
const failureOf = (error, code) => (error instanceof RpcTimeout ? 'rpc-timeout' : code)

/** @param {unknown} error */
const messageOf = (error) => String(/** @type {{ message?: unknown } | null} */ (error)?.message ?? '')

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
