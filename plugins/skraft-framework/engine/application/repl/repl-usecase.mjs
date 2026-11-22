import { composeCell } from '../../domain/repl/cell-result.mjs'
import { refusalText } from '../../domain/repl/refusals.mjs'
import { signingKeyOf } from '../evidence/run-trace-store.mjs'
import { traceAbsent } from './repl-trace.mjs'
import { keepUnexpected } from './repl-unexpected.mjs'
import { bindAttempt, releaseLease, takeLease } from './repl-attempt.mjs'
import { endRuns, liveRuns, recordProcesses, serveRun } from './repl-runs.mjs'

/**
 * The REPL of an agent's attempt, `skraft_repl`: a JavaScript kernel, one per attempt, whose cells
 * start the project's commands through `run()`. The MCP server holds the state between calls
 * (`state.entry`): the kernel is started on the first call of an attempt and ended when the
 * attempt closes, when another attempt calls, after 15 minutes idle, or when the server closes.
 *
 * @typedef {import('./repl-runs.mjs').Entry} Entry
 * @typedef {{ launched: boolean, cancelled: boolean }} Flight
 *   a call between its start and the start of its cell: a cancellation in that window is kept, so that the cell never runs.
 * @typedef {{ entry: Entry | null, reaped: boolean, flight?: Flight | null }} ReplState
 * @typedef {{ ok: boolean, code: string | null, text: string }} ReplOutcome
 *   text: what the agent reads: the cell's result, or the refusal's code and fixed reason.
 */

/** How long a cell is awaited before the call answers; the cell goes on after it. */
const DEFAULT_BUDGET_MS = 90_000
/** How long an attempt's kernel may stay unused, with no run alive, before it is ended. */
const IDLE_MS = 15 * 60 * 1000

/**
 * @param {any} deps @param {ReplState} state
 */
export const createRepl = (deps, state) => Object.freeze({
  /** @param {{ code: string }} request @returns {Promise<ReplOutcome>} */
  call: (request) => call(deps, state, request),
  /** Ends the kernel of an attempt that is over or unused; the server calls it every half minute. */
  sweep: () => sweep(deps, state),
  /** The request in flight is cancelled: its awaits stop and the runs it started end. */
  interrupt: () => interrupt(state),
  /** The session closes: nothing is left running. */
  close: () => retire(deps, state),
})

/** An attempt of one working copy: the key a kernel is held under. @param {any} deps @param {{ slug: string, folder: string }} bound */
const keyOf = (deps, { slug, folder }) => `${deps.repl.root}|${slug}/${folder}`

/** @param {string} code @param {string | null} [evidence] the file that holds the exception @returns {ReplOutcome} */
const refused = (code, evidence = null) => ({ ok: false, code, text: refusalText(code, evidence) })

/** @param {any} deps @param {ReplState} state @param {{ code: string }} request @returns {Promise<ReplOutcome>} */
const call = async (deps, state, { code }) => {
  state.flight ??= { launched: false, cancelled: false }
  try {
    return await inAttempt(deps, state, code)
  } finally {
    state.flight = null
  }
}

/** @param {any} deps @param {ReplState} state @param {string} code @returns {Promise<ReplOutcome>} */
const inAttempt = async (deps, state, code) => {
  const bound = await bindAttempt(deps)
  if (!bound.ok) return refused(bound.code)
  try {
    return await inEntry(deps, state, bound, code)
  } catch (error) {
    return refused('repl-unexpected', await keepUnexpected(deps, bound.slug, error))
  }
}

/** @param {any} deps @param {ReplState} state @param {import('./repl-attempt.mjs').Bound & { ok: true }} bound @param {string} code @returns {Promise<ReplOutcome>} */
const inEntry = async (deps, state, bound, code) => {
  const held = await entryFor(deps, state, bound)
  if (!held.ok) return refused(held.code, held.evidence ?? null)
  return evaluate(deps, state, held.entry, code, held.notice)
}

/**
 * The entry of the attempt: the one in place, or a kernel started now, once the lease on the
 * attempt is held. A call of another attempt ends the kernel of the earlier one.
 * @param {any} deps @param {ReplState} state @param {import('./repl-attempt.mjs').Bound & { ok: true }} bound
 * @returns {Promise<{ ok: true, entry: Entry, notice: string | null } | { ok: false, code: string, evidence?: string | null }>}
 */
const entryFor = async (deps, state, bound) => {
  const key = keyOf(deps, bound)
  const current = state.entry
  if (current !== null && current.key === key && current.gone === null) return { ok: true, entry: current, notice: null }
  const notice = current !== null && current.key === key ? current.gone : null
  await retire(deps, state)
  const started = await startEntry(deps, state, { ...bound, key })
  return started.ok ? { ok: true, entry: started.entry, notice } : started
}

/** @param {any} deps @param {ReplState} state @param {{ slug: string, folder: string, key: string }} bound */
const startEntry = async (deps, state, bound) => {
  await reapOnce(deps, state)
  const lease = await takeLease(deps, bound)
  if (lease === null) return notStarted('repl-held-elsewhere')
  const entry = await newEntry(deps, bound, lease)
  const failure = await startKernel(deps, entry)
  if (failure !== null) return kernelFailed(deps, bound, { lease, error: failure.error })
  state.entry = entry
  return { ok: /** @type {const} */ (true), entry }
}

/** @param {any} deps @param {{ slug: string, folder: string, key: string, events: any[] }} bound @param {string} lease @returns {Promise<Entry>} */
const newEntry = async (deps, bound, lease) => /** @type {Entry} */ ({ ...bound, lease, runs: new Map(), cells: 0, lastUsed: deps.clock.now().getTime(), gone: null, pending: new Set(), signingKey: await signingKeyOf(deps, bound.events), chain: Promise.resolve() })

/** The kernel did not start: the lease is given back and the run's unexpected.log holds why. @param {any} deps @param {{ slug: string, folder: string }} bound @param {{ lease: string, error: unknown }} failure */
const kernelFailed = async (deps, bound, { lease, error }) => {
  await releaseLease(deps, bound, lease)
  return notStarted('repl-failed', await keepUnexpected(deps, bound.slug, error))
}

/** @param {string} code @param {string | null} [evidence] */
const notStarted = (code, evidence = null) => ({ ok: /** @type {const} */ (false), code, evidence })

/** A server starting its first kernel ends what a server killed before it left running. @param {any} deps @param {ReplState} state */
const reapOnce = async (deps, state) => {
  if (state.reaped) return
  state.reaped = true
  await deps.repl.orphans.reap()
}

/**
 * @param {any} deps @param {Entry} entry @returns {Promise<{ error: unknown } | null>} null when the kernel started;
 *   a kernel started and not recorded is ended
 */
const startKernel = async (deps, entry) => {
  try {
    entry.kernel = await deps.repl.kernels.start(eventsOf(deps, entry), deps.repl.root)
    await recordProcesses(deps, entry)
    return null
  } catch (error) {
    entry.kernel?.stop()
    return { error }
  }
}

/** A run in flight is kept until it is over, so that closing the entry waits for it. @param {Entry} entry @param {Promise<void>} work */
const track = (entry, work) => {
  entry.pending.add(work)
  void work.finally(() => entry.pending.delete(work))
}

/** What the kernel asks of this server. @param {any} deps @param {Entry} entry @returns {import('../ports/kernel-host.mjs').KernelEvents} */
const eventsOf = (deps, entry) => ({
  onRun: (request) => track(entry, serveRun(deps, entry, request)),
  onKill: (rid, signal, graceSeconds) => entry.runs.get(rid)?.program?.kill(signal, graceSeconds * 1000),
  onAbsent: (notice) => { track(entry, traceAbsent(deps, entry, notice)) },
  onGone: (why) => { entry.gone = `repl-${why}`; endRuns(entry, 'SIGKILL', 0) },
})

/** Ends the entry in place: its runs, its kernel, its lease. @param {any} deps @param {ReplState} state */
const retire = async (deps, state) => {
  const entry = state.entry
  if (entry === null) return
  state.entry = null
  endRuns(entry, 'SIGKILL', 0)
  entry.kernel.stop()
  await Promise.allSettled([...entry.pending])
  await deps.repl.orphans.forget(deps.repl.server.pid)
  await releaseLease(deps, entry, entry.lease)
}

/** @param {any} deps @param {ReplState} state @param {Entry} entry @param {string} code @param {string | null} notice @returns {Promise<ReplOutcome>} */
const evaluate = async (deps, state, entry, code, notice) => {
  if (state.flight?.cancelled === true) return refused('repl-interrupted')
  if (state.flight != null) state.flight.launched = true
  entry.lastUsed = deps.clock.now().getTime()
  const budget = deps.repl.budgetMs ?? DEFAULT_BUDGET_MS
  const waiting = code.trim() === ''
  const outcome = waiting ? await entry.kernel.wait(budget) : await entry.kernel.evaluate(code, budget)
  if (outcome.status === 'busy') return refused('repl-busy')
  if (!waiting) entry.cells += 1
  return present(deps, entry, outcome, notice)
}

/** @param {any} deps @param {Entry} entry @param {import('../ports/kernel-host.mjs').CellOutcome} outcome @param {string | null} notice @returns {Promise<ReplOutcome>} */
const present = async (deps, entry, outcome, notice) => {
  const cellLog = `${entry.folder}/cell-${entry.cells}.log`
  const { text, cut } = composeCell(partsOf(entry, outcome, cellLog))
  if (cut) await deps.files.write(entry.slug, cellLog, outcome.printed)
  const lost = ['restarted', 'crashed'].includes(outcome.status) ? `repl-${outcome.status}` : null
  const heading = [lost ?? notice].filter((code) => code !== null).map((code) => refusalText(code))
  return { ok: lost === null, code: lost, text: [...heading, text].join('\n') }
}

/** @param {Entry} entry @param {import('../ports/kernel-host.mjs').CellOutcome} outcome @param {string} cellLog */
const partsOf = (entry, outcome, cellLog) => {
  const all = [...entry.runs.values()]
  const finished = all.filter((run) => run.status === 'finished' && !run.reported && run.cell !== entry.cells)
  const runs = all.filter((run) => run.cell === entry.cells)
  for (const run of [...finished, ...runs]) run.reported = run.status === 'finished'
  const still = outcome.status === 'running' ? '\n[the cell still runs: call skraft_repl with empty code to wait for it]' : ''
  return { finished, runs, printed: `${outcome.printed}${still}`, value: outcome.value, error: outcome.error, status: outcome.status, cellLog }
}

/** @param {ReplState} state */
export const interrupt = (state) => {
  const flight = state.flight
  if (flight != null && !flight.launched) flight.cancelled = true
  else interruptCell(state)
}

/** @param {ReplState} state */
const interruptCell = (state) => {
  const entry = state.entry
  if (entry === null) return
  entry.kernel.interrupt()
  for (const run of liveRuns(entry)) if (run.cell === entry.cells + 1 || run.cell === entry.cells) run.program?.kill('SIGTERM', 1000)
}

/** @param {any} deps @param {ReplState} state */
const sweep = async (deps, state) => {
  const entry = state.entry
  if (entry === null) return
  const bound = await bindAttempt(deps)
  const open = bound.ok && keyOf(deps, bound) === entry.key
  const idle = deps.clock.now().getTime() - entry.lastUsed > IDLE_MS && liveRuns(entry).length === 0
  if (!open || idle) await retire(deps, state)
}
