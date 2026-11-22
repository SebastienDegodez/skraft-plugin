import { composeCell, libraryLines } from '../../domain/repl/cell-result.mjs'
import { refusalText } from '../../domain/repl/refusals.mjs'
import { signingKeyOf } from '../evidence/run-trace-store.mjs'
import { closeLostRuns, nextRunId, traceAbsent } from './repl-trace.mjs'
import { keepUnexpected } from './repl-unexpected.mjs'
import { bindAttempt, heldElsewhere, releaseLease, renewLease, takeLease } from './repl-attempt.mjs'
import { endRuns, killRun, liveRuns, recordProcesses, serveRun } from './repl-runs.mjs'

/**
 * The REPL of an agent's attempt, `skraft_repl`: a JavaScript kernel, one per attempt, whose cells
 * start the project's commands through `run()`. The MCP server holds the state between calls
 * (`state.entry`): the kernel is started on the first call of an attempt and ended when the
 * attempt closes, when another attempt calls, after 15 minutes idle, or when the server closes.
 *
 * @typedef {import('./repl-runs.mjs').Entry} Entry
 * @typedef {{ launched: boolean, cancelled: boolean }} Flight
 *   a call between its start and the start of its cell: a cancellation in that window is kept, so that the cell never runs.
 * @typedef {{ entry: Entry | null, reaped: boolean, flights?: Map<unknown, Flight>, starting?: Promise<unknown>, ended?: string, ending?: Entry[] }} ReplState
 *   flights: the calls in flight, by the id of their request; starting: the entry being looked
 *   up, started or ended, which the next change waits for, so that two calls at once share one kernel;
 *   ended: the key of the last kernel ended, whose next call is told its variables are gone;
 *   ending: the kernels ended whose runs still run past the end's wait.
 * @typedef {{ ok: boolean, code: string | null, text: string }} ReplOutcome
 *   text: what the agent reads: the cell's result, or the refusal's code and fixed reason.
 */

/** How long a cell is awaited before the call answers; the cell goes on after it. */
const DEFAULT_BUDGET_MS = 90_000
/** How long an attempt's kernel may stay unused, with no run alive, before it is ended. */
const IDLE_MS = 15 * 60 * 1000
/** How long ending a kernel waits for its runs to be over. */
const RETIRE_WAIT_MS = 10_000
/** How long a cell may run: the longest run, 7200 s, and a minute more. */
const CELL_MS = 7_260_000

/**
 * @param {any} deps @param {ReplState} state
 */
export const createRepl = (deps, state) => Object.freeze({
  /** @param {{ code: string, id?: unknown }} request id: the request's, which a cancellation names @returns {Promise<ReplOutcome>} */
  call: (request) => call(deps, state, request),
  /** `skraft_repl_reset`: ends the kernel of the open attempt and its runs, even mid-cell; the next call starts a fresh one. @returns {Promise<ReplOutcome>} */
  reset: () => resetAttempt(deps, state),
  /** Ends the kernel of an attempt that is over or unused; the server calls it every half minute. */
  sweep: () => serially(state, () => sweepKept(deps, state)),
  /** The request is cancelled: its awaits stop and the runs it started end. @param {unknown} [id] */
  interrupt: (id) => interrupt(state, id),
  /** The session closes: nothing is left running. */
  close: () => serially(state, () => retire(deps, state)),
})

/** An attempt of one working copy: the key a kernel is held under. @param {any} deps @param {{ slug: string, folder: string }} bound */
const keyOf = (deps, { slug, folder }) => `${deps.repl.root}|${slug}/${folder}`

/** @param {string} code @param {string | null} [evidence] the file that holds the exception @returns {ReplOutcome} */
const refused = (code, evidence = null) => ({ ok: false, code, text: refusalText(code, evidence) })

/** @param {string} code @returns {ReplOutcome} what a call did, said by a fixed text */
const said = (code) => ({ ok: true, code, text: refusalText(code) })

/**
 * The flight of a request: the one the server opened when the request arrived, else a new one.
 * @param {ReplState} state @param {unknown} id @returns {Flight}
 */
export const openFlight = (state, id) => {
  state.flights ??= new Map()
  const flight = state.flights.get(id) ?? { launched: false, cancelled: false }
  state.flights.set(id, flight)
  return flight
}

/** @param {any} deps @param {ReplState} state @param {{ code: string, id?: unknown }} request @returns {Promise<ReplOutcome>} */
const call = async (deps, state, { code, id }) => {
  const flight = openFlight(state, id)
  try {
    return await inAttempt(deps, state, { code, flight })
  } finally {
    state.flights?.delete(id)
  }
}

/** @param {any} deps @param {ReplState} state @param {{ code: string, flight: Flight }} request @returns {Promise<ReplOutcome>} */
const inAttempt = async (deps, state, request) => {
  const bound = await bindAttempt(deps)
  if (!bound.ok) return refused(bound.code)
  try {
    return await inEntry(deps, state, bound, request)
  } catch (error) {
    return refused('repl-unexpected', await keepUnexpected(deps, bound.slug, error))
  }
}

/** @param {any} deps @param {ReplState} state @param {import('./repl-attempt.mjs').Bound & { ok: true }} bound @param {{ code: string, flight: Flight }} request @returns {Promise<ReplOutcome>} */
const inEntry = async (deps, state, bound, request) => {
  const held = await entryFor(deps, state, bound)
  if (!held.ok) return refused(held.code, held.evidence ?? null)
  return evaluate(deps, held.entry, request, held.notice)
}

/**
 * A reset is bound to the open attempt and waits for no cell: it waits only for a kernel being
 * started or ended, and the cell in flight answers repl-reset.
 * @param {any} deps @param {ReplState} state @returns {Promise<ReplOutcome>}
 */
const resetAttempt = async (deps, state) => {
  const bound = await bindAttempt(deps)
  if (!bound.ok) return refused(bound.code)
  try {
    return await serially(state, () => resetNow(deps, state, bound))
  } catch (error) {
    return refused('repl-unexpected', await keepUnexpected(deps, bound.slug, error))
  }
}

/** @param {any} deps @param {ReplState} state @param {import('./repl-attempt.mjs').Bound & { ok: true }} bound @returns {Promise<ReplOutcome>} */
const resetNow = async (deps, state, bound) => {
  const entry = state.entry
  if (entry !== null && entry.key === keyOf(deps, bound)) return endOnRequest(deps, state, entry)
  if (await heldElsewhere(deps, bound)) return refused('repl-held-elsewhere')
  return said('repl-no-kernel')
}

/** @param {any} deps @param {ReplState} state @param {Entry} entry @returns {Promise<ReplOutcome>} */
const endOnRequest = async (deps, state, entry) => {
  entry.endedBy = 'repl-reset'
  await retire(deps, state)
  return said('repl-reset')
}

/**
 * The entry of the attempt, one call after the other: a call that arrives while another starts
 * the kernel waits for it and shares it.
 * @param {any} deps @param {ReplState} state @param {import('./repl-attempt.mjs').Bound & { ok: true }} bound
 * @returns {Promise<{ ok: true, entry: Entry, notice: string | null } | { ok: false, code: string, evidence?: string | null }>}
 */
const entryFor = (deps, state, bound) => serially(state, () => entryNow(deps, state, bound))

/**
 * One change of the entry after the other: a start, the end the sweep or the session asks for.
 * @template T @param {ReplState} state @param {() => Promise<T>} work @returns {Promise<T>}
 */
const serially = (state, work) => {
  const done = (state.starting ?? Promise.resolve()).then(work)
  state.starting = done.catch(() => undefined)
  return done
}

/**
 * What the next result says first of the kernel it runs in: a kernel that died, or one a reset,
 * the sweep or the session ended since this attempt's last call.
 * @param {ReplState} state @param {string} key
 */
const noticeOf = (state, key) => {
  const current = state.entry
  if (current !== null) return current.key === key ? current.gone : null
  return state.ended === key ? 'repl-fresh' : null
}

/**
 * The entry of the attempt: the one in place, or a kernel started now, once the lease on the
 * attempt is held. A call of another attempt ends the kernel of the earlier one.
 * @param {any} deps @param {ReplState} state @param {import('./repl-attempt.mjs').Bound & { ok: true }} bound
 * @returns {Promise<{ ok: true, entry: Entry, notice: string | null } | { ok: false, code: string, evidence?: string | null }>}
 */
const entryNow = async (deps, state, bound) => {
  const key = keyOf(deps, bound)
  const current = state.entry
  if (current !== null && current.key === key && current.gone === null) return { ok: true, entry: current, notice: null }
  const notice = noticeOf(state, key)
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
  entry.told = await firstLines(deps, entry, stillEnding(state))
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
    const firstRid = await nextRunId(deps, entry)
    entry.topRid = firstRid - 1
    entry.kernel = await deps.repl.kernels.start(eventsOf(deps, entry), deps.repl.root, { firstRid })
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
  onKill: (rid, signal, graceSeconds) => killRun(entry, { rid, signal, graceSeconds }),
  onAbsent: (notice) => { track(entry, traceAbsent(deps, entry, notice)) },
  onGone: (why) => { entry.gone = `repl-${why}`; endRuns(entry, 'SIGKILL', 0) },
})

/** The entry in place, taken off the state and marked as ending; null when none. @param {ReplState} state @returns {Entry | null} */
const detach = (state) => {
  const entry = state.entry
  if (entry === null) return null
  Object.assign(state, { entry: null, ended: entry.key })
  entry.retired = true
  return entry
}

/** Ends the entry in place: its runs, its kernel, its lease. @param {any} deps @param {ReplState} state */
const retire = async (deps, state) => {
  const entry = detach(state)
  if (entry === null) return
  endRuns(entry, 'SIGKILL', 0)
  entry.kernel.stop()
  await settledWithin(deps, entry.pending, RETIRE_WAIT_MS)
  if (liveRuns(entry).length > 0) state.ending = [...(state.ending ?? []), entry]
  await entry.recording
  await deps.repl.orphans.forget(deps.repl.server.pid)
  await releaseLease(deps, entry, entry.lease)
}

/**
 * The runs in flight are awaited until they are over or the time is spent: a program that does
 * not close after its SIGKILL never holds the end of the kernel.
 * @param {any} deps @param {Set<Promise<void>>} pending @param {number} ms
 */
const settledWithin = (deps, pending, ms) => new Promise((resolve) => {
  const stop = deps.timer.every(ms, () => { stop(); resolve(undefined) })
  void Promise.allSettled([...pending]).then(() => { stop(); resolve(undefined) })
})

/** @param {any} deps @param {Entry} entry @param {{ code: string, flight: Flight }} request @param {string | null} notice @returns {Promise<ReplOutcome>} */
const evaluate = async (deps, entry, { code, flight }, notice) => {
  if (flight.cancelled) return refused('repl-interrupted')
  flight.launched = true
  const startedAt = (entry.lastUsed = deps.clock.now().getTime())
  const budget = deps.repl.budgetMs ?? DEFAULT_BUDGET_MS
  const waiting = code.trim() === ''
  const outcome = waiting ? await entry.kernel.wait(budget) : await entry.kernel.evaluate(code, budget)
  if (outcome.status === 'busy') return refused('repl-busy')
  if (!waiting) entry.cells += 1
  entry.cellSince = cellSince(entry, outcome, waiting ? null : startedAt)
  return present(deps, entry, outcome, notice)
}

/**
 * Since when the cell in flight runs: the start of a cell still running, kept across the waits
 * for it; null once it has ended.
 * @param {Entry} entry @param {import('../ports/kernel-host.mjs').CellOutcome} outcome @param {number | null} startedAt null when the call waited
 */
const cellSince = (entry, outcome, startedAt) => {
  if (outcome.status !== 'running') return null
  return startedAt ?? entry.cellSince ?? null
}

/** @param {any} deps @param {Entry} entry @param {import('../ports/kernel-host.mjs').CellOutcome} outcome @param {string | null} notice @returns {Promise<ReplOutcome>} */
const present = async (deps, entry, outcome, notice) => {
  const cellLog = `${entry.folder}/cell-${entry.cells}.log`
  const { text, cut } = composeCell(partsOf(entry, outcome, cellLog))
  if (cut) await deps.files.write(entry.slug, cellLog, outcome.printed)
  const lost = lostOf(entry, outcome)
  const heading = [lost ?? notice].filter((code) => code !== null).map((code) => refusalText(code))
  const lines = [...(await traceNotice(deps, entry)), ...heading, ...toldOnce(entry), text]
  return { ok: lost === null, code: lost, text: lines.join('\n') }
}

/**
 * Why the kernel the cell ran in is gone: it would not stop, it crashed, or a reset ended it;
 * null while it serves.
 * @param {Entry} entry @param {import('../ports/kernel-host.mjs').CellOutcome} outcome @returns {string | null}
 */
const lostOf = (entry, outcome) => {
  if (outcome.status === 'restarted' || outcome.status === 'crashed') return `repl-${outcome.status}`
  return outcome.status === 'stopped' ? entry.endedBy ?? null : null
}

/**
 * What a kernel just started tells first: what it loaded of the project's REPL library, and the
 * runs a gone server left open in the attempt, closed now as lost.
 * @param {any} deps @param {Entry} entry @param {Set<number>} still the runs this server still ends @returns {Promise<string[]>}
 */
const firstLines = async (deps, entry, still) => {
  const lost = await closeLostRuns(deps, entry, still)
  return [...libraryLines(entry.kernel.lib ?? { loaded: [], failed: [] }), ...lost.map((run) => `r${run} lost with the server that started it`)]
}

/**
 * The runs of the kernels this server ended that still run past the end's wait: they are this
 * server's, and their lines will come.
 * @param {ReplState} state @returns {Set<number>}
 */
const stillEnding = (state) => {
  state.ending = (state.ending ?? []).filter((ended) => liveRuns(ended).length > 0)
  return new Set(state.ending.flatMap((ended) => liveRuns(ended).map((run) => run.id)))
}

/** What the first result of a kernel tells, once. @param {Entry} entry */
const toldOnce = (entry) => {
  const told = entry.told ?? []
  entry.told = []
  return told
}

/**
 * Once a line of the trace or a log could not be written, every result says so first; the error
 * goes to the run's unexpected.log, which the notice names.
 * @param {any} deps @param {Entry} entry @returns {Promise<string[]>}
 */
const traceNotice = async (deps, entry) => {
  if (entry.traceError === undefined) return []
  entry.traceFailed ??= await keepUnexpected(deps, entry.slug, entry.traceError)
  return [refusalText('repl-trace-failed', entry.traceFailed)]
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

/** A request not launched yet never launches its cell; a launched one interrupts it. @param {ReplState} state @param {unknown} [id] */
export const interrupt = (state, id) => {
  const flight = state.flights?.get(id)
  if (flight !== undefined && !flight.launched) flight.cancelled = true
  else interruptCell(state)
}

/** @param {ReplState} state */
const interruptCell = (state) => {
  const entry = state.entry
  if (entry === null) return
  entry.kernel.interrupt()
  for (const run of liveRuns(entry)) if (run.cell === entry.cells + 1 || run.cell === entry.cells) run.program?.kill('SIGTERM', 1000)
}

/**
 * The sweep never rejects: an exception of its own goes to the run's unexpected.log, and the next
 * sweep tries again.
 * @param {any} deps @param {ReplState} state
 */
const sweepKept = async (deps, state) => {
  const slug = state.entry?.slug
  try {
    await sweep(deps, state)
  } catch (error) {
    if (slug !== undefined) await keepUnexpected(deps, slug, error).catch(() => undefined)
  }
}

/** @param {any} deps @param {ReplState} state */
const sweep = async (deps, state) => {
  const entry = state.entry
  if (entry === null) return
  const bound = await bindAttempt(deps)
  const open = bound.ok && keyOf(deps, bound) === entry.key
  if (!open || isIdle(deps, entry)) return retire(deps, state)
  endOverdueCell(deps, state, entry)
  await renew(deps, state, entry)
}

/** Unused for 15 minutes, with no cell in flight and no run alive. @param {any} deps @param {Entry} entry */
const isIdle = (deps, entry) => deps.clock.now().getTime() - entry.lastUsed > IDLE_MS && entry.cellSince == null && liveRuns(entry).length === 0

/**
 * A cell that has run past its limit is interrupted; the kernel ends it if it still runs three
 * seconds later, and the next call is told the kernel was restarted.
 * @param {any} deps @param {ReplState} state @param {Entry} entry
 */
const endOverdueCell = (deps, state, entry) => {
  if (entry.cellSince == null || deps.clock.now().getTime() - entry.cellSince <= CELL_MS) return
  entry.cellSince = null
  interruptCell(state)
}

/** The lease of a kernel kept is renewed; one another server took over ends the kernel. @param {any} deps @param {ReplState} state @param {Entry} entry */
const renew = async (deps, state, entry) => {
  const renewed = await renewLease(deps, entry, entry.lease)
  if (renewed === null) return retire(deps, state)
  entry.lease = renewed
}
